import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import { remarkTyporaMath } from "../app/remark-typora-math.ts";

async function parse(markdown) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkTyporaMath);
  return processor.run(processor.parse(markdown), { value: markdown });
}

test("parses parenthesized LaTeX delimiters as inline math", async () => {
  const tree = await parse(String.raw`before \(x^2 + y^2\) after`);
  assert.deepEqual(tree.children[0].children.map(({ type, value }) => ({ type, value })), [
    { type: "text", value: "before " },
    { type: "inlineMath", value: "x^2 + y^2" },
    { type: "text", value: " after" },
  ]);
});

test("preserves Markdown escapes and entities around formulas", async () => {
  const tree = await parse(String.raw`A &NotEqualTilde; B \(\{x\}\) tail`);
  assert.deepEqual(tree.children[0].children.map(({ type, value }) => ({ type, value })), [
    { type: "text", value: "A \u2242\u0338 B " },
    { type: "inlineMath", value: String.raw`\{x\}` },
    { type: "text", value: " tail" },
  ]);
});
test("parses bracketed LaTeX delimiters as display math", async () => {
  const tree = await parse(String.raw`\[
    \frac{a}{b}
  \]`);
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].type, "math");
  assert.equal(tree.children[0].value, String.raw`\frac{a}{b}`);
  assert.equal(tree.children[0].position.start.offset, 0);
});

test("splits display math out of surrounding paragraph content", async () => {
  const tree = await parse(String.raw`before \[x + y\] after`);
  assert.deepEqual(tree.children.map(({ type, value, children }) => ({
    type,
    value,
    text: children?.map((child) => child.value).join(""),
  })), [
    { type: "paragraph", value: undefined, text: "before " },
    { type: "math", value: "x + y", text: undefined },
    { type: "paragraph", value: undefined, text: " after" },
  ]);
});

test("does not parse escaped delimiters or delimiters in code", async () => {
  const markdown = [
    String.raw`\\(literal\\) and ` + "`" + String.raw`\(inline code\)` + "`",
    "```text",
    String.raw`\[block code\]`,
    "```",
  ].join("\n");
  const tree = await parse(markdown);
  assert.equal(tree.children[0].children.some((child) => child.type === "inlineMath"), false);
  assert.equal(tree.children[0].children.some((child) => child.type === "inlineCode"), true);
  assert.equal(tree.children[1].type, "code");
});

test("keeps remark-math dollar delimiters working", async () => {
  const tree = await parse("inline $x$\n\n$$\ny^2\n$$");
  assert.equal(tree.children[0].children[1].type, "inlineMath");
  assert.equal(tree.children[1].type, "math");
});

test("parses inline delimiters in headings and GFM table cells", async () => {
  const tree = await parse(String.raw`# Energy \(E = mc^2\)

| Quantity |
| --- |
| \(m\) |`);

  assert.equal(tree.children[0].children[1].type, "inlineMath");
  assert.equal(tree.children[1].children[1].children[0].children[0].type, "inlineMath");
});
test("renders added delimiters through KaTeX", () => {
  const html = renderToStaticMarkup(createElement(ReactMarkdown, {
    remarkPlugins: [remarkMath, remarkTyporaMath],
    rehypePlugins: [rehypeKatex],
  }, String.raw`inline \(x^2\)

\[\frac{a}{b}\]`));
  assert.match(html, /class="katex"/);
  assert.match(html, /class="katex-display"/);
});