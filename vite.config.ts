import vinext from "vinext";
import { defineConfig } from "vite";
import { localArticleFiles } from "./build/local-article-files-plugin";
import { localArticleAssets } from "./build/local-article-assets-plugin";
import { editorAuth } from "./build/editor-auth-plugin";
import { localSections } from "./build/local-sections-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: [],
  r2_buckets: [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const isVercelBuild = Boolean(process.env.VERCEL) || process.env.NITRO_PRESET === "vercel";

  if (isVercelBuild) {
    const { nitro } = await import("nitro/vite");

    return {
      define: { __MINELOG_LOCAL_MODE__: "false" },
      plugins: [vinext(), ...nitro()],
    };
  }

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    define: { __MINELOG_LOCAL_MODE__: "true" },
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      editorAuth(),
      localSections(),
      localArticleAssets(),
      localArticleFiles(),
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
