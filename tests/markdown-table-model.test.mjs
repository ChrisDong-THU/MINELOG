import assert from "node:assert/strict";
import test from "node:test";

import { transformMarkdownTable } from "../app/markdown-table-model.ts";

const table = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
const style = {
  widths: [120, 180],
  dark: ["1:1"],
  bold: ["2:0"],
  align: { "1:0": "center" },
  tableAlign: "left",
  headerRow: true,
  headerColumn: false,
};

test("插入行列时同步移动单元格样式与列宽", () => {
  const row = transformMarkdownTable(table, style, { kind: "insert-row", at: 1 });
  assert.match(row.source, /\| A \| B \|\n\| --- \| --- \|\n\|  \|  \|\n\| 1 \| 2 \|/);
  assert.deepEqual(row.style.dark, ["2:1"]);
  assert.equal(row.style.align["2:0"], "center");

  const column = transformMarkdownTable(row.source, row.style, { kind: "insert-column", at: 1 });
  assert.deepEqual(column.style.widths, [120, 150, 180]);
  assert.deepEqual(column.style.dark, ["2:2"]);
  assert.match(column.source, /^\| A \| 列 2 \| B \|/);
});

test("删除所选行列时移除对应样式并至少保留一列", () => {
  const rows = transformMarkdownTable(table, style, { kind: "delete-rows", rows: [1] });
  assert.equal(rows.source.includes("| 1 | 2 |"), false);
  assert.deepEqual(rows.style.dark, []);
  assert.deepEqual(rows.style.bold, ["1:0"]);

  const columns = transformMarkdownTable(table, style, { kind: "delete-columns", columns: [0] });
  assert.match(columns.source, /^\| B \|\n\| --- \|/);
  assert.deepEqual(columns.style.widths, [180]);
  assert.deepEqual(columns.style.dark, ["1:0"]);
});

test("支持直接编辑、复制和拖动重排行列", () => {
  const edited = transformMarkdownTable(table, style, { kind: "update-cell", row: 1, column: 0, value: "A | B" });
  assert.match(edited.source, /\| A \\\| B \| 2 \|/);

  const duplicated = transformMarkdownTable(table, style, { kind: "duplicate-row", row: 1 });
  assert.equal(duplicated.source.match(/\| 1 \| 2 \|/g)?.length, 2);
  assert.deepEqual(duplicated.style.dark, ["1:1", "2:1"]);
  assert.equal(duplicated.style.align["2:0"], "center");

  const duplicatedColumn = transformMarkdownTable(table, style, { kind: "duplicate-column", column: 1 });
  assert.deepEqual(duplicatedColumn.style.widths, [120, 180, 180]);
  assert.deepEqual(duplicatedColumn.style.dark, ["1:1", "1:2"]);

  const movedRow = transformMarkdownTable(table, style, { kind: "move-row", from: 2, to: 1 });
  assert.match(movedRow.source, /\| 3 \| 4 \|\n\| 1 \| 2 \|$/);
  assert.deepEqual(movedRow.style.bold, ["1:0"]);

  const movedColumn = transformMarkdownTable(table, style, { kind: "move-column", from: 1, to: 0 });
  assert.match(movedColumn.source, /^\| B \| A \|/);
  assert.deepEqual(movedColumn.style.widths, [180, 120]);
  assert.deepEqual(movedColumn.style.dark, ["1:0"]);
});
