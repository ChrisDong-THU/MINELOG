/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { EDITOR_AUTH_PATH, editorMutationAllowed, handleEditorAuthRequest, isEditorAccessKeyConfigured } from "../shared/editor-auth";
import { handleR2ContentRequest, type R2BucketLike } from "./r2-content";

interface Env {
  ASSETS: Fetcher;
  EDITOR_ACCESS_KEY?: string;
  CONTENT_BUCKET?: R2BucketLike;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === EDITOR_AUTH_PATH) return handleEditorAuthRequest(request, env.EDITOR_ACCESS_KEY);

    const protectsEditorWrite = request.method !== "GET" && request.method !== "HEAD"
      && (url.pathname === "/api/local-articles" || url.pathname === "/api/local-assets" || url.pathname === "/api/sections");
    if (protectsEditorWrite && !await editorMutationAllowed(request, env.EDITOR_ACCESS_KEY)) {
      return Response.json({ error: "请先通过编辑密钥验证" }, {
        status: isEditorAccessKeyConfigured(env.EDITOR_ACCESS_KEY) ? 401 : 503,
        headers: { "cache-control": "no-store" },
      });
    }

    if (env.CONTENT_BUCKET) {
      const storageResponse = await handleR2ContentRequest(request, env.CONTENT_BUCKET);
      if (storageResponse) return storageResponse;
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
