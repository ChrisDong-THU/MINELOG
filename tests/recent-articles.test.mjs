import assert from "node:assert/strict";
import test from "node:test";

import { contentFromLocalFiles, selectRecentFeedEntries } from "../app/content-model.ts";

const ARTICLE_ID = "11111111-1111-4111-8111-111111111111";
const PAPER_ID = "22222222-2222-4222-8222-222222222222";
const sections = [
  { id: "notes", label: "笔记", icon: "/minecraft/items/book.png", enabled: true, description: "测试" },
  { id: "papers", label: "论文", icon: "/minecraft/items/paper.png", enabled: true, description: "测试" },
];

test("最近更新按永久文章 ID 去重并保留最新编辑位置", () => {
  const articles = {
    notes: [
      { id: ARTICLE_ID, title: "已重命名文章", summary: "旧版", date: "08.05", read: "2 MIN", tags: [], updatedAt: "2026-08-05T08:00:00.000Z" },
      { id: ARTICLE_ID, title: "已重命名文章", summary: "最新", date: "08.06", read: "3 MIN", tags: [], updatedAt: "2026-08-06T08:00:00.000Z" },
    ],
    papers: [
      { id: PAPER_ID, title: "另一篇文章", summary: "其他", date: "08.06", read: "1 MIN", tags: [], updatedAt: "2026-08-06T07:00:00.000Z" },
    ],
  };

  assert.deepEqual(selectRecentFeedEntries(sections, articles), [
    ["笔记", "已重命名文章", "08.06", "3 MIN", "notes", ARTICLE_ID],
    ["论文", "另一篇文章", "08.06", "1 MIN", "papers", PAPER_ID],
  ]);
});

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