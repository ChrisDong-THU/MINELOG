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
      sectionId: "notes",
      image: { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` },
    }),
  }), bucket);

  assert.equal(upload?.status, 200);
  const payload = await upload.json();
  assert.match(payload.url, /^\/api\/local-assets\/notes\/[a-f0-9]{24}\.svg$/);

  const download = await handleR2ContentRequest(new Request(`https://minelog.example${payload.url}`), bucket);
  assert.equal(download?.status, 200);
  assert.equal(download.headers.get("content-type"), "image/svg+xml");
  assert.match(download.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.match(download.headers.get("content-security-policy") ?? "", /sandbox/);
  assert.equal(await download.text(), svg);
});

test("rendered article images have no default border", async () => {
  const css = await readFile(new URL("../app/reader.css", import.meta.url), "utf8");
  assert.match(css, /\.markdown-body img \{[^}]*border: 0;/s);
});
