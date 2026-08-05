import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { handleR2ContentRequest } from "../worker/r2-content.ts";

class MemoryBucket {
  objects = new Map();

  async put(key, value, options = {}) {
    let bytes;
    if (typeof value === "string") bytes = new TextEncoder().encode(value);
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else throw new Error("Unsupported test value");
    this.objects.set(key, {
      bytes: bytes.slice(),
      contentType: options.httpMetadata?.contentType,
    });
  }

  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = stored.bytes.slice();
    return {
      key,
      etag: "test-etag",
      size: bytes.byteLength,
      body: new Blob([bytes]).stream(),
      httpMetadata: { contentType: stored.contentType },
      async text() { return new TextDecoder().decode(bytes); },
      async arrayBuffer() { return bytes.slice().buffer; },
    };
  }

  async head(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      key,
      etag: "test-etag",
      size: stored.bytes.byteLength,
      httpMetadata: { contentType: stored.contentType },
    };
  }

  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.objects.delete(key);
  }
}

test("R2 accepts and safely serves SVG article images", async () => {
  const bucket = new MemoryBucket();
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path fill="#6a4" d="M0 0h4v4H0z"/></svg>';
  const upload = await handleR2ContentRequest(new Request("https://minelog.example/api/local-assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      image: { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` },
    }),
  }), bucket);

  assert.equal(upload?.status, 200);
  const payload = await upload.json();
  assert.match(payload.url, /^\/api\/local-assets\/[a-f0-9]{24}\.svg$/);

  const download = await handleR2ContentRequest(new Request(`https://minelog.example${payload.url}`), bucket);
  assert.equal(download?.status, 200);
  assert.equal(download.headers.get("content-type"), "image/svg+xml");
  assert.match(download.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.match(download.headers.get("content-security-policy") ?? "", /sandbox/);
  assert.equal(await download.text(), svg);
});

test("R2 uses permanent UUID article identity and rejects same-section duplicate titles", async () => {
  const bucket = new MemoryBucket();
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const article = {
    id: firstId,
    sectionId: "notes",
    title: "永久身份",
    summary: "初始版本",
    date: "08.06",
    read: "1 MIN",
    tags: [],
    markdown: "body",
    updatedAt: "2026-08-06T08:00:00.000Z",
  };

  const created = await handleR2ContentRequest(new Request("https://minelog.example/api/local-articles", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ article }),
  }), bucket);
  assert.equal(created?.status, 200);
  assert.ok(bucket.objects.has(`articles/${firstId}.json`));

  const duplicate = await handleR2ContentRequest(new Request("https://minelog.example/api/local-articles", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ article: { ...article, id: secondId } }),
  }), bucket);
  assert.equal(duplicate?.status, 409);

  const renamed = await handleR2ContentRequest(new Request("https://minelog.example/api/local-articles", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ article: { ...article, sectionId: "archive", title: "重命名后", markdown: "renamed body" } }),
  }), bucket);
  assert.equal(renamed?.status, 200);
  assert.ok(bucket.objects.has(`articles/${firstId}.json`));

  const loaded = await handleR2ContentRequest(new Request(`https://minelog.example/api/local-articles?id=${firstId}`), bucket);
  assert.equal(loaded?.status, 200);
  const loadedBody = await loaded.json();
  assert.equal(loadedBody.article.id, firstId);
  assert.equal(loadedBody.article.title, "重命名后");
  assert.equal(loadedBody.article.sectionId, "archive");
});
test("R2 validates the complete initial article set before writing objects", async () => {
  const bucket = new MemoryBucket();
  const baseArticle = {
    id: "11111111-1111-4111-8111-111111111111",
    sectionId: "notes",
    title: "初始化文章",
    summary: "测试初始化原子性",
    date: "08.06",
    read: "1 MIN",
    tags: [],
    markdown: "body",
    updatedAt: "2026-08-06T08:00:00.000Z",
  };
  const response = await handleR2ContentRequest(new Request("https://minelog.example/api/local-articles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ articles: [baseArticle, { ...baseArticle, title: "重复 UUID" }] }),
  }), bucket);

  assert.equal(response?.status, 400);
  assert.equal(bucket.objects.size, 0);
});

test("R2 deletes an image only after its last article reference is removed", async () => {
  const bucket = new MemoryBucket();
  const origin = "https://minelog.example";
  const firstId = "33333333-3333-4333-8333-333333333333";
  const secondId = "44444444-4444-4444-8444-444444444444";

  async function uploadSvg(fill) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path fill="${fill}" d="M0 0h1v1H0z"/></svg>`;
    const response = await handleR2ContentRequest(new Request(`${origin}/api/local-assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        image: { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` },
      }),
    }), bucket);
    assert.equal(response?.status, 200);
    return (await response.json()).url;
  }

  async function saveArticle(id, title, markdown, cleanupAssetUrls = [], sectionId = "notes") {
    return handleR2ContentRequest(new Request(`${origin}/api/local-articles`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        article: {
          id,
          sectionId,
          title,
          summary: "reference cleanup",
          date: "08.06",
          read: "1 MIN",
          tags: [],
          markdown,
          updatedAt: "2026-08-06T08:00:00.000Z",
        },
        cleanupAssetUrls,
      }),
    }), bucket);
  }

  function objectKey(url) {
    return `assets/${url.slice("/api/local-assets/".length)}`;
  }

  const sharedUrl = await uploadSvg("#123");
  const sharedMarkdown = `![shared](${sharedUrl})`;
  assert.equal((await saveArticle(firstId, "First", sharedMarkdown))?.status, 200);
  assert.equal((await saveArticle(secondId, "Second", sharedMarkdown))?.status, 200);

  const legacyIndex = JSON.parse(await (await bucket.get("state/article-index.json")).text());
  for (const record of legacyIndex) delete record.assetKeys;
  await bucket.put("state/article-index.json", JSON.stringify(legacyIndex), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  assert.equal((await saveArticle(firstId, "First", "removed", [sharedUrl]))?.status, 200);
  assert.equal(bucket.objects.has(objectKey(sharedUrl)), true);
  assert.equal((await saveArticle(secondId, "Second", "removed", [sharedUrl]))?.status, 200);
  assert.equal(bucket.objects.has(objectKey(sharedUrl)), false);

  const unusedUrl = await uploadSvg("#456");
  assert.equal((await saveArticle(firstId, "First", "still unused", [unusedUrl]))?.status, 200);
  assert.equal(bucket.objects.has(objectKey(unusedUrl)), false);

  const deletionUrl = await uploadSvg("#789");
  assert.equal((await saveArticle(firstId, "First", `![delete](${deletionUrl})`))?.status, 200);
  const deletion = await handleR2ContentRequest(new Request(`${origin}/api/local-articles`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionId: "notes", id: firstId }),
  }), bucket);
  assert.equal(deletion?.status, 200);
  assert.equal(bucket.objects.has(objectKey(deletionUrl)), false);

  const list = await handleR2ContentRequest(new Request(`${origin}/api/local-articles`), bucket);
  const listPayload = await list.json();
  assert.equal(Object.hasOwn(listPayload.articles[0], "assetKeys"), false);
});
test("rendered article images have no default border", async () => {
  const css = await readFile(new URL("../app/reader.css", import.meta.url), "utf8");
  assert.match(css, /\.markdown-body img \{[^}]*border: 0;/s);
});
