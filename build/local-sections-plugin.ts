import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import type { Plugin } from "vite";

const API_PATH = "/api/sections";
const MAX_REQUEST_BYTES = 512 * 1024;

type LocalSection = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  hotbarSlot?: number;
  description: string;
};

function json(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}

async function bodyJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("板块状态文件超过 512 KB 限制");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function cleanText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${field}格式不正确`);
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (!cleaned || cleaned.length > maxLength) throw new Error(`${field}长度不正确`);
  return cleaned;
}

function normalizeSection(value: unknown): LocalSection {
  if (!value || typeof value !== "object") throw new Error("板块数据格式不正确");
  const source = value as Record<string, unknown>;
  const id = cleanText(source.id, "板块标识", 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("板块标识不合法");
  const icon = cleanText(source.icon, "板块图标", 300);
  if (!icon.startsWith("/minecraft/")) throw new Error("板块图标路径不合法");
  const hotbarSlot = source.hotbarSlot;
  if (hotbarSlot !== undefined && (!Number.isInteger(hotbarSlot) || Number(hotbarSlot) < 1 || Number(hotbarSlot) > 7)) {
    throw new Error("快捷栏位置不合法");
  }
  return {
    id,
    label: cleanText(source.label, "板块名称", 80),
    icon,
    enabled: source.enabled !== false,
    hotbarSlot: hotbarSlot === undefined ? undefined : Number(hotbarSlot),
    description: typeof source.description === "string" ? source.description.trim().slice(0, 500) : "",
  };
}

function normalizeSections(value: unknown) {
  if (!Array.isArray(value) || value.length > 500) throw new Error("板块列表格式不正确");
  const sections = value.map(normalizeSection);
  if (new Set(sections.map((section) => section.id)).size !== sections.length) throw new Error("板块标识不能重复");
  const slots = sections.flatMap((section) => section.hotbarSlot === undefined ? [] : [section.hotbarSlot]);
  if (new Set(slots).size !== slots.length) throw new Error("快捷栏位置不能重复");
  return sections;
}

async function sectionsFileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readSections(filePath: string) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return normalizeSections(Array.isArray(value) ? value : (value as { sections?: unknown })?.sections);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeSections(filePath: string, sections: LocalSection[]) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), sections }, null, 2)}\n`, "utf8");
  try {
    await rename(temporary, filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    await rm(filePath, { force: true });
    await rename(temporary, filePath);
  }
}

export function localSections(): Plugin {
  let filePath = resolve(process.cwd(), "content", "local", "state", "sections.json");
  return {
    name: "minelog-local-sections",
    apply: "serve",
    configResolved(config) {
      filePath = resolve(config.root, "content", "local", "state", "sections.json");
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== API_PATH) return next();
        try {
          if (req.method === "GET") return json(res, 200, { available: true, initialized: await sectionsFileExists(filePath), sections: await readSections(filePath) });
          if (req.method === "PUT") {
            const payload = await bodyJson(req) as { sections?: unknown };
            const sections = normalizeSections(payload.sections);
            await writeSections(filePath, sections);
            return json(res, 200, { available: true, initialized: true, sections });
          }
          res.setHeader("allow", "GET, PUT");
          return json(res, 405, { error: "不支持的请求方法" });
        } catch (error) {
          server.config.logger.error(error instanceof Error ? error.message : String(error));
          return json(res, 400, { error: error instanceof Error ? error.message : "本地板块状态操作失败" });
        }
      });
    },
  };
}
