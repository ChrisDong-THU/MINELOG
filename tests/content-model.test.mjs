import assert from "node:assert/strict";
import test from "node:test";

import { contentFromLocalFiles } from "../app/content-model.ts";

const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";

test("载入存储时按永久文章 ID 清理历史重复记录", () => {
  const content = contentFromLocalFiles([
    {
      id: ARTICLE_ID,
      sectionId: "notes",
      title: "原始标题",
      summary: "旧版",
      date: "08.05",
      read: "2 MIN",
      tags: ["old"],
      markdown: "old body",
      updatedAt: "2026-08-05T08:00:00.000Z",
    },
    {
      id: ARTICLE_ID,
      sectionId: "notes",
      title: "重命名后的标题",
      summary: "最新",
      date: "08.06",
      read: "3 MIN",
      tags: ["new"],
      markdown: "new body",
      updatedAt: "2026-08-06T08:00:00.000Z",
    },
  ]);

  assert.equal(content.articles.notes.length, 1);
  assert.equal(content.articles.notes[0].title, "重命名后的标题");
  assert.equal(content.markdown[ARTICLE_ID], "new body");
});