import assert from "node:assert/strict";
import test from "node:test";

import { remarkMinelogTableMetadata } from "../app/remark-minelog-table-metadata.ts";

test("表格内部配置参与读取但不会生成可见 Markdown 节点", () => {
  const tree = {
    type: "root",
    children: [
      { type: "table", children: [] },
      { type: "html", value: '<!-- minelog-table:{"widths":[120,180]} -->' },
      { type: "html", value: "<details>正文 HTML</details>" },
    ],
  };
  remarkMinelogTableMetadata()(tree);
  assert.deepEqual(tree.children.map((node) => node.type), ["table", "html"]);
  assert.equal(tree.children[1].value, "<details>正文 HTML</details>");
});
