export type MarkdownTableStyle = {
  widths: number[];
  dark: string[];
  bold: string[];
  align: Record<string, "left" | "center" | "right">;
  tableAlign: "left" | "center" | "right";
  headerRow: boolean;
  headerColumn: boolean;
};

export type MarkdownTableStyleEdit = {
  markdown: string;
  start: number;
  previousEnd: number;
  nextEnd: number;
};

const TABLE_STYLE_PREFIX = "<!-- minelog-table:";
const TABLE_STYLE_SUFFIX = " -->";
const CELL_KEY = /^(0|[1-9]\d{0,2}):(0|[1-9]\d{0,2})$/;
const MAX_CELL_STYLE_ENTRIES = 10_000;

export const EMPTY_MARKDOWN_TABLE_STYLE: MarkdownTableStyle = {
  widths: [],
  dark: [],
  bold: [],
  align: {},
  tableAlign: "left",
  headerRow: true,
  headerColumn: false,
};

function emptyMarkdownTableStyle(): MarkdownTableStyle {
  return { ...EMPTY_MARKDOWN_TABLE_STYLE, align: {} };
}

function uniqueCellKeys(value: unknown) {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  for (const entry of value) {
    if (typeof entry === "string" && CELL_KEY.test(entry)) keys.add(entry);
    if (keys.size >= MAX_CELL_STYLE_ENTRIES) break;
  }
  return [...keys].sort((a, b) => {
    const [ar, ac] = a.split(":").map(Number);
    const [br, bc] = b.split(":").map(Number);
    return ar - br || ac - bc;
  });
}

export function normalizeMarkdownTableStyle(value: unknown): MarkdownTableStyle {
  if (!value || typeof value !== "object") return emptyMarkdownTableStyle();
  const source = value as Record<string, unknown>;
  const widths = Array.isArray(source.widths)
    ? source.widths.slice(0, 100).map((width) => typeof width === "number" && Number.isFinite(width)
      ? Math.max(48, Math.min(800, Math.round(width)))
      : 0).filter((width) => width > 0)
    : [];
  const alignEntries: [string, "left" | "center" | "right"][] = [];
  if (source.align && typeof source.align === "object" && !Array.isArray(source.align)) {
    for (const [key, value] of Object.entries(source.align)) {
      if (CELL_KEY.test(key) && (value === "left" || value === "center" || value === "right")) alignEntries.push([key, value]);
      if (alignEntries.length >= MAX_CELL_STYLE_ENTRIES) break;
    }
  }
  const align = Object.fromEntries(alignEntries);
  return {
    widths,
    dark: uniqueCellKeys(source.dark),
    bold: uniqueCellKeys(source.bold),
    align,
    tableAlign: source.tableAlign === "center" || source.tableAlign === "right" ? source.tableAlign : "left",
    headerRow: source.headerRow !== false,
    headerColumn: source.headerColumn === true,
  };
}

export function markdownTableCellKey(row: number, column: number) {
  return `${Math.max(0, Math.floor(row))}:${Math.max(0, Math.floor(column))}`;
}

function tableStyleMetadata(markdown: string, tableEnd: number) {
  const end = Math.max(0, Math.min(markdown.length, Math.floor(tableEnd)));
  const tail = markdown.slice(end);
  const match = /^[ \t]*(?:\r?\n[ \t]*){1,3}<!-- minelog-table:(\{[^\r\n]*\}) -->/.exec(tail);
  if (!match) return null;
  const commentOffset = match[0].lastIndexOf(TABLE_STYLE_PREFIX);
  const start = end + commentOffset;
  return { start, end: end + match[0].length, json: match[1] };
}

export function readMarkdownTableStyle(markdown: string, tableEnd: number) {
  const metadata = tableStyleMetadata(markdown, tableEnd);
  if (!metadata) return { style: emptyMarkdownTableStyle(), metadata: null };
  try {
    return { style: normalizeMarkdownTableStyle(JSON.parse(metadata.json)), metadata: { start: metadata.start, end: metadata.end } };
  } catch {
    return { style: emptyMarkdownTableStyle(), metadata: { start: metadata.start, end: metadata.end } };
  }
}

function styleIsEmpty(style: MarkdownTableStyle) {
  return style.widths.length === 0
    && style.dark.length === 0
    && style.bold.length === 0
    && Object.keys(style.align).length === 0
    && style.tableAlign === "left"
    && style.headerRow
    && !style.headerColumn;
}

export function writeMarkdownTableStyle(markdown: string, tableEnd: number, value: MarkdownTableStyle): MarkdownTableStyleEdit {
  const style = normalizeMarkdownTableStyle(value);
  const current = tableStyleMetadata(markdown, tableEnd);
  const replacement = styleIsEmpty(style) ? "" : `${TABLE_STYLE_PREFIX}${JSON.stringify(style)}${TABLE_STYLE_SUFFIX}`;
  if (current) {
    const next = markdown.slice(0, current.start) + replacement + markdown.slice(current.end);
    return { markdown: next, start: current.start, previousEnd: current.end, nextEnd: current.start + replacement.length };
  }
  if (!replacement) return { markdown, start: tableEnd, previousEnd: tableEnd, nextEnd: tableEnd };

  const end = Math.max(0, Math.min(markdown.length, Math.floor(tableEnd)));
  const tail = markdown.slice(end);
  const lineBreak = /^[ \t]*(\r?\n)[ \t]*/.exec(tail);
  if (lineBreak) {
    const start = end + lineBreak[0].length;
    const next = markdown.slice(0, start) + replacement + markdown.slice(start);
    return { markdown: next, start, previousEnd: start, nextEnd: start + replacement.length };
  }
  const separator = markdown.includes("\r\n") ? "\r\n" : "\n";
  const insertion = separator + replacement;
  const next = markdown.slice(0, end) + insertion + markdown.slice(end);
  return { markdown: next, start: end, previousEnd: end, nextEnd: end + insertion.length };
}

export function setMarkdownTableCells(style: MarkdownTableStyle, keys: Iterable<string>, property: "dark" | "bold", enabled: boolean) {
  const selected = new Set([...keys].filter((key) => CELL_KEY.test(key)));
  const next = new Set(style[property]);
  for (const key of selected) {
    if (enabled) next.add(key);
    else next.delete(key);
  }
  return normalizeMarkdownTableStyle({ ...style, [property]: [...next] });
}

export function alignMarkdownTableCells(style: MarkdownTableStyle, keys: Iterable<string>, alignment: "left" | "center" | "right") {
  const align = { ...style.align };
  for (const key of keys) {
    if (CELL_KEY.test(key)) align[key] = alignment;
  }
  return normalizeMarkdownTableStyle({ ...style, align });
}

export function clearMarkdownTableCells(style: MarkdownTableStyle, keys: Iterable<string>) {
  const selected = new Set(keys);
  const align = Object.fromEntries(Object.entries(style.align).filter(([key]) => !selected.has(key)));
  return normalizeMarkdownTableStyle({
    ...style,
    dark: style.dark.filter((key) => !selected.has(key)),
    bold: style.bold.filter((key) => !selected.has(key)),
    align,
  });
}
