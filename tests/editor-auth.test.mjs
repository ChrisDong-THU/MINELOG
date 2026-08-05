import assert from "node:assert/strict";
import test from "node:test";
import {
  EDITOR_SESSION_MAX_AGE_SECONDS,
  createEditorSession,
  handleEditorAuthRequest,
  verifyEditorSession,
} from "../shared/editor-auth.ts";

const ACCESS_KEY = "123456";

test("editor device sessions expire after five days", async () => {
  const now = Math.floor(Date.now() / 1000);
  const fresh = await createEditorSession(ACCESS_KEY, now);
  const expired = await createEditorSession(ACCESS_KEY, now - EDITOR_SESSION_MAX_AGE_SECONDS - 1);
  const tooFarInFuture = await createEditorSession(ACCESS_KEY, now + 301);

  assert.equal(EDITOR_SESSION_MAX_AGE_SECONDS, 432000);
  assert.equal(await verifyEditorSession(fresh, ACCESS_KEY), true);
  assert.equal(await verifyEditorSession(fresh, "654321"), false);
  assert.equal(await verifyEditorSession(expired, ACCESS_KEY), false);
  assert.equal(await verifyEditorSession(tooFarInFuture, ACCESS_KEY), false);
  assert.equal(await verifyEditorSession(`${fresh}tampered`, ACCESS_KEY), false);
});

test("successful verification sets a five-day secure HttpOnly cookie", async () => {
  const response = await handleEditorAuthRequest(new Request("https://minelog.example/api/editor-auth", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://minelog.example",
      "x-forwarded-for": "auth-test",
    },
    body: JSON.stringify({ key: ACCESS_KEY }),
  }), ACCESS_KEY);

  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/);
  assert.match(response.headers.get("set-cookie") ?? "", /Secure/);
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=432000/);
});
