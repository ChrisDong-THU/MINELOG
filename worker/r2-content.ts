import {
  STORED_IMAGE_FILE_PATTERN,
  imageAssetKeyFromUrl,
  imageAssetKeysFromMarkdown,
  imageAssetReferenceCounts,
  imageExtensionForMime,
  imageResponseSecurityHeaders,
  normalizeImageMime,
} from "../shared/image-assets.ts";
import { handleVisitorLocationRequest } from "./visitor-locations.ts";
import { articleAuthor } from "../shared/article-metadata.ts";
import { applyTextPatch, normalizeVersionedTextPatch } from "../shared/text-patch.ts";
const ARTICLE_API = "/api/local-articles";
const ARTICLE_VIEWS_API = "/api/article-views";
const ASSET_API = "/api/local-assets";
const SECTIONS_API = "/api/sections";
const ARTICLE_INDEX_KEY = "state/article-index.json";
const INITIALIZED_KEY = "state/initialized.json";
const SECTIONS_KEY = "state/sections.json";
const MAX_ARTICLE_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_REQUEST_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const encoder = new TextEncoder();

export interface R2StoredObject {
  key: string;
  etag: string;
  size: number;
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2BucketLike {
  get(key: string): Promise<R2StoredObject | null>;
  head(key: string): Promise<Omit<R2StoredObject, "body" | "text" | "arrayBuffer"> | null>;
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

type Article = {
  id: string;
  sectionId: string;
  title: string;
  author: string;
  summary: string;
  date: string;
  read: string;
  tags: string[];
  markdown: string;
  updatedAt: string;
};

type ArticleIndexRecord = Omit<Article, "markdown"> & { objectKey: string; assetKeys?: string[] };
type Section = { id: string; label: string; icon: string; enabled: boolean; hotbarSlot?: number; description: string };

class ArticleVersionConflictError extends Error {}

function json(status: number, value: unknown, headers?: HeadersInit) {
  return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });
}

async function requestJson(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("请求内容过大");
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error("请求内容过大");
  return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
}

function safeSectionId(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error("板块标识不合法");
  return value;
}

function safeArticleId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error("文章标识不合法");
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

function normalizeArticle(value: unknown): Article {
  if (!value || typeof value !== "object") throw new Error("文章数据格式不正确");
  const source = value as Record<string, unknown>;
  const markdown = typeof source.markdown === "string" ? source.markdown.replace(/\r\n?/g, "\n") : "";
  if (encoder.encode(markdown).byteLength > 3 * 1024 * 1024) throw new Error("Markdown 正文超过 3 MB 限制");
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

function normalizeSections(value: unknown): Section[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("板块列表不合法");
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error("板块数据格式不正确");
    const source = entry as Record<string, unknown>;
    const id = safeSectionId(source.id);
    if (ids.has(id)) throw new Error("板块标识重复");
    ids.add(id);
    const icon = cleanText(source.icon, "板块图标", 240);
    if (!icon.startsWith("/minecraft/")) throw new Error("板块图标路径不合法");
    const hotbarSlot = typeof source.hotbarSlot === "number" && Number.isInteger(source.hotbarSlot) && source.hotbarSlot >= 1 && source.hotbarSlot <= 7
      ? source.hotbarSlot
      : undefined;
    return {
      id,
      label: cleanText(source.label, "板块标题", 24),
      icon,
      enabled: source.enabled === true,
      ...(hotbarSlot === undefined ? {} : { hotbarSlot }),
      description: cleanText(source.description, "板块副标题", 64),
    };
  });
}

async function sha256(value: string | ArrayBuffer) {
  const source = typeof value === "string" ? encoder.encode(value) : value;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", source));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function articleObjectKey(articleId: string) {
  return `articles/${articleId}.json`;
}

function articleViewsObjectKey(articleId: string) {
  return `metrics/article-views/${articleId}.json`;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function readArticleViews(bucket: R2BucketLike, articleId: string) {
  const object = await bucket.get(articleViewsObjectKey(articleId));
  if (!object) return 0;
  const value = JSON.parse(await object.text()) as { views?: unknown };
  return typeof value.views === "number" && Number.isSafeInteger(value.views) && value.views >= 0 ? value.views : 0;
}

async function readArticleIndex(bucket: R2BucketLike) {
  const object = await bucket.get(ARTICLE_INDEX_KEY);
  if (!object) return [] as ArticleIndexRecord[];
  try {
    const value = JSON.parse(await object.text()) as unknown;
    return Array.isArray(value)
      ? value.map((record) => ({ ...(record as ArticleIndexRecord), author: articleAuthor((record as { author?: unknown }).author) }))
      : [];
  } catch {
    throw new Error("线上文章索引损坏");
  }
}

async function writeArticleIndex(bucket: R2BucketLike, records: ArticleIndexRecord[]) {
  await bucket.put(ARTICLE_INDEX_KEY, JSON.stringify(records), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
}

async function putArticle(bucket: R2BucketLike, article: Article) {
  const objectKey = articleObjectKey(article.id);
  await bucket.put(objectKey, JSON.stringify(article), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return objectKey;
}

function publicMetadata(record: ArticleIndexRecord) {
  const { objectKey, assetKeys, ...article } = record;
  void objectKey;
  void assetKeys;
  return article;
}

function indexRecord(article: Article, objectKey: string): ArticleIndexRecord {
  const { markdown, ...metadata } = article;
  return { ...metadata, objectKey, assetKeys: imageAssetKeysFromMarkdown(markdown) };
}

function sameArticleContent(left: Article, right: Article) {
  return left.sectionId === right.sectionId
    && left.title === right.title
    && left.author === right.author
    && left.summary === right.summary
    && left.markdown === right.markdown
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index]);
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

async function hydrateArticleAssetKeys(bucket: R2BucketLike, records: ArticleIndexRecord[]) {
  return Promise.all(records.map(async (record) => {
    if (Array.isArray(record.assetKeys)) return record;
    const object = await bucket.get(record.objectKey);
    if (!object) return { ...record, assetKeys: [] };
    const stored = JSON.parse(await object.text()) as { markdown?: unknown };
    return { ...record, assetKeys: imageAssetKeysFromMarkdown(typeof stored.markdown === "string" ? stored.markdown : "") };
  }));
}

async function deleteUnreferencedR2Assets(bucket: R2BucketLike, candidates: Iterable<string>, records: ArticleIndexRecord[]) {
  const counts = imageAssetReferenceCounts(records.map((record) => record.assetKeys ?? []));
  const deletions = [...new Set(candidates)].filter((assetKey) => (counts.get(assetKey) ?? 0) === 0);
  if (deletions.length) await bucket.delete(deletions);
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

async function handleArticles(request: Request, bucket: R2BucketLike, url: URL) {
  if (request.method === "GET") {
    const articleId = url.searchParams.get("id");
    const records = await readArticleIndex(bucket);
    if (articleId) {
      const record = records.find((item) => item.id === safeArticleId(articleId));
      if (!record) return json(404, { error: "文章不存在" });
      const object = await bucket.get(record.objectKey);
      if (!object) return json(404, { error: "文章正文不存在" });
      const article = JSON.parse(await object.text()) as Article;
      return json(200, { article: { ...article, author: articleAuthor(article.author) } });
    }
    const initialized = Boolean(await bucket.head(INITIALIZED_KEY));
    return json(200, { available: true, initialized, articles: records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(publicMetadata) });
  }

  if (request.method === "POST") {
    const payload = await requestJson(request, MAX_ARTICLE_REQUEST_BYTES) as { articles?: unknown };
    if (await bucket.head(INITIALIZED_KEY)) {
      const records = await readArticleIndex(bucket);
      return json(200, { available: true, initialized: true, articles: records.map(publicMetadata) });
    }
    if (!Array.isArray(payload.articles) || payload.articles.length > 2000) throw new Error("初始化文章列表不合法");
    const articles = normalizeInitialArticles(payload.articles);
    const records: ArticleIndexRecord[] = [];
    for (const article of articles) {
      const objectKey = await putArticle(bucket, article);
      records.push(indexRecord(article, objectKey));
    }
    await writeArticleIndex(bucket, records);
    await bucket.put(INITIALIZED_KEY, JSON.stringify({ initializedAt: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
    return json(200, { available: true, initialized: true, articles: records.map(publicMetadata) });
  }

  if (request.method === "PUT") {
    const payload = await requestJson(request, MAX_ARTICLE_REQUEST_BYTES) as {
      article?: unknown;
      cleanupAssetUrls?: unknown;
      baseUpdatedAt?: unknown;
      markdownPatch?: unknown;
    };
    if (!payload.article || typeof payload.article !== "object") throw new Error("文章数据格式不正确");
    const source = payload.article as Record<string, unknown>;
    const articleId = safeArticleId(source.id);
    const patch = payload.markdownPatch === undefined ? undefined : normalizeVersionedTextPatch(payload.markdownPatch);
    if (!patch && typeof source.markdown !== "string") throw new Error("文章正文格式不正确");
    const uploadedAssetKeys = normalizeCleanupAssetKeys(payload.cleanupAssetUrls);
    const records = await hydrateArticleAssetKeys(bucket, await readArticleIndex(bucket));
    const previous = records.find((item) => item.id === articleId);
    const previousObject = previous ? await bucket.get(previous.objectKey) : null;
    if (previous && !previousObject) throw new Error("文章正文不存在");
    const previousArticle = previousObject ? normalizeArticle(JSON.parse(await previousObject.text())) : undefined;
    const baseUpdatedAt = patch?.baseUpdatedAt ?? payload.baseUpdatedAt;
    if (baseUpdatedAt !== undefined) {
      if (typeof baseUpdatedAt !== "string" || !previousArticle || previousArticle.updatedAt !== baseUpdatedAt) {
        throw new ArticleVersionConflictError("文章已在其他位置更新，请重新载入后再保存");
      }
    }
    if (patch && !previousArticle) throw new ArticleVersionConflictError("文章基准版本不存在，请重新载入后再保存");
    const markdown = patch ? applyTextPatch(previousArticle!.markdown, patch) : source.markdown;
    const article = normalizeArticle({ ...source, markdown });
    const duplicate = records.find((item) => item.sectionId === article.sectionId && item.title === article.title && item.id !== article.id);
    if (duplicate) return json(409, { error: "同一板块中已存在同名文章" });
    if (previous && previousArticle && sameArticleContent(previousArticle, article)) {
      const currentAssets = new Set(previous.assetKeys ?? []);
      await deleteUnreferencedR2Assets(bucket, uploadedAssetKeys.filter((key) => !currentAssets.has(key)), records);
      return json(200, { article: previousArticle, unchanged: true });
    }
    const objectKey = await putArticle(bucket, article);
    const current = indexRecord(article, objectKey);
    const currentAssets = new Set(current.assetKeys ?? []);
    const removedAssets = (previous?.assetKeys ?? []).filter((key) => !currentAssets.has(key));
    const uploadedAssets = uploadedAssetKeys.filter((key) => !currentAssets.has(key));
    const next = [current, ...records.filter((item) => item.id !== article.id)];
    await writeArticleIndex(bucket, next);
    await bucket.put(INITIALIZED_KEY, JSON.stringify({ initializedAt: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
    await deleteUnreferencedR2Assets(bucket, [...removedAssets, ...uploadedAssets], next);
    return json(200, { article });
  }
  if (request.method === "DELETE") {
    const payload = await requestJson(request, 32 * 1024) as { sectionId?: unknown; id?: unknown };
    const sectionId = safeSectionId(payload.sectionId);
    const articleId = payload.id === undefined ? undefined : safeArticleId(payload.id);
    const records = await hydrateArticleAssetKeys(bucket, await readArticleIndex(bucket));
    const removed = records.filter((item) => item.sectionId === sectionId && (articleId === undefined || item.id === articleId));
    const remaining = records.filter((item) => !removed.includes(item));
    if (removed.length) await bucket.delete(removed.flatMap((item) => [item.objectKey, articleViewsObjectKey(item.id)]));
    await writeArticleIndex(bucket, remaining);
    await deleteUnreferencedR2Assets(bucket, removed.flatMap((item) => item.assetKeys ?? []), remaining);
    return json(200, { deleted: removed.length });
  }

  return json(405, { error: "不支持的请求方法" }, { allow: "GET, POST, PUT, DELETE" });
}

async function handleArticleViews(request: Request, bucket: R2BucketLike, url: URL) {
  if (request.method !== "GET" && request.method !== "POST") {
    return json(405, { error: "不支持的请求方法" }, { allow: "GET, POST" });
  }
  const articleId = safeArticleId(url.searchParams.get("id"));
  const records = await readArticleIndex(bucket);
  if (!records.some((record) => record.id === articleId)) return json(404, { error: "文章不存在" });

  const current = await readArticleViews(bucket, articleId);
  if (request.method === "GET") return json(200, { views: current });
  if (!sameOrigin(request)) return json(403, { error: "访问来源不合法" });

  const views = Math.min(Number.MAX_SAFE_INTEGER, current + 1);
  await bucket.put(articleViewsObjectKey(articleId), JSON.stringify({ views }), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return json(200, { views });
}

function privateHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".local") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "::1";
}

async function fetchImage(sourceUrl: string) {
  let url = new URL(sourceUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (url.protocol !== "https:" || privateHost(url.hostname)) throw new Error("图片外链必须使用公开 HTTPS 地址");
    const response = await fetch(url, { headers: { accept: "image/*" }, redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("图片外链重定向过多");
      url = new URL(location, url);
      continue;
    }
    if (!response.ok) throw new Error("无法下载图片外链");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_IMAGE_BYTES) throw new Error("图片超过 10 MB 限制");
    return { mime: normalizeImageMime(response.headers.get("content-type")), buffer: await response.arrayBuffer() };
  }
  throw new Error("无法下载图片外链");
}

async function imagePayload(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("图片来源不正确");
  const source = value as { dataUrl?: unknown; url?: unknown };
  if (typeof source.dataUrl === "string") {
    const match = /^data:([^;,]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(source.dataUrl);
    if (!match) throw new Error("图片数据格式不正确");
    const binary = atob(match[2].replace(/\s/g, ""));
    if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw new Error("图片为空或超过 10 MB 限制");
    const buffer = Uint8Array.from(binary, (character) => character.charCodeAt(0)).buffer;
    return { mime: normalizeImageMime(match[1]), buffer };
  }
  if (typeof source.url === "string") return fetchImage(source.url);
  throw new Error("图片来源不正确");
}

async function handleAssets(request: Request, bucket: R2BucketLike, url: URL) {
  if (request.method === "POST" && url.pathname === ASSET_API) {
    const payload = await requestJson(request, MAX_IMAGE_REQUEST_BYTES) as { image?: unknown };
    const { mime, buffer } = await imagePayload(payload.image);
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("图片超过 10 MB 限制");
    const fileName = `${(await sha256(buffer)).slice(0, 24)}.${imageExtensionForMime(mime)}`;
    const objectKey = `assets/${fileName}`;
    await bucket.put(objectKey, buffer, { httpMetadata: { contentType: mime } });
    return json(200, { url: `${ASSET_API}/${fileName}` });
  }

  if (request.method === "GET" && url.pathname.startsWith(`${ASSET_API}/`)) {
    const parts = url.pathname.slice(ASSET_API.length + 1).split("/").map(decodeURIComponent);
    const fileName = parts[0];
    if (parts.length !== 1 || !STORED_IMAGE_FILE_PATTERN.test(fileName ?? "")) return new Response("Not found", { status: 404 });
    const object = await bucket.get(`assets/${fileName}`);
    if (!object) return new Response("Not found", { status: 404 });
    const securityHeaders = imageResponseSecurityHeaders(fileName);
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "content-length": String(object.size),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        etag: object.etag,
        ...securityHeaders,
      },
    });
  }

  return json(405, { error: "不支持的请求方法" }, { allow: "GET, POST" });
}

async function handleSections(request: Request, bucket: R2BucketLike) {
  if (request.method === "GET") {
    const object = await bucket.get(SECTIONS_KEY);
    if (!object) return json(200, { available: true, initialized: false, sections: [] });
    return json(200, { available: true, initialized: true, sections: normalizeSections(JSON.parse(await object.text())) });
  }
  if (request.method === "PUT") {
    const payload = await requestJson(request, 256 * 1024) as { sections?: unknown };
    const sections = normalizeSections(payload.sections);
    await bucket.put(SECTIONS_KEY, JSON.stringify(sections), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
    return json(200, { available: true, initialized: true, sections });
  }
  return json(405, { error: "不支持的请求方法" }, { allow: "GET, PUT" });
}

export async function handleR2ContentRequest(request: Request, bucket: R2BucketLike): Promise<Response | null> {
  const url = new URL(request.url);
  try {
    const visitorResponse = await handleVisitorLocationRequest(request, bucket);
    if (visitorResponse) return visitorResponse;
    if (url.pathname === ARTICLE_VIEWS_API) return await handleArticleViews(request, bucket, url);
    if (url.pathname === ARTICLE_API) return await handleArticles(request, bucket, url);
    if (url.pathname === SECTIONS_API) return await handleSections(request, bucket);
    if (url.pathname === ASSET_API || url.pathname.startsWith(`${ASSET_API}/`)) return await handleAssets(request, bucket, url);
    return null;
  } catch (error) {
    return json(error instanceof ArticleVersionConflictError ? 409 : 400, { error: error instanceof Error ? error.message : "线上存储操作失败" });
  }
}
