import { markdownTableCellKey, normalizeMarkdownTableStyle, type MarkdownTableStyle } from "./markdown-table-style.ts";

export type MarkdownTableAction =
  | { kind: "insert-row"; at: number }
  | { kind: "delete-rows"; rows: number[] }
  | { kind: "duplicate-row"; row: number }
  | { kind: "move-row"; from: number; to: number }
  | { kind: "insert-column"; at: number }
  | { kind: "delete-columns"; columns: number[] }
  | { kind: "duplicate-column"; column: number }
  | { kind: "move-column"; from: number; to: number }
  | { kind: "update-cell"; row: number; column: number; value: string };

type ParsedTable = {
  prefix: string;
  rows: string[][];
  divider: string[];
};

function splitRow(line: string) {
  const prefix = line.match(/^(\s*(?:>\s*)*)/)?.[0] ?? "";
  let source = line.slice(prefix.length).trim();
  if (source.startsWith("|")) source = source.slice(1);
  if (source.endsWith("|")) source = source.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  let ticks = 0;
  for (const character of source) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }
    if (character === "`") {
      ticks = ticks ? 0 : 1;
      current += character;
      continue;
    }
    if (character === "|" && !ticks) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current.trim());
  return { prefix, cells };
}

function parseTable(source: string): ParsedTable | null {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length < 2) return null;
  const header = splitRow(lines[0]);
  const divider = splitRow(lines[1]).cells;
  if (!header.cells.length || divider.length !== header.cells.length || !divider.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  const rows = [header.cells, ...lines.slice(2).filter((line) => line.trim()).map((line) => splitRow(line).cells)];
  const columns = header.cells.length;
  return {
    prefix: header.prefix,
    divider,
    rows: rows.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? "")),
  };
}

export function markdownTableCells(source: string) {
  return parseTable(source)?.rows.map((row) => [...row]) ?? [];
}

function cleanCellValue(value: string) {
  return value.replace(/\r?\n+/g, " ").replace(/\|/g, "\\|").trim();
}

function serializeTable(table: ParsedTable) {
  const line = (cells: string[]) => `${table.prefix}| ${cells.join(" | ")} |`;
  return [line(table.rows[0]), line(table.divider), ...table.rows.slice(1).map(line)].join("\n");
}

function mapCellKeys(keys: Iterable<string>, map: (row: number, column: number) => [number, number] | null) {
  return [...keys].flatMap((key) => {
    const [row, column] = key.split(":").map(Number);
    const mapped = map(row, column);
    return mapped ? [markdownTableCellKey(mapped[0], mapped[1])] : [];
  });
}

function mapStyle(style: MarkdownTableStyle, map: (row: number, column: number) => [number, number] | null, widths: number[]) {
  const align = Object.fromEntries(Object.entries(style.align).flatMap(([key, value]) => {
    const [row, column] = key.split(":").map(Number);
    const mapped = map(row, column);
    return mapped ? [[markdownTableCellKey(mapped[0], mapped[1]), value]] : [];
  }));
  return normalizeMarkdownTableStyle({
    ...style,
    widths,
    dark: mapCellKeys(style.dark, map),
    bold: mapCellKeys(style.bold, map),
    align,
  });
}

function copyAxisStyle(style: MarkdownTableStyle, axis: "row" | "column", sourceIndex: number, targetIndex: number) {
  const copyKey = (key: string) => {
    const [row, column] = key.split(":").map(Number);
    if (axis === "row" && row === sourceIndex) return markdownTableCellKey(targetIndex, column);
    if (axis === "column" && column === sourceIndex) return markdownTableCellKey(row, targetIndex);
    return null;
  };
  const copyKeys = (keys: string[]) => [...keys, ...keys.flatMap((key) => copyKey(key) ?? [])];
  const align = { ...style.align };
  for (const [key, value] of Object.entries(style.align)) {
    const copied = copyKey(key);
    if (copied) align[copied] = value;
  }
  return normalizeMarkdownTableStyle({
    ...style,
    dark: copyKeys(style.dark),
    bold: copyKeys(style.bold),
    align,
  });
}

export function transformMarkdownTable(source: string, style: MarkdownTableStyle, action: MarkdownTableAction) {
  const table = parseTable(source);
  if (!table) throw new Error("无法解析 Markdown 表格");
  const columnCount = table.rows[0].length;
  let map = (row: number, column: number): [number, number] | null => [row, column];
  let widths = [...style.widths];
  let duplicatedAxis: { axis: "row" | "column"; source: number; target: number } | null = null;

  if (action.kind === "update-cell") {
    const row = Math.max(0, Math.min(table.rows.length - 1, Math.floor(action.row)));
    const column = Math.max(0, Math.min(columnCount - 1, Math.floor(action.column)));
    table.rows[row][column] = cleanCellValue(action.value);
  } else if (action.kind === "insert-row") {
    const at = Math.max(0, Math.min(table.rows.length, Math.floor(action.at)));
    table.rows.splice(at, 0, Array.from({ length: columnCount }, () => ""));
    map = (row, column) => [row >= at ? row + 1 : row, column];
  } else if (action.kind === "delete-rows") {
    const removed = new Set(action.rows.filter((row) => row >= 0 && row < table.rows.length));
    const kept = table.rows.map((row, index) => ({ row, index })).filter(({ index }) => !removed.has(index));
    table.rows = kept.length ? kept.map(({ row }) => row) : [Array.from({ length: columnCount }, () => "")];
    const nextIndex = new Map(kept.map(({ index }, position) => [index, position]));
    map = (row, column) => nextIndex.has(row) ? [nextIndex.get(row)!, column] : null;
  } else if (action.kind === "duplicate-row") {
    const row = Math.max(0, Math.min(table.rows.length - 1, Math.floor(action.row)));
    table.rows.splice(row + 1, 0, [...table.rows[row]]);
    map = (sourceRow, column) => [sourceRow > row ? sourceRow + 1 : sourceRow, column];
    duplicatedAxis = { axis: "row", source: row, target: row + 1 };
  } else if (action.kind === "move-row") {
    const from = Math.max(0, Math.min(table.rows.length - 1, Math.floor(action.from)));
    const to = Math.max(0, Math.min(table.rows.length - 1, Math.floor(action.to)));
    const [moved] = table.rows.splice(from, 1);
    table.rows.splice(to, 0, moved);
    map = (row, column) => {
      if (row === from) return [to, column];
      if (from < to && row > from && row <= to) return [row - 1, column];
      if (to < from && row >= to && row < from) return [row + 1, column];
      return [row, column];
    };
  } else if (action.kind === "insert-column") {
    const at = Math.max(0, Math.min(columnCount, Math.floor(action.at)));
    table.rows.forEach((row, rowIndex) => row.splice(at, 0, rowIndex === 0 ? `列 ${at + 1}` : ""));
    table.divider.splice(at, 0, "---");
    const fallbackWidth = widths.length ? Math.round(widths.reduce((sum, width) => sum + width, 0) / widths.length) : 120;
    if (widths.length) widths.splice(at, 0, fallbackWidth);
    map = (row, column) => [row, column >= at ? column + 1 : column];
  } else if (action.kind === "delete-columns") {
    const removed = new Set(action.columns.filter((column) => column >= 0 && column < columnCount));
    if (removed.size >= columnCount) removed.delete(Math.min(...removed));
    const kept = Array.from({ length: columnCount }, (_, index) => index).filter((index) => !removed.has(index));
    table.rows = table.rows.map((row) => kept.map((column) => row[column]));
    table.divider = kept.map((column) => table.divider[column]);
    widths = widths.length ? kept.map((column) => widths[column] ?? 120) : [];
    const nextIndex = new Map(kept.map((column, position) => [column, position]));
    map = (row, column) => nextIndex.has(column) ? [row, nextIndex.get(column)!] : null;
  } else if (action.kind === "duplicate-column") {
    const column = Math.max(0, Math.min(columnCount - 1, Math.floor(action.column)));
    table.rows.forEach((row) => row.splice(column + 1, 0, row[column]));
    table.divider.splice(column + 1, 0, table.divider[column]);
    if (widths.length) widths.splice(column + 1, 0, widths[column] ?? 120);
    map = (row, sourceColumn) => [row, sourceColumn > column ? sourceColumn + 1 : sourceColumn];
    duplicatedAxis = { axis: "column", source: column, target: column + 1 };
  } else if (action.kind === "move-column") {
    const from = Math.max(0, Math.min(columnCount - 1, Math.floor(action.from)));
    const to = Math.max(0, Math.min(columnCount - 1, Math.floor(action.to)));
    table.rows.forEach((row) => {
      const [moved] = row.splice(from, 1);
      row.splice(to, 0, moved);
    });
    const [movedDivider] = table.divider.splice(from, 1);
    table.divider.splice(to, 0, movedDivider);
    if (widths.length) {
      const [movedWidth] = widths.splice(from, 1);
      widths.splice(to, 0, movedWidth);
    }
    map = (row, column) => {
      if (column === from) return [row, to];
      if (from < to && column > from && column <= to) return [row, column - 1];
      if (to < from && column >= to && column < from) return [row, column + 1];
      return [row, column];
    };
  }

  const mappedStyle = mapStyle(style, map, widths);
  return {
    source: serializeTable(table),
    style: duplicatedAxis
      ? copyAxisStyle(mappedStyle, duplicatedAxis.axis, duplicatedAxis.source, duplicatedAxis.target)
      : mappedStyle,
  };
}
