import type { ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { EDITOR_AUTH_PATH } from "../shared/editor-auth";

function json(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
}

export function editorAuth(): Plugin {
  return {
    name: "minelog-local-editor-auth",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== EDITOR_AUTH_PATH) return next();
        if (req.method !== "GET" && req.method !== "POST") {
          res.setHeader("allow", "GET, POST");
          return json(res, 405, { error: "不支持的请求方法" });
        }
        return json(res, 200, {
          configured: false,
          authorized: true,
          local: true,
        });
      });
    },
  };
}
