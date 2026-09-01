import assert from "node:assert/strict";
import test from "node:test";

import { buildArticleSavePayload } from "../app/local-article-files.ts";
import { applyTextPatch } from "../shared/text-patch.ts";

const BASE_ARTICLE = {
  id: "11111111-1111-4111-8111-111111111111",
  sectionId: "notes",
  title: "Incremental update",
  author: "Ada",
  summary: "",
  date: "09.01",
  read: "1 MIN",
  tags: [],
  updatedAt: "2026-09-01T01:00:00.000Z",
};

test("长文章的小改动只发送版本化文本补丁", () => {
  const before = `${"a".repeat(1200)}old${"z".repeat(1200)}`;
  const after = `${"a".repeat(1200)}new${"z".repeat(1200)}`;
  const payload = buildArticleSavePayload(
    { ...BASE_ARTICLE, markdown: after },
    [],
    { markdown: before, updatedAt: "2026-08-31T12:00:00.000Z" },
  );

  assert.equal("markdown" in payload.article, false);
  assert.equal(payload.markdownPatch.baseUpdatedAt, "2026-08-31T12:00:00.000Z");
  assert.equal(applyTextPatch(before, payload.markdownPatch), after);
});

test("补丁不节省空间或缺少基准版本时发送完整正文", () => {
  const short = buildArticleSavePayload(
    { ...BASE_ARTICLE, markdown: "new" },
    [],
    { markdown: "old", updatedAt: "2026-08-31T12:00:00.000Z" },
  );
  const unversioned = buildArticleSavePayload(
    { ...BASE_ARTICLE, markdown: "new body" },
    [],
    { markdown: "old body" },
  );

  assert.equal(short.article.markdown, "new");
  assert.equal(short.markdownPatch, undefined);
  assert.equal(short.baseUpdatedAt, "2026-08-31T12:00:00.000Z");
  assert.equal(unversioned.article.markdown, "new body");
  assert.equal(unversioned.baseUpdatedAt, undefined);
});
