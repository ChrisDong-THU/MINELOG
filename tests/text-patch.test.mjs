import assert from "node:assert/strict";
import test from "node:test";

const textPatch = await import("../shared/text-patch.ts").catch(() => null);

test("文本补丁只携带新旧正文之间的最小连续差异", () => {
  assert.ok(textPatch, "缺少文本补丁模块");
  const patch = textPatch.createTextPatch("prefix old suffix", "prefix new suffix");

  assert.deepEqual(patch, { start: 7, deleteCount: 3, insert: "new" });
  assert.equal(textPatch.applyTextPatch("prefix old suffix", patch), "prefix new suffix");
});

test("文本补丁拒绝越界内容并只在确实节省传输时启用", () => {
  assert.ok(textPatch, "缺少文本补丁模块");
  assert.throws(
    () => textPatch.applyTextPatch("short", { start: 4, deleteCount: 2, insert: "x" }),
    /越界/,
  );

  const smallPatch = textPatch.createTextPatch("a".repeat(2000), `${"a".repeat(1000)}x${"a".repeat(999)}`);
  assert.equal(textPatch.textPatchSavesBytes(smallPatch, `${"a".repeat(1000)}x${"a".repeat(999)}`), true);
  assert.equal(textPatch.textPatchSavesBytes({ start: 0, deleteCount: 1, insert: "x" }, "x"), false);
});

test("版本化补丁校验并规范化来自网络的输入", () => {
  assert.ok(textPatch, "缺少文本补丁模块");
  assert.deepEqual(textPatch.normalizeVersionedTextPatch({
    start: 2,
    deleteCount: 1,
    insert: "新",
    baseUpdatedAt: "2026-09-01T00:00:00.000Z",
  }), {
    start: 2,
    deleteCount: 1,
    insert: "新",
    baseUpdatedAt: "2026-09-01T00:00:00.000Z",
  });
  assert.throws(() => textPatch.normalizeVersionedTextPatch({ start: -1 }), /补丁/);
});
