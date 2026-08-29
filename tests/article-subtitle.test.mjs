import assert from "node:assert/strict";
import test from "node:test";

const subtitleModule = await import("../app/article-subtitle.ts").catch(() => null);

test("保留文章已有的副标题", () => {
  assert.ok(subtitleModule, "缺少文章副标题回退模块");
  assert.deepEqual(subtitleModule.resolveArticleSubtitle("  Existing subtitle  ", () => 0), {
    kind: "summary",
    text: "  Existing subtitle  ",
  });
});

test("空白副标题随机回退到带作者署名的人工智能科学家原文名言", () => {
  assert.ok(subtitleModule, "缺少文章副标题回退模块");

  const first = subtitleModule.resolveArticleSubtitle("   ", () => 0);
  const last = subtitleModule.resolveArticleSubtitle("", () => 0.999999);

  assert.deepEqual(first, {
    kind: "quote",
    text: "“We can only see a short distance ahead, but we can see plenty there that needs to be done.”",
    author: "Alan Turing",
  });
  assert.deepEqual(last, {
    kind: "quote",
    text: "“The creators of AI need to represent humanity.”",
    author: "Fei-Fei Li",
  });
  assert.notEqual(first, last);
});
