import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  STORED_IMAGE_FILE_PATTERN,
  SVG_CONTENT_SECURITY_POLICY,
  imageAssetKeyFromUrl,
  imageAssetKeysFromMarkdown,
  imageAssetReferenceCounts,
  imageExtensionForMime,
  imageMimeForExtension,
  imageMimeForStoredFile,
  imageResponseSecurityHeaders,
  normalizeImageMime,
} from "../shared/image-assets.ts";
import { isProtectedEditorMutation } from "../shared/editor-auth.ts";
import { localArticleAssets } from "../build/local-article-assets-plugin.ts";
import { localArticleFiles } from "../build/local-article-files-plugin.ts";
import { versionLocalArticleImageUrl } from "../app/local-article-assets.ts";

test("图片存储规则在本地与线上适配器之间共享", () => {
  assert.equal(normalizeImageMime("image/svg+xml; charset=utf-8"), "image/svg+xml");
  assert.equal(imageExtensionForMime("image/svg+xml"), "svg");
  assert.equal(imageMimeForExtension("svg"), "image/svg+xml");
  assert.equal(imageMimeForStoredFile("0123456789abcdef01234567.svg"), "image/svg+xml");
  assert.equal(versionLocalArticleImageUrl("/api/local-assets/notes/image.svg"), "/api/local-assets/notes/image.svg?local-asset-v=2");
  assert.equal(versionLocalArticleImageUrl("https://example.com/image.svg"), "https://example.com/image.svg");
  assert.match("0123456789abcdef01234567.svg", STORED_IMAGE_FILE_PATTERN);
  assert.deepEqual(imageResponseSecurityHeaders("0123456789abcdef01234567.svg"), {
    "content-security-policy": SVG_CONTENT_SECURITY_POLICY,
  });
  assert.deepEqual(imageResponseSecurityHeaders("0123456789abcdef01234567.png"), {});
  assert.throws(() => normalizeImageMime("text/html"), /仅支持/);
});

test("编辑鉴权只保护内容写接口", () => {
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/local-articles", { method: "PUT" })), true);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/local-assets", { method: "POST" })), true);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/sections", { method: "DELETE" })), true);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/local-articles")), false);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/editor-auth", { method: "POST" })), false);
});

test("stored image references are unique per article and counted across articles", () => {
  const firstUrl = "/api/local-assets/notes/0123456789abcdef01234567.svg";
  const secondUrl = "/api/local-assets/notes/89abcdef0123456701234567.png";
  const firstKey = "assets/notes/0123456789abcdef01234567.svg";
  const secondKey = "assets/notes/89abcdef0123456701234567.png";

  assert.equal(imageAssetKeyFromUrl(`${firstUrl}?local-asset-v=2`), firstKey);
  assert.equal(imageAssetKeyFromUrl("https://example.com/image.svg"), null);
  assert.deepEqual(
    imageAssetKeysFromMarkdown(`![one](${firstUrl})\n![duplicate](${firstUrl})\n<img src="${secondUrl}">`),
    [firstKey, secondKey],
  );
  assert.deepEqual(
    [...imageAssetReferenceCounts([[firstKey, firstKey], [firstKey, secondKey]])],
    [[firstKey, 2], [secondKey, 1]],
  );
});
test("local image responses use browser-renderable MIME types", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "minelog-local-assets-"));
  const sectionId = "notes";
  const assetsDirectory = join(projectRoot, "content", "local", sectionId, "assets");
  const pngName = "89abcdef0123456701234567.png";
  await mkdir(assetsDirectory, { recursive: true });
  await writeFile(join(assetsDirectory, pngName), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

  const plugin = localArticleAssets();
  plugin.configResolved?.({ root: projectRoot });
  let middleware;
  plugin.configureServer?.({
    middlewares: { use(handler) { middleware = handler; } },
    config: { logger: { error() {} } },
  });
  assert.equal(typeof middleware, "function");

  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end("Not found");
    });
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>';
    const uploadResponse = await fetch(`${origin}/api/local-assets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sectionId,
        image: { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` },
      }),
    });
    assert.equal(uploadResponse.status, 200);
    const uploaded = await uploadResponse.json();
    assert.match(uploaded.url, new RegExp(`^/api/local-assets/${sectionId}/[a-f0-9]{24}\\.svg$`));

    const [svgResponse, pngResponse] = await Promise.all([
      fetch(`${origin}${uploaded.url}`),
      fetch(`${origin}/api/local-assets/${sectionId}/${pngName}`),
    ]);

    assert.equal(svgResponse.status, 200);
    assert.equal(svgResponse.headers.get("content-type"), "image/svg+xml");
    assert.equal(svgResponse.headers.get("x-content-type-options"), "nosniff");
    assert.equal(svgResponse.headers.get("cache-control"), "no-store");
    assert.equal(await svgResponse.text(), svg);
    assert.equal(pngResponse.status, 200);
    assert.equal(pngResponse.headers.get("content-type"), "image/png");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test("local storage preserves shared images until the final reference is removed", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "minelog-local-references-"));
  const middlewares = [];
  for (const plugin of [localArticleAssets(), localArticleFiles()]) {
    plugin.configResolved?.({ root: projectRoot });
    plugin.configureServer?.({
      middlewares: { use(handler) { middlewares.push(handler); } },
      config: { logger: { error() {} } },
    });
  }

  const server = createServer((request, response) => {
    let index = 0;
    const next = () => {
      const middleware = middlewares[index++];
      if (middleware) return middleware(request, response, next);
      response.statusCode = 404;
      response.end("Not found");
    };
    next();
  });

  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;

    async function uploadSvg(fill) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path fill="${fill}" d="M0 0h1v1H0z"/></svg>`;
      const response = await fetch(`${origin}/api/local-assets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sectionId: "notes",
          image: { dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` },
        }),
      });
      assert.equal(response.status, 200);
      return (await response.json()).url;
    }

    async function saveArticle(id, title, markdown, cleanupAssetUrls = []) {
      return fetch(`${origin}/api/local-articles`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          article: {
            id,
            sectionId: "notes",
            title,
            summary: "local cleanup",
            date: "08.06",
            read: "1 MIN",
            tags: [],
            markdown,
            updatedAt: "2026-08-06T08:00:00.000Z",
          },
          cleanupAssetUrls,
        }),
      });
    }

    const firstId = "55555555-5555-4555-8555-555555555555";
    const secondId = "66666666-6666-4666-8666-666666666666";
    const sharedUrl = await uploadSvg("#abc");
    const sharedMarkdown = `![shared](${sharedUrl})`;
    assert.equal((await saveArticle(firstId, "First", sharedMarkdown)).status, 200);
    assert.equal((await saveArticle(secondId, "Second", sharedMarkdown)).status, 200);

    assert.equal((await saveArticle(firstId, "First", "removed", [sharedUrl])).status, 200);
    assert.equal((await fetch(`${origin}${sharedUrl}`)).status, 200);
    assert.equal((await saveArticle(secondId, "Second", "removed", [sharedUrl])).status, 200);
    assert.equal((await fetch(`${origin}${sharedUrl}`)).status, 404);

    const unusedUrl = await uploadSvg("#def");
    assert.equal((await saveArticle(firstId, "First", "unused upload", [unusedUrl])).status, 200);
    assert.equal((await fetch(`${origin}${unusedUrl}`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(projectRoot, { recursive: true, force: true });
  }
});
