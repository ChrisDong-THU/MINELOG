import { decodeNamedCharacterReference } from "decode-named-character-reference";

type Point = { line: number; column: number; offset?: number };
type Position = { start: Point; end: Point };
type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: Position;
  data?: Record<string, unknown>;
  meta?: string | null;
};

type MathDelimiter = {
  open: "\\(" | "\\[";
  close: "\\)" | "\\]";
  type: "inlineMath" | "math";
};

const DELIMITERS: MathDelimiter[] = [
  { open: "\\(", close: "\\)", type: "inlineMath" },
  { open: "\\[", close: "\\]", type: "math" },
];
const INLINE_BLOCK_TYPES = new Set(["heading", "tableCell"]);
const MARKDOWN_ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

function isEscaped(value: string, index: number) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function findClosingDelimiter(value: string, close: string, from: number) {
  let cursor = value.indexOf(close, from);
  while (cursor !== -1 && isEscaped(value, cursor)) cursor = value.indexOf(close, cursor + close.length);
  return cursor;
}

function advancePoint(start: Point, value: string): Point {
  const lines = value.split("\n");
  return {
    line: start.line + lines.length - 1,
    column: lines.length === 1 ? start.column + value.length : lines.at(-1)!.length + 1,
    offset: typeof start.offset === "number" ? start.offset + value.length : undefined,
  };
}

function positionSlice(position: Position | undefined, raw: string, start: number, end: number): Position | undefined {
  if (!position) return undefined;
  const sliceStart = advancePoint(position.start, raw.slice(0, start));
  return { start: sliceStart, end: advancePoint(sliceStart, raw.slice(start, end)) };
}

function decodedOffsetAt(raw: string, decoded: string, rawOffset: number) {
  let rawCursor = 0;
  let decodedCursor = 0;
  while (rawCursor < rawOffset && rawCursor < raw.length) {
    if (raw[rawCursor] === "\\" && rawCursor + 1 < raw.length && MARKDOWN_ESCAPABLE.test(raw[rawCursor + 1])) {
      rawCursor += 2;
      decodedCursor += 1;
      continue;
    }
    if (raw[rawCursor] === "&") {
      const semicolon = raw.indexOf(";", rawCursor + 1);
      const entity = semicolon === -1 ? false : decodeNamedCharacterReference(raw.slice(rawCursor + 1, semicolon));
      if (semicolon !== -1 && semicolon < rawOffset && entity && decoded.startsWith(entity, decodedCursor)) {
        rawCursor = semicolon + 1;
        decodedCursor += entity.length;
        continue;
      }
    }
    rawCursor += 1;
    decodedCursor += 1;
  }
  return decodedCursor;
}

function textNode(source: MarkdownNode, raw: string, start: number, end: number): MarkdownNode | null {
  const decoded = source.value ?? "";
  const value = decoded.slice(decodedOffsetAt(raw, decoded, start), decodedOffsetAt(raw, decoded, end));
  if (!value) return null;
  return { type: "text", value, position: positionSlice(source.position, raw, start, end) };
}

function parseDelimitedMath(node: MarkdownNode, markdown: string, allowDisplay: boolean) {
  const sourceStart = node.position?.start.offset;
  const sourceEnd = node.position?.end.offset;
  if (typeof sourceStart !== "number" || typeof sourceEnd !== "number") return [node];
  const raw = markdown.slice(sourceStart, sourceEnd);
  const result: MarkdownNode[] = [];
  let plainStart = 0;
  let cursor = 0;

  while (cursor < raw.length - 1) {
    const delimiter = DELIMITERS.find(({ open, type }) =>
      raw.startsWith(open, cursor) && !isEscaped(raw, cursor) && (allowDisplay || type === "inlineMath"),
    );
    if (!delimiter) {
      cursor += 1;
      continue;
    }

    const closeAt = findClosingDelimiter(raw, delimiter.close, cursor + delimiter.open.length);
    if (closeAt === -1) {
      cursor += delimiter.open.length;
      continue;
    }

    const preceding = textNode(node, raw, plainStart, cursor);
    if (preceding) result.push(preceding);
    const end = closeAt + delimiter.close.length;
    const value = raw.slice(cursor + delimiter.open.length, closeAt).trim();
    const position = positionSlice(node.position, raw, cursor, end);
    result.push(delimiter.type === "inlineMath" ? {
      type: "inlineMath",
      value,
      position,
      data: {
        hName: "code",
        hProperties: { className: ["language-math", "math-inline"] },
        hChildren: [{ type: "text", value }],
      },
    } : {
      type: "math",
      value,
      meta: null,
      position,
      data: {
        hName: "pre",
        hChildren: [{
          type: "element",
          tagName: "code",
          properties: { className: ["language-math", "math-display"] },
          children: [{ type: "text", value }],
        }],
      },
    });
    cursor = end;
    plainStart = end;
  }

  const trailing = textNode(node, raw, plainStart, raw.length);
  if (trailing) result.push(trailing);
  return result.length ? result : [node];
}

function childSpan(children: MarkdownNode[]): Position | undefined {
  const start = children.find((child) => child.position)?.position?.start;
  const end = [...children].reverse().find((child) => child.position)?.position?.end;
  return start && end ? { start, end } : undefined;
}

function paragraphWith(children: MarkdownNode[]): MarkdownNode {
  return { type: "paragraph", children, position: childSpan(children) };
}

function transformInlineContainer(node: MarkdownNode, markdown: string): MarkdownNode {
  if (!node.children || node.type === "code" || node.type === "inlineCode") return node;
  return {
    ...node,
    children: node.children.flatMap((child) =>
      child.type === "text" ? parseDelimitedMath(child, markdown, false) : [transformInlineContainer(child, markdown)],
    ),
  };
}

function transformParagraph(paragraph: MarkdownNode, markdown: string) {
  const parsed = (paragraph.children ?? []).flatMap((child) =>
    child.type === "text" ? parseDelimitedMath(child, markdown, true) : [transformInlineContainer(child, markdown)],
  );
  if (!parsed.some((child) => child.type === "math")) return [{ ...paragraph, children: parsed }];

  const blocks: MarkdownNode[] = [];
  let inline: MarkdownNode[] = [];
  const flushInline = () => {
    if (inline.some((child) => child.type !== "text" || child.value?.trim())) blocks.push(paragraphWith(inline));
    inline = [];
  };

  for (const child of parsed) {
    if (child.type === "math") {
      flushInline();
      blocks.push(child);
    } else {
      inline.push(child);
    }
  }
  flushInline();
  return blocks;
}

function transformBlocks(node: MarkdownNode, markdown: string): MarkdownNode {
  if (!node.children || node.type === "code" || node.type === "inlineCode") return node;
  if (INLINE_BLOCK_TYPES.has(node.type)) return transformInlineContainer(node, markdown);
  return {
    ...node,
    children: node.children.flatMap((child) =>
      child.type === "paragraph" ? transformParagraph(child, markdown) : [transformBlocks(child, markdown)],
    ),
  };
}

/** Adds the LaTeX delimiters accepted by Typora/MathJax but not parsed by remark-math. */
export function remarkTyporaMath() {
  return (tree: MarkdownNode, file: { value?: unknown }) => transformBlocks(tree, String(file.value ?? ""));
}
