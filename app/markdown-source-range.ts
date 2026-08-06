export type MarkdownSourceRange = { start: number; end: number };

type SourceLine = MarkdownSourceRange & { text: string };

function sourceLines(markdown: string, range: MarkdownSourceRange): SourceLine[] {
  const start = Math.min(Math.max(0, range.start), markdown.length);
  const end = Math.min(Math.max(start, range.end), markdown.length);
  const lines: SourceLine[] = [];
  let cursor = start;

  while (cursor < end) {
    const newline = markdown.indexOf("\n", cursor);
    const next = newline === -1 || newline >= end ? end : newline + 1;
    const contentEnd = next > cursor && markdown[next - 1] === "\n"
      ? next - (next > cursor + 1 && markdown[next - 2] === "\r" ? 2 : 1)
      : next;
    lines.push({ start: cursor, end: contentEnd, text: markdown.slice(cursor, contentEnd) });
    cursor = next;
  }

  return lines;
}

export function markdownCodeLineRange(
  markdown: string,
  blockRange: MarkdownSourceRange,
  renderedLineIndex: number,
): MarkdownSourceRange | null {
  const lines = sourceLines(markdown, blockRange);
  if (lines.length === 0) return null;

  const openingFence = lines[0].text.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  let contentLines = lines;
  if (openingFence) {
    const marker = openingFence[1][0];
    const minimumLength = openingFence[1].length;
    const closingFence = new RegExp(`^[ \\t]{0,3}${marker}{${minimumLength},}[ \\t]*$`);
    const lastLine = lines.at(-1);
    const contentEnd = lastLine && closingFence.test(lastLine.text) ? -1 : undefined;
    contentLines = lines.slice(1, contentEnd);
  }

  if (contentLines.length === 0) return null;
  const lineIndex = Math.min(Math.max(0, Math.floor(renderedLineIndex)), contentLines.length - 1);
  const line = contentLines[lineIndex];
  return { start: line.start, end: line.end };
}
