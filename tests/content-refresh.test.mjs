import assert from "node:assert/strict";
import test from "node:test";

const contentModel = await import("../app/content-model.ts");

test("刷新文章索引时保留已加载的正文", () => {
  assert.equal(typeof contentModel.mergeContentFromLocalFiles, "function", "缺少安全刷新文章索引的方法");

  const current = {
    articles: {},
    markdown: { "article-1": "cached body", "article-2": "old body", "deleted-article": "stale body" },
  };
  const refreshed = contentModel.mergeContentFromLocalFiles(current, [
    {
      id: "article-1",
      sectionId: "notes",
      title: "Metadata only",
      author: "Ada",
      summary: "",
      date: "09.01",
      read: "1 MIN",
      tags: [],
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "article-2",
      sectionId: "notes",
      title: "Fresh body",
      author: "Alan",
      summary: "",
      date: "09.01",
      read: "1 MIN",
      tags: [],
      markdown: "fresh body",
      updatedAt: "2026-09-01T00:00:01.000Z",
    },
  ]);

  assert.equal(refreshed.markdown["article-1"], "cached body");
  assert.equal(refreshed.markdown["article-2"], "fresh body");
  assert.equal("deleted-article" in refreshed.markdown, false);
});
