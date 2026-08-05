import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { EDITOR_AUTH_PATH, editorMutationAllowed, handleEditorAuthRequest, isEditorAccessKeyConfigured } from "../shared/editor-auth";

const PROTECTED_WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

async function requestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 16 * 1024) throw new Error("验证请求过大");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function requestUrl(req: IncomingMessage) {
  const protocol = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
  return `${protocol}://${req.headers.host ?? "localhost"}${req.url ?? "/"}`;
}

async function webRequest(req: IncomingMessage, withBody = false) {
  const body = withBody ? await requestBody(req) : undefined;
  return new Request(requestUrl(req), {
    method: req.method,
    headers: new Headers(Object.entries(req.headers).flatMap(([name, value]) => value === undefined ? [] : [[name, Array.isArray(value) ? value.join(", ") : value]])),
    body,
  });
}

async function send(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function editorAuth(accessKey: string | undefined): Plugin {
  return {
    name: "minelog-editor-auth",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        try {
          if (url.pathname === EDITOR_AUTH_PATH) {
            return send(res, await handleEditorAuthRequest(await webRequest(req, req.method === "POST"), accessKey));
          }

          const isProtectedApi = url.pathname === "/api/local-articles" || url.pathname === "/api/local-assets";
          if (isProtectedApi && PROTECTED_WRITES.has(req.method ?? "")) {
            const allowed = await editorMutationAllowed(await webRequest(req), accessKey);
            if (!allowed) return send(res, new Response(JSON.stringify({ error: "请先通过编辑密钥验证" }), {
              status: isEditorAccessKeyConfigured(accessKey) ? 401 : 503,
              headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
            }));
          }
          return next();
        } catch (error) {
          server.config.logger.error(error instanceof Error ? error.message : String(error));
          return send(res, new Response(JSON.stringify({ error: "密钥验证服务暂不可用" }), {
            status: 500,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
          }));
        }
      });
    },
  };
}
