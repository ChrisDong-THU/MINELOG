import { EDITOR_AUTH_PATH, editorMutationAllowed, handleEditorAuthRequest, isEditorAccessKeyConfigured } from "../../../shared/editor-auth";
import { R2S3Bucket, r2S3ConfigFromEnv } from "../../../server/r2-s3-bucket";
import { handleR2ContentRequest } from "../../../worker/r2-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const url = new URL(request.url);
  const accessKey = process.env.EDITOR_ACCESS_KEY;
  if (url.pathname === EDITOR_AUTH_PATH) return handleEditorAuthRequest(request, accessKey);

  const protectsEditorWrite = request.method !== "GET" && request.method !== "HEAD"
    && (url.pathname === "/api/local-articles" || url.pathname === "/api/local-assets" || url.pathname === "/api/sections");
  if (protectsEditorWrite && !await editorMutationAllowed(request, accessKey)) {
    return Response.json({ error: "请先通过编辑密钥验证" }, {
      status: isEditorAccessKeyConfigured(accessKey) ? 401 : 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const config = r2S3ConfigFromEnv();
  if (!config) {
    return Response.json({ error: "R2 存储尚未完成配置" }, {
      status: 503,
      headers: { "cache-control": "no-store" },
    });
  }

  const response = await handleR2ContentRequest(request, new R2S3Bucket(config));
  return response ?? Response.json({ error: "接口不存在" }, { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const HEAD = handle;
