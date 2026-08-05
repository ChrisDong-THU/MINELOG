import assert from "node:assert/strict";
import test from "node:test";

import {
  STORED_IMAGE_FILE_PATTERN,
  SVG_CONTENT_SECURITY_POLICY,
  imageExtensionForMime,
  imageMimeForExtension,
  imageResponseSecurityHeaders,
  normalizeImageMime,
} from "../shared/image-assets.ts";
import { isProtectedEditorMutation } from "../shared/editor-auth.ts";

test("图片存储规则在本地与线上适配器之间共享", () => {
  assert.equal(normalizeImageMime("image/svg+xml; charset=utf-8"), "image/svg+xml");
  assert.equal(imageExtensionForMime("image/svg+xml"), "svg");
  assert.equal(imageMimeForExtension("svg"), "image/svg+xml");
  assert.match("0123456789abcdef01234567.svg", STORED_IMAGE_FILE_PATTERN);
  assert.deepEqual(imageResponseSecurityHeaders("0123456789abcdef01234567.svg"), {
    "content-security-policy": SVG_CONTENT_SECURITY_POLICY,
  });
  assert.deepEqual(imageResponseSecurityHeaders("0123456789abcdef01234567.png"), {});
  assert.throws(() => normalizeImageMime("text/html"), /仅支持/);
});

test("编辑鉴权只保护内容写接口", () => {
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/local-articles", { method: "PUT" })), true);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/local-assets", { method: "POST" })), true);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/sections", { method: "DELETE" })), true);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/local-articles")), false);
  assert.equal(isProtectedEditorMutation(new Request("https://example.com/api/editor-auth", { method: "POST" })), false);
});