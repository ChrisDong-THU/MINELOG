import assert from "node:assert/strict";
import test from "node:test";

import {
  markdownTableCellKey,
  normalizeMarkdownTableStyle,
  readMarkdownTableStyle,
  setMarkdownTableCells,
  writeMarkdownTableStyle,
} from "../app/markdown-table-style.ts";

const table = "| A | B |\n| --- | --- |\n| 1 | 2 |";

test("表格样式元数据紧邻表格保存且不会改写标准表格内容", () => {
  const markdown = `${table}\n\n后续正文`;
  const style = { widths: [180.4, 260], dark: ["1:0"], bold: ["0:0", "0:1"], align: {}, tableAlign: "center", headerRow: true, headerColumn: false };
  const edit = writeMarkdownTableStyle(markdown, table.length, style);

  assert.equal(edit.markdown.startsWith(table), true);
  assert.match(edit.markdown, /<!-- minelog-table:\{"widths":\[180,260\],"dark":\["1:0"\],"bold":\["0:0","0:1"\],"align":\{\},"tableAlign":"center","headerRow":true,"headerColumn":false\} -->/);
  assert.deepEqual(readMarkdownTableStyle(edit.markdown, table.length).style, {
    widths: [180, 260],
    dark: ["1:0"],
    bold: ["0:0", "0:1"],
    align: {},
    tableAlign: "center",
    headerRow: true,
    headerColumn: false,
  });
  assert.match(edit.markdown, / -->\n后续正文$/);
});

test("更新和清空表格样式时复用同一元数据位置", () => {
  const first = writeMarkdownTableStyle(table, table.length, { widths: [120, 120], dark: [], bold: [], align: {}, tableAlign: "left", headerRow: true, headerColumn: false });
  const second = writeMarkdownTableStyle(first.markdown, table.length, { widths: [160, 160], dark: ["1:1"], bold: [], align: {}, tableAlign: "right", headerRow: true, headerColumn: false });
  assert.equal(second.markdown.match(/minelog-table:/g)?.length, 1);
  assert.deepEqual(readMarkdownTableStyle(second.markdown, table.length).style.widths, [160, 160]);
  assert.equal(readMarkdownTableStyle(second.markdown, table.length).style.tableAlign, "right");

  const cleared = writeMarkdownTableStyle(second.markdown, table.length, { widths: [], dark: [], bold: [], align: {}, tableAlign: "left", headerRow: false, headerColumn: false });
  assert.equal(cleared.markdown.includes("minelog-table:"), false);
  assert.equal(cleared.markdown.startsWith(table), true);
});

test("单元格样式键经过校验并支持批量切换", () => {
  const normalized = normalizeMarkdownTableStyle({ widths: [12, 1200, "bad"], dark: ["2:1", "bad", "2:1"], bold: [] });
  assert.deepEqual(normalized, { widths: [48, 800], dark: ["2:1"], bold: [], align: {}, tableAlign: "left", headerRow: false, headerColumn: false });
  const keys = [markdownTableCellKey(1, 0), markdownTableCellKey(1, 1)];
  const enabled = setMarkdownTableCells(normalized, keys, "bold", true);
  assert.deepEqual(enabled.bold, ["1:0", "1:1"]);
  assert.deepEqual(setMarkdownTableCells(enabled, ["1:0"], "bold", false).bold, ["1:1"]);
});
