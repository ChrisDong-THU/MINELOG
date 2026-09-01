import assert from "node:assert/strict";
import test from "node:test";

import { formatArticleViews } from "../app/article-views.ts";

test("浏览次数超过 999 时显示为 999+", () => {
  assert.equal(formatArticleViews(0), "0");
  assert.equal(formatArticleViews(999), "999");
  assert.equal(formatArticleViews(1000), "999+");
  assert.equal(formatArticleViews(12876), "999+");
});
