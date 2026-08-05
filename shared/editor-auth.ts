export const EDITOR_AUTH_PATH = "/api/editor-auth";
export const EDITOR_SESSION_COOKIE = "minelog_editor_session";
const EDITOR_WRITE_PATHS = new Set(["/api/local-articles", "/api/local-assets", "/api/sections"]);
const TOKEN_VERSION = "v2";
export const EDITOR_SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const encoder = new TextEncoder();
const failedAttempts = new Map<string, { failures: number; resetAt: number }>();

export function isEditorAccessKeyConfigured(accessKey: string | undefined): accessKey is string {
  return Boolean(accessKey && /^\d{6}$/.test(accessKey));
}

export function isProtectedEditorMutation(request: Request) {
  const method = request.method.toUpperCase();
  return method !== "GET" && method !== "HEAD" && EDITOR_WRITE_PATHS.has(new URL(request.url).pathname);
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomNonce() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
}

export async function accessKeysMatch(submitted: string, expected: string) {
  const [left, right] = await Promise.all([digest(submitted), digest(expected)]);
  return equalBytes(left, right);
}

async function signSession(issuedAt: string, nonce: string, accessKey: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`minelog-editor-session:${accessKey}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = `${TOKEN_VERSION}.${issuedAt}.${nonce}`;
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

export async function createEditorSession(accessKey: string, issuedAtSeconds = Math.floor(Date.now() / 1000)) {
  const issuedAt = String(issuedAtSeconds);
  const nonce = randomNonce();
  return `${TOKEN_VERSION}.${issuedAt}.${nonce}.${await signSession(issuedAt, nonce, accessKey)}`;
}

export async function verifyEditorSession(token: string | undefined, accessKey: string) {
  if (!token || !accessKey) return false;
  const [version, issuedAtRaw, nonce, signature, extra] = token.split(".");
  const issuedAt = Number(issuedAtRaw);
  if (version !== TOKEN_VERSION || !Number.isSafeInteger(issuedAt) || issuedAt < 0 || !nonce || !signature || extra) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageSeconds < -MAX_CLOCK_SKEW_SECONDS || ageSeconds > EDITOR_SESSION_MAX_AGE_SECONDS) return false;
  return accessKeysMatch(signature, await signSession(issuedAtRaw, nonce, accessKey));
}

export function cookieValue(cookieHeader: string | null, name: string) {
  for (const item of (cookieHeader ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return undefined;
}

export async function isEditorAuthorized(cookieHeader: string | null, accessKey: string) {
  return verifyEditorSession(cookieValue(cookieHeader, EDITOR_SESSION_COOKIE), accessKey);
}

function json(status: number, value: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}

function requester(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    ?? "local";
}

function activeAttemptRecord(id: string) {
  const record = failedAttempts.get(id);
  if (!record) return undefined;
  if (record.resetAt <= Date.now()) {
    failedAttempts.delete(id);
    return undefined;
  }
  return record;
}

function recordFailure(id: string) {
  const current = activeAttemptRecord(id);
  const next = { failures: (current?.failures ?? 0) + 1, resetAt: current?.resetAt ?? Date.now() + LOCK_WINDOW_MS };
  failedAttempts.set(id, next);
  if (failedAttempts.size > 5000) {
    for (const key of failedAttempts.keys()) {
      if (!activeAttemptRecord(key)) failedAttempts.delete(key);
    }
  }
  return next;
}

function rateLimited(record: { failures: number; resetAt: number }) {
  const retryAfter = Math.max(1, Math.ceil((record.resetAt - Date.now()) / 1000));
  return json(429, { configured: true, authorized: false, error: "尝试次数过多，请稍后再试" }, { "retry-after": String(retryAfter) });
}

export async function handleEditorAuthRequest(request: Request, accessKey: string | undefined) {
  if (!isEditorAccessKeyConfigured(accessKey)) return json(503, { configured: false, authorized: false, error: "编辑密钥必须配置为 6 位数字" });

  if (request.method === "GET") {
    return json(200, { configured: true, authorized: await isEditorAuthorized(request.headers.get("cookie"), accessKey) });
  }

  if (request.method !== "POST") return json(405, { error: "不支持的请求方法" }, { allow: "GET, POST" });
  if (!sameOrigin(request)) return json(403, { error: "请求来源无效" });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json(415, { error: "请求格式无效" });

  const requesterId = requester(request);
  const currentAttempts = activeAttemptRecord(requesterId);
  if (currentAttempts && currentAttempts.failures >= MAX_FAILED_ATTEMPTS) return rateLimited(currentAttempts);

  let submitted = "";
  try {
    const body = await request.json() as { key?: unknown };
    submitted = typeof body.key === "string" && /^\d{6}$/.test(body.key) ? body.key : "";
  } catch {
    return json(400, { error: "请求内容无效" });
  }

  if (!await accessKeysMatch(submitted, accessKey)) {
    const attempts = recordFailure(requesterId);
    if (attempts.failures >= MAX_FAILED_ATTEMPTS) return rateLimited(attempts);
    return json(401, { configured: true, authorized: false, error: `密钥错误，还可尝试 ${MAX_FAILED_ATTEMPTS - attempts.failures} 次` }, {
      "set-cookie": `${EDITOR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    });
  }

  failedAttempts.delete(requesterId);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  const token = await createEditorSession(accessKey);
  return json(200, { configured: true, authorized: true }, {
    "set-cookie": `${EDITOR_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${EDITOR_SESSION_MAX_AGE_SECONDS}${secure}`,
  });
}

export async function editorMutationAllowed(request: Request, accessKey: string | undefined) {
  if (!isEditorAccessKeyConfigured(accessKey) || !sameOrigin(request)) return false;
  return isEditorAuthorized(request.headers.get("cookie"), accessKey);
}
