import assert from "node:assert/strict";
import test from "node:test";

import { markdownCodeLineRange } from "../app/markdown-source-range.ts";

test("maps a rendered fenced-code line to its exact Markdown source line", () => {
  const markdown = "before\n\n```ts\nconst first = 1;\nconst second = 2;\n```\n\nafter";
  const start = markdown.indexOf("```ts");
  const end = markdown.indexOf("```", start + 3) + 3;
  const range = markdownCodeLineRange(markdown, { start, end }, 1);

  assert.deepEqual(range, {
    start: markdown.indexOf("const second"),
    end: markdown.indexOf("const second") + "const second = 2;".length,
  });
});

test("supports tilde fences, CRLF source and out-of-range visual coordinates", () => {
  const markdown = "~~~python\r\nfirst()\r\nsecond()\r\n~~~";
  const range = markdownCodeLineRange(markdown, { start: 0, end: markdown.length }, 99);

  assert.deepEqual(range, {
    start: markdown.indexOf("second()"),
    end: markdown.indexOf("second()") + "second()".length,
  });
});

test("maps indented code blocks without requiring fence markers", () => {
  const markdown = "    alpha\n    beta";
  assert.deepEqual(markdownCodeLineRange(markdown, { start: 0, end: markdown.length }, 0), {
    start: 0,
    end: "    alpha".length,
  });
});

test("maps fenced code nested in a block quote to the matching source line", () => {
  const markdown = "> ```js\n> const first = 1;\n> const second = 2;\n> ```";
  const start = markdown.indexOf("```js");
  const range = markdownCodeLineRange(markdown, { start, end: markdown.length }, 1);

  assert.deepEqual(range, {
    start: markdown.indexOf("> const second"),
    end: markdown.indexOf("> const second") + "> const second = 2;".length,
  });
});
