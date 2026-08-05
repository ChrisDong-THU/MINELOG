import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import {
  STORED_IMAGE_FILE_PATTERN,
  imageExtensionForMime,
  imageMimeForExtension,
  imageResponseSecurityHeaders,
  normalizeImageMime,
} from "../shared/image-assets.ts";

const ASSET_API = "/api/local-assets";
const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
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
    if (size > MAX_REQUEST_BYTES) throw new Error("粘贴的图片超过 10 MB 限制");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function safeSectionId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("板块标识不合法");
  return value;
}

function checkedBuffer(value: ArrayBuffer | Uint8Array) {
  const buffer = value instanceof ArrayBuffer
    ? Buffer.from(value)
    : Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error("图片为空或超过 10 MB 限制");
  return buffer;
}

async function readImageSource(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("图片来源不正确");
  const source = value as { dataUrl?: unknown; url?: unknown };
  if (typeof source.dataUrl === "string") {
    const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(source.dataUrl);
    if (!match) throw new Error("粘贴图片的数据格式不正确");
    return { mime: normalizeImageMime(match[1]), buffer: checkedBuffer(Buffer.from(match[2], "base64")) };
  }
  if (typeof source.url === "string") {
    const url = new URL(source.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("图片外链必须使用 HTTP 或 HTTPS");
    const response = await fetch(url, { headers: { accept: "image/*" }, redirect: "follow" });
    if (!response.ok) throw new Error(`图片下载失败（${response.status}）`);
    const mime = normalizeImageMime(response.headers.get("content-type"));
    return { mime, buffer: checkedBuffer(await response.arrayBuffer()) };
  }
  throw new Error("没有检测到可保存的图片");
}

function assetUrl(sectionId: string, fileName: string) {
  return `${ASSET_API}/${encodeURIComponent(sectionId)}/${encodeURIComponent(fileName)}`;
}

export function localArticleAssets(): Plugin {
  let contentRoot = process.cwd();
  return {
    name: "minelog-local-article-assets",
    apply: "serve",
    configResolved(config) {
      contentRoot = resolve(config.root, "content", "local");
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (req.method === "POST" && url.pathname === ASSET_API) {
          try {
            const payload = await bodyJson(req) as { sectionId?: unknown; image?: unknown };
            const sectionId = safeSectionId(payload.sectionId);
            const { mime, buffer } = await readImageSource(payload.image);
            const fileName = `${createHash("sha256").update(buffer).digest("hex").slice(0, 24)}.${imageExtensionForMime(mime)}`;
            const destination = join(contentRoot, sectionId, "assets", fileName);
            await mkdir(dirname(destination), { recursive: true });
            await writeFile(destination, buffer);
            return json(res, 200, { url: assetUrl(sectionId, fileName) });
          } catch (error) {
            server.config.logger.error(error instanceof Error ? error.message : String(error));
            return json(res, 400, { error: error instanceof Error ? error.message : "图片保存失败" });
          }
        }

        if (req.method === "GET" && url.pathname.startsWith(`${ASSET_API}/`)) {
          try {
            const parts = url.pathname.slice(ASSET_API.length + 1).split("/").map(decodeURIComponent);
            const sectionId = safeSectionId(parts[0]);
            const fileName = parts[1];
            const match = STORED_IMAGE_FILE_PATTERN.exec(fileName ?? "");
            if (!match || parts.length !== 2) throw new Error("图片路径不合法");
            const extension = match[2];
            const mime = imageMimeForExtension(extension);
            const buffer = await readFile(join(contentRoot, sectionId, "assets", fileName));
            res.statusCode = 200;
            res.setHeader("content-type", mime);
            res.setHeader("content-length", buffer.length);
            res.setHeader("cache-control", "public, max-age=31536000, immutable");
            res.setHeader("x-content-type-options", "nosniff");
            for (const [name, value] of Object.entries(imageResponseSecurityHeaders(fileName))) res.setHeader(name, value);
            res.end(buffer);
            return;
          } catch {
            res.statusCode = 404;
            res.end("Not found");
            return;
          }
        }

        return next();
      });
    },
  };
}
