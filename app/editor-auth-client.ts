const EDITOR_AUTH_ENDPOINT = "/api/editor-auth";

type EditorAuthResponse = { configured: boolean; authorized: boolean; local?: boolean; error?: string };

async function authResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("编辑验证服务不可用");
  const body = await response.json() as EditorAuthResponse;
  if (!response.ok) throw new Error(body.error ?? "编辑验证失败");
  return body;
}

export async function getEditorAccess() {
  const response = await fetch(EDITOR_AUTH_ENDPOINT, { cache: "no-store", credentials: "same-origin" });
  return authResponse(response);
}

export async function verifyEditorAccess(key: string) {
  const response = await fetch(EDITOR_AUTH_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ key }),
  });
  return authResponse(response);
}
