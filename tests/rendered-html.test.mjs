import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the MINELOG application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="zh-CN"/i);
  assert.match(html, /<title>矿脉日志 MINELOG<\/title>/i);
  assert.match(html, /MINELOG/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/i);
});

test("keeps navigation, storage and content rendering in focused modules", async () => {
  const [page, navigation, storage, renderer, searchPage, layout, markdown] = await Promise.all([
    source("app/page.tsx"),
    source("app/navigation.ts"),
    source("app/browser-storage.ts"),
    source("app/components/markdown-renderer.tsx"),
    source("app/components/search-page.tsx"),
    source("app/layout.tsx"),
    source("content/ai/rag-latency.md"),
  ]);

  assert.match(page, /from "\.\/navigation"/);
  assert.match(page, /from "\.\/browser-storage"/);
  assert.match(page, /from "\.\/components\/feed-carousel"/);
  assert.match(page, /from "\.\/components\/section-page"/);
  assert.match(page, /from "\.\/components\/search-page"/);
  assert.doesNotMatch(page, /localStorage\.getItem|localStorage\.setItem/);

  assert.match(navigation, /pushState/);
  assert.match(navigation, /replaceState/);
  assert.match(navigation, /URLSearchParams/);
  assert.match(navigation, /view: "search"/);
  assert.match(storage, /useSyncExternalStore/);
  assert.match(storage, /StorageEvent/);

  assert.match(renderer, /remarkGfm/);
  assert.match(renderer, /remarkMath/);
  assert.match(renderer, /rehypeKatex/);
  assert.match(searchPage, /Markdown 正文/);
  assert.match(searchPage, /按相关度排序/);
  assert.match(searchPage, /slice\(0, 7\)/);
  assert.match(searchPage, /b\.count - a\.count/);
  assert.match(layout, /title:\s*"矿脉日志 MINELOG"/);
  assert.match(markdown, /^#/m);
});