const ARTICLE_API = "/api/local-articles";
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
  sectionId: string;
  title: string;
  summary: string;
  date: string;
  read: string;
  tags: string[];
  markdown: string;
  updatedAt: string;
};

type ArticleIndexRecord = Omit<Article, "markdown"> & { objectKey: string };
type Section = { id: string; label: string; icon: string; enabled: boolean; hotbarSlot?: number; description: string };

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
};

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

function cleanText(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string") throw new Error(`${field}不能为空`);
  const cleaned = value.replace(/\r\n?/g, "\n").trim();
  if (!cleaned || cleaned.length > maxLength) throw new Error(`${field}长度不合法`);
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
    sectionId: safeSectionId(source.sectionId),
    title: cleanText(source.title, "文章标题", 240),
    summary: cleanText(source.summary, "文章副标题", 600),
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

async function articleObjectKey(sectionId: string, title: string) {
  return `articles/${sectionId}/${(await sha256(`${sectionId}\0${title}`)).slice(0, 32)}.json`;
}

async function readArticleIndex(bucket: R2BucketLike) {
  const object = await bucket.get(ARTICLE_INDEX_KEY);
  if (!object) return [] as ArticleIndexRecord[];
  try {
    const value = JSON.parse(await object.text()) as unknown;
    return Array.isArray(value) ? value as ArticleIndexRecord[] : [];
  } catch {
    throw new Error("线上文章索引损坏");
  }
}

async function writeArticleIndex(bucket: R2BucketLike, records: ArticleIndexRecord[]) {
  await bucket.put(ARTICLE_INDEX_KEY, JSON.stringify(records), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
}

async function putArticle(bucket: R2BucketLike, article: Article) {
  const objectKey = await articleObjectKey(article.sectionId, article.title);
  await bucket.put(objectKey, JSON.stringify(article), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return objectKey;
}

function publicMetadata(record: ArticleIndexRecord) {
  const { objectKey, ...article } = record;
  void objectKey;
  return article;
}

function indexRecord(article: Article, objectKey: string): ArticleIndexRecord {
  const { markdown, ...metadata } = article;
  void markdown;
  return { ...metadata, objectKey };
}

async function handleArticles(request: Request, bucket: R2BucketLike, url: URL) {
  if (request.method === "GET") {
    const sectionId = url.searchParams.get("sectionId");
    const title = url.searchParams.get("title");
    const records = await readArticleIndex(bucket);
    if (sectionId && title) {
      const record = records.find((item) => item.sectionId === sectionId && item.title === title);
      if (!record) return json(404, { error: "文章不存在" });
      const object = await bucket.get(record.objectKey);
      if (!object) return json(404, { error: "文章正文不存在" });
      return json(200, { article: JSON.parse(await object.text()) });
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
    const records: ArticleIndexRecord[] = [];
    for (const value of payload.articles) {
      const article = normalizeArticle(value);
      const objectKey = await putArticle(bucket, article);
      records.push(indexRecord(article, objectKey));
    }
    await writeArticleIndex(bucket, records);
    await bucket.put(INITIALIZED_KEY, JSON.stringify({ initializedAt: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
    return json(200, { available: true, initialized: true, articles: records.map(publicMetadata) });
  }

  if (request.method === "PUT") {
    const payload = await requestJson(request, MAX_ARTICLE_REQUEST_BYTES) as { article?: unknown; previous?: { sectionId?: unknown; title?: unknown } };
    const article = normalizeArticle(payload.article);
    const records = await readArticleIndex(bucket);
    const previousSectionId = payload.previous?.sectionId === undefined ? article.sectionId : safeSectionId(payload.previous.sectionId);
    const previousTitle = payload.previous?.title === undefined ? article.title : cleanText(payload.previous.title, "原文章标题", 240);
    const previous = records.find((item) => item.sectionId === previousSectionId && item.title === previousTitle);
    const duplicate = records.find((item) => item.sectionId === article.sectionId && item.title === article.title && item.objectKey !== previous?.objectKey);
    if (duplicate) return json(409, { error: "同一板块中已存在同名文章" });
    const objectKey = await putArticle(bucket, article);
    if (previous && previous.objectKey !== objectKey) await bucket.delete(previous.objectKey);
    const next = records.filter((item) => item.objectKey !== previous?.objectKey && !(item.sectionId === article.sectionId && item.title === article.title));
    next.unshift(indexRecord(article, objectKey));
    await writeArticleIndex(bucket, next);
    await bucket.put(INITIALIZED_KEY, JSON.stringify({ initializedAt: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
    return json(200, { article });
  }

  if (request.method === "DELETE") {
    const payload = await requestJson(request, 32 * 1024) as { sectionId?: unknown; title?: unknown };
    const sectionId = safeSectionId(payload.sectionId);
    const title = payload.title === undefined ? undefined : cleanText(payload.title, "文章标题", 240);
    const records = await readArticleIndex(bucket);
    const removed = records.filter((item) => item.sectionId === sectionId && (title === undefined || item.title === title));
    if (removed.length) await bucket.delete(removed.map((item) => item.objectKey));
    await writeArticleIndex(bucket, records.filter((item) => !removed.includes(item)));
    return json(200, { deleted: removed.length });
  }

  return json(405, { error: "不支持的请求方法" }, { allow: "GET, POST, PUT, DELETE" });
}

function imageMime(value: string | null) {
  const mime = (value ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!IMAGE_TYPES[mime]) throw new Error("仅支持 PNG、JPEG、GIF、WebP、AVIF、BMP 和 ICO 图片");
  return mime;
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
    return { mime: imageMime(response.headers.get("content-type")), buffer: await response.arrayBuffer() };
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
    return { mime: imageMime(match[1]), buffer };
  }
  if (typeof source.url === "string") return fetchImage(source.url);
  throw new Error("图片来源不正确");
}

async function handleAssets(request: Request, bucket: R2BucketLike, url: URL) {
  if (request.method === "POST" && url.pathname === ASSET_API) {
    const payload = await requestJson(request, MAX_IMAGE_REQUEST_BYTES) as { sectionId?: unknown; image?: unknown };
    const sectionId = safeSectionId(payload.sectionId);
    const { mime, buffer } = await imagePayload(payload.image);
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("图片超过 10 MB 限制");
    const fileName = `${(await sha256(buffer)).slice(0, 24)}.${IMAGE_TYPES[mime]}`;
    const objectKey = `assets/${sectionId}/${fileName}`;
    await bucket.put(objectKey, buffer, { httpMetadata: { contentType: mime } });
    return json(200, { url: `${ASSET_API}/${encodeURIComponent(sectionId)}/${fileName}` });
  }

  if (request.method === "GET" && url.pathname.startsWith(`${ASSET_API}/`)) {
    const parts = url.pathname.slice(ASSET_API.length + 1).split("/").map(decodeURIComponent);
    const sectionId = safeSectionId(parts[0]);
    const fileName = parts[1];
    if (parts.length !== 2 || !/^[a-f0-9]{24}\.(png|jpg|gif|webp|avif|bmp|ico)$/.test(fileName ?? "")) return new Response("Not found", { status: 404 });
    const object = await bucket.get(`assets/${sectionId}/${fileName}`);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "content-length": String(object.size),
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        etag: object.etag,
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
    if (url.pathname === ARTICLE_API) return await handleArticles(request, bucket, url);
    if (url.pathname === SECTIONS_API) return await handleSections(request, bucket);
    if (url.pathname === ASSET_API || url.pathname.startsWith(`${ASSET_API}/`)) return await handleAssets(request, bucket, url);
    return null;
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "线上存储操作失败" });
  }
}
