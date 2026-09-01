import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import type { Plugin } from "vite";
import {
  imageAssetKeyFromUrl,
  imageAssetKeysFromMarkdown,
  imageAssetReferenceCounts,
  storedImageAssetFileName,
} from "../shared/image-assets.ts";
import { articleAuthor } from "../shared/article-metadata.ts";
import { applyTextPatch, normalizeVersionedTextPatch } from "../shared/text-patch.ts";

const API_PATH = "/api/local-articles";
const ARTICLE_VIEWS_PATH = "/api/article-views";
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const ARTICLE_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.md$/i;

export type LocalArticleFile = {
  id: string;
  sectionId: string;
  title: string;
  author: string;
  summary: string;
  date: string;
  read: string;
  tags: string[];
  markdown: string;
  updatedAt?: string;
};

type ArticleFileRecord = LocalArticleFile & { filePath: string; updatedAt: string };

class ArticleVersionConflictError extends Error {}

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
    if (size > MAX_REQUEST_BYTES) throw new Error("请求内容超过 4 MB 限制");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function scalar(value: unknown) {
  return JSON.stringify(value);
}

function safeSectionId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) {
    throw new Error("板块标识不合法");
  }
  return value;
}

function safeArticleId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("文章标识不合法");
  }
  return value.toLowerCase();
}

function cleanText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${field}不能为空`);
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (!cleaned || cleaned.length > maxLength) throw new Error(`${field}长度不合法`);
  return cleaned;
}

function cleanOptionalText(value: unknown, field: string, maxLength: number) {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new Error(`${field}格式不正确`);
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (cleaned.length > maxLength) throw new Error(`${field}长度不合法`);
  return cleaned;
}

function normalizeArticle(value: unknown): LocalArticleFile & { updatedAt: string } {
  if (!value || typeof value !== "object") throw new Error("文章数据格式不正确");
  const source = value as Record<string, unknown>;
  const markdown = typeof source.markdown === "string" ? source.markdown.replace(/\r\n?/g, "\n") : "";
  if (Buffer.byteLength(markdown, "utf8") > 3 * 1024 * 1024) throw new Error("Markdown 正文超过 3 MB 限制");
  const tags = Array.isArray(source.tags)
    ? source.tags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).slice(0, 40)
    : [];
  return {
    id: safeArticleId(source.id),
    sectionId: safeSectionId(source.sectionId),
    title: cleanText(source.title, "文章标题", 240),
    author: articleAuthor(cleanOptionalText(source.author, "作者", 80)),
    summary: cleanOptionalText(source.summary, "文章副标题", 600),
    date: cleanText(source.date, "更新日期", 32),
    read: cleanText(source.read, "阅读时长", 32),
    tags,
    markdown,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : new Date().toISOString(),
  };
}

function filePathFor(root: string, article: LocalArticleFile) {
  return join(root, "articles", `${article.id}.md`);
}

function serialize(article: LocalArticleFile & { updatedAt: string }) {
  return [
    "---",
    `id: ${scalar(article.id)}`,
    `title: ${scalar(article.title)}`,
    `author: ${scalar(article.author)}`,
    `summary: ${scalar(article.summary)}`,
    `section: ${scalar(article.sectionId)}`,
    `date: ${scalar(article.date)}`,
    `read: ${scalar(article.read)}`,
    `tags: ${scalar(article.tags)}`,
    `updatedAt: ${scalar(article.updatedAt)}`,
    "---",
    "",
    article.markdown.replace(/^\s+/, ""),
    "",
  ].join("\n");
}
function parseScalar(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function parseArticle(filePath: string, source: string): ArticleFileRecord | null {
  const normalized = source.replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const end = normalized.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const metadata: Record<string, unknown> = {};
  for (const line of normalized.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    metadata[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1).trim());
  }
  try {
    const article = normalizeArticle({
      id: metadata.id,
      sectionId: metadata.section,
      title: metadata.title,
      author: articleAuthor(metadata.author),
      summary: metadata.summary,
      date: metadata.date,
      read: metadata.read,
      tags: metadata.tags,
      updatedAt: metadata.updatedAt,
      markdown: normalized.slice(end + 5).replace(/^\n/, "").replace(/\n$/, ""),
    });
    return { ...article, filePath };
  } catch {
    return null;
  }
}

async function readAll(root: string): Promise<ArticleFileRecord[]> {
  const directory = join(root, "articles");
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const paths = entries
    .filter((entry) => entry.isFile() && ARTICLE_FILE_PATTERN.test(entry.name))
    .map((entry) => join(directory, entry.name));
  const records = await Promise.all(paths.map(async (path) => parseArticle(path, await readFile(path, "utf8"))));
  return records.filter((record): record is ArticleFileRecord => Boolean(record)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function normalizeCleanupAssetKeys(value: unknown) {
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value) || value.length > 500) throw new Error("待清理图片列表不合法");
  return [...new Set(value.flatMap((url) => {
    if (typeof url !== "string") return [];
    const key = imageAssetKeyFromUrl(url);
    return key ? [key] : [];
  }))];
}

function recordAssetKeys(record: Pick<ArticleFileRecord, "markdown">) {
  return imageAssetKeysFromMarkdown(record.markdown);
}

async function deleteUnreferencedAssets(root: string, candidates: Iterable<string>, records: ArticleFileRecord[]) {
  const counts = imageAssetReferenceCounts(records.map(recordAssetKeys));
  const deletions = [...new Set(candidates)].flatMap((assetKey) => {
    if ((counts.get(assetKey) ?? 0) > 0) return [];
    const fileName = storedImageAssetFileName(assetKey);
    return fileName ? [rm(join(root, "assets", fileName), { force: true })] : [];
  });
  await Promise.all(deletions);
}

async function initialized(markerPath: string) {
  try {
    await access(markerPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readArticleViews(filePath: string) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {} as Record<string, number>;
    return Object.fromEntries(Object.entries(value).flatMap(([id, count]) => (
      /^[0-9a-f-]{36}$/i.test(id) && typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? [[id, count]] : []
    )));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {} as Record<string, number>;
    throw error;
  }
}

async function writeArticleViews(filePath: string, views: Record<string, number>) {
  await mkdir(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${Date.now()}.tmp`;
  await writeFile(temporary, JSON.stringify(views, null, 2), "utf8");
  await rm(filePath, { force: true });
  await rename(temporary, filePath);
}

function localRequestSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const protocol = "encrypted" in req.socket ? "https" : "http";
  return origin === `${protocol}://${req.headers.host}`;
}

async function saveOne(root: string, value: unknown, cleanupAssetUrls: unknown = [], existingRecords?: ArticleFileRecord[]) {
  const article = normalizeArticle(value);
  const uploadedAssetKeys = normalizeCleanupAssetKeys(cleanupAssetUrls);
  const existing = existingRecords ?? await readAll(root);
  const previousRecord = existing.find((record) => record.id === article.id);
  const duplicate = existing.find((record) => record.sectionId === article.sectionId && record.title === article.title && record.id !== article.id);
  if (duplicate) throw new Error("同一板块中已存在同名文章");

  if (previousRecord && sameArticleContent(previousRecord, article)) {
    const currentAssets = new Set(recordAssetKeys(previousRecord));
    await deleteUnreferencedAssets(root, uploadedAssetKeys.filter((key) => !currentAssets.has(key)), existing);
    const { filePath: _filePath, ...previousArticle } = previousRecord;
    return previousArticle;
  }

  const destination = filePathFor(root, article);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${Date.now()}.tmp`;
  await writeFile(temporary, serialize(article), "utf8");
  try {
    await rename(temporary, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM") throw error;
    await rm(destination, { force: true });
    await rename(temporary, destination);
  }
  if (previousRecord && previousRecord.filePath !== destination) await rm(previousRecord.filePath, { force: true });

  const nextRecord: ArticleFileRecord = { ...article, filePath: destination };
  const nextRecords = [...existing.filter((record) => record.id !== article.id), nextRecord];
  const currentAssets = new Set(recordAssetKeys(nextRecord));
  const removedAssets = previousRecord ? recordAssetKeys(previousRecord).filter((key) => !currentAssets.has(key)) : [];
  const uploadedAssets = uploadedAssetKeys.filter((key) => !currentAssets.has(key));
  await deleteUnreferencedAssets(root, [...removedAssets, ...uploadedAssets], nextRecords);
  return article;
}

function sameArticleContent(left: LocalArticleFile, right: LocalArticleFile) {
  return left.sectionId === right.sectionId
    && left.title === right.title
    && left.author === right.author
    && left.summary === right.summary
    && left.markdown === right.markdown
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index]);
}

async function resolveArticleSave(root: string, payload: {
  article?: unknown;
  cleanupAssetUrls?: unknown;
  baseUpdatedAt?: unknown;
  markdownPatch?: unknown;
}) {
  if (!payload.article || typeof payload.article !== "object") throw new Error("文章数据格式不正确");
  const source = payload.article as Record<string, unknown>;
  const articleId = safeArticleId(source.id);
  const patch = payload.markdownPatch === undefined ? undefined : normalizeVersionedTextPatch(payload.markdownPatch);
  if (!patch && typeof source.markdown !== "string") throw new Error("文章正文格式不正确");
  const records = await readAll(root);
  const previous = records.find((record) => record.id === articleId);
  const baseUpdatedAt = patch?.baseUpdatedAt ?? payload.baseUpdatedAt;

  if (baseUpdatedAt !== undefined) {
    if (typeof baseUpdatedAt !== "string" || !previous || previous.updatedAt !== baseUpdatedAt) {
      throw new ArticleVersionConflictError("文章已在其他位置更新，请重新载入后再保存");
    }
  }
  if (patch && !previous) throw new ArticleVersionConflictError("文章基准版本不存在，请重新载入后再保存");

  const markdown = patch ? applyTextPatch(previous!.markdown, patch) : source.markdown;
  return saveOne(root, { ...source, markdown }, payload.cleanupAssetUrls, records);
}

function normalizeInitialArticles(values: unknown[]) {
  const articles = values.map(normalizeArticle);
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (const article of articles) {
    if (ids.has(article.id)) throw new Error("文章标识重复");
    ids.add(article.id);
    const titleKey = `${article.sectionId}\0${article.title}`;
    if (titles.has(titleKey)) throw new Error("同一板块中已存在同名文章");
    titles.add(titleKey);
  }
  return articles;
}

async function initializeStore(root: string, markerPath: string, values: unknown) {
  await Promise.all([
    mkdir(join(root, "articles"), { recursive: true }),
    mkdir(join(root, "assets"), { recursive: true }),
    mkdir(dirname(markerPath), { recursive: true }),
  ]);
  if (await initialized(markerPath)) return readAll(root);
  if (!Array.isArray(values) || values.length > 2000) throw new Error("初始化文章列表不合法");
  const articles = normalizeInitialArticles(values);
  for (const article of articles) await saveOne(root, article);
  await writeFile(markerPath, JSON.stringify({ version: 3, initializedAt: new Date().toISOString() }, null, 2), "utf8");
  return readAll(root);
}

function publicArticles(records: ArticleFileRecord[]) {
  return records.map(({ filePath: _filePath, markdown: _markdown, ...article }) => article);
}

export function localArticleFiles(): Plugin {
  let root = process.cwd();
  let viewWriteQueue: Promise<unknown> = Promise.resolve();
  let articleWriteQueue: Promise<unknown> = Promise.resolve();
  return {
    name: "minelog-local-article-files",
    apply: "serve",
    configResolved(config) {
      root = resolve(config.root, "content", "local");
    },
    configureServer(server) {
      const markerPath = join(root, "state", "initialized.json");
      const articleViewsPath = join(root, "state", "article-views.json");
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== API_PATH && url.pathname !== ARTICLE_VIEWS_PATH) return next();
        try {
          if (url.pathname === ARTICLE_VIEWS_PATH) {
            if (req.method !== "GET" && req.method !== "POST") {
              res.setHeader("allow", "GET, POST");
              return json(res, 405, { error: "不支持的请求方法" });
            }
            const articleId = safeArticleId(url.searchParams.get("id"));
            const records = await readAll(root);
            if (!records.some((record) => record.id === articleId)) return json(res, 404, { error: "文章不存在" });
            if (req.method === "GET") {
              const views = await readArticleViews(articleViewsPath);
              return json(res, 200, { views: views[articleId] ?? 0 });
            }
            if (!localRequestSameOrigin(req)) return json(res, 403, { error: "访问来源不合法" });
            const update = viewWriteQueue.catch(() => undefined).then(async () => {
              const views = await readArticleViews(articleViewsPath);
              const next = Math.min(Number.MAX_SAFE_INTEGER, (views[articleId] ?? 0) + 1);
              views[articleId] = next;
              await writeArticleViews(articleViewsPath, views);
              return next;
            });
            viewWriteQueue = update;
            return json(res, 200, { views: await update });
          }
          if (req.method === "GET") {
            const records = await readAll(root);
            const articleId = url.searchParams.get("id");
            if (articleId) {
              const record = records.find((article) => article.id === safeArticleId(articleId));
              if (!record) return json(res, 404, { error: "文章不存在" });
              const { filePath: _filePath, ...article } = record;
              return json(res, 200, { article });
            }
            return json(res, 200, { available: true, initialized: await initialized(markerPath), articles: publicArticles(records) });
          }
          if (req.method === "POST") {
            const payload = await bodyJson(req) as { articles?: unknown };
            const articles = await initializeStore(root, markerPath, payload.articles);
            return json(res, 200, { available: true, initialized: true, articles: publicArticles(articles) });
          }
          if (req.method === "PUT") {
            const payload = await bodyJson(req) as { article?: unknown; cleanupAssetUrls?: unknown; baseUpdatedAt?: unknown; markdownPatch?: unknown };
            const update = articleWriteQueue.catch(() => undefined).then(() => resolveArticleSave(root, payload));
            articleWriteQueue = update;
            const article = await update;
            return json(res, 200, { article });
          }
          if (req.method === "DELETE") {
            const payload = await bodyJson(req) as { sectionId?: unknown; id?: unknown };
            const sectionId = safeSectionId(payload.sectionId);
            const articleId = payload.id === undefined ? undefined : safeArticleId(payload.id);
            const records = await readAll(root);
            const matches = records.filter((record) => record.sectionId === sectionId && (articleId === undefined || record.id === articleId));
            const remaining = records.filter((record) => !matches.includes(record));
            const cleanupCandidates = matches.flatMap(recordAssetKeys);
            await Promise.all(matches.map((record) => rm(record.filePath, { force: true })));
            if (matches.length) {
              const cleanupViews = viewWriteQueue.catch(() => undefined).then(async () => {
                const views = await readArticleViews(articleViewsPath);
                let changed = false;
                for (const record of matches) changed = delete views[record.id] || changed;
                if (changed) await writeArticleViews(articleViewsPath, views);
              });
              viewWriteQueue = cleanupViews;
              await cleanupViews;
            }
            await deleteUnreferencedAssets(root, cleanupCandidates, remaining);
            return json(res, 200, { deleted: matches.length });
          }
          res.setHeader("allow", "GET, POST, PUT, DELETE");
          return json(res, 405, { error: "不支持的请求方法" });
        } catch (error) {
          server.config.logger.error(error instanceof Error ? error.message : String(error));
          return json(res, error instanceof ArticleVersionConflictError ? 409 : 400, { error: error instanceof Error ? error.message : "本地文章操作失败" });
        }
      });
    },
  };
}
