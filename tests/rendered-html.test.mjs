import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server renders the MINELOG application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]+lang="zh-CN"/i);
  assert.match(html, /<title>[^<]*MINELOG<\/title>/i);
  assert.match(html, /MINELOG/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/i);
});

test("keeps navigation, rendering and local content storage in focused modules", async () => {
  const [page, navigation, storage, renderer, resizableImage, searchPage, layout, fileClient, filePlugin, assetClient, assetPlugin, editor, toolbar, articleReader, contentModel, hotbarModel, gitignore, minecraftIcons, sectionEditor, imageAssets, gameModal] = await Promise.all([
    source("app/page.tsx"),
    source("app/navigation.ts"),
    source("app/browser-storage.ts"),
    source("app/components/markdown-renderer.tsx"),
    source("app/components/resizable-markdown-image.tsx"),
    source("app/components/search-page.tsx"),
    source("app/layout.tsx"),
    source("app/local-article-files.ts"),
    source("build/local-article-files-plugin.ts"),
    source("app/local-article-assets.ts"),
    source("build/local-article-assets-plugin.ts"),
    source("app/components/article-editor.tsx"),
    source("app/components/markdown-editor-toolbar.tsx"),
    source("app/components/article-reader.tsx"),
    source("app/content-model.ts"),
    source("app/hotbar-model.ts"),
    source(".gitignore"),
    source("app/minecraft-icons.ts"),
    source("app/components/section-editor-modal.tsx"),
    source("shared/image-assets.ts"),
    source("app/components/game-modal.tsx"),
  ]);
  const editorBase = await source("app/editor-base.css");
  const globalStyles = await source("app/globals.css");
  const sectionPage = await source("app/components/section-page.tsx");
  const feedCarousel = await source("app/components/feed-carousel.tsx");

  assert.match(page, /from "\.\/navigation"/);
  assert.match(page, /from "\.\/browser-storage"/);
  assert.match(page, /from "\.\/local-article-files"/);
  assert.match(page, /from "\.\/components\/feed-carousel"/);
  assert.match(contentModel, /slice\(0, limit\)/);
  assert.doesNotMatch(page, /updateLogOpen|panel-link|update-history/);
  assert.match(feedCarousel, /MAX_FEED_ENTRIES = 10/);
  assert.match(feedCarousel, /entries\.slice\(0, MAX_FEED_ENTRIES\)/);
  assert.match(feedCarousel, /onPointerEnter/);
  assert.match(feedCarousel, /onFocusCapture/);
  assert.match(feedCarousel, /onWheel=\{handleWheel\}/);
  assert.match(page, /from "\.\/components\/section-page"/);
  assert.match(page, /from "\.\/components\/search-page"/);
  assert.doesNotMatch(page, /rag-latency\.md/);
  assert.match(page, /from "\.\/hotbar-model"/);
  assert.match(hotbarModel, /resolveHotbarSections/);
  assert.match(page, /application\/x-minelog-section/);
  assert.match(page, /onDrop=/);
  assert.match(page, /assignSectionToHotbarSlot/);
  assert.match(hotbarModel, /slotBySectionId/);
  assert.match(page, /setDragImage/);
  assert.match(page, /document\.elementFromPoint/);
  assert.match(page, /closest\("\.game-hud"\)/);
  assert.doesNotMatch(page, /dropSectionInMore|is-hotbar-drop-target/);
  assert.match(page, /enabled: false, hotbarSlot: undefined/);
  assert.match(page, /section-edit-trigger[^\n]+MINECRAFT_UI_ICONS\.manageSections/);
  assert.match(page, /reader-edit-trigger[^\n]+MINECRAFT_UI_ICONS\.editArticle/);
  assert.doesNotMatch(page, /settings-trigger|HOTBAR LOADOUT/);
  assert.match(page, /onWheel=\{switchHotbarPage\}/);
  assert.match(page, /className="slot-tooltip">\{label\}/);
  assert.doesNotMatch(page, /\{i \+ 1\} · \{label\}/);
  assert.doesNotMatch(page, /所有板块都已放入工具槽/);
  assert.doesNotMatch(page, /<em>拖入工具槽<\/em>/);

  assert.match(navigation, /pushState/);
  assert.match(navigation, /replaceState/);
  assert.match(navigation, /URLSearchParams/);
  assert.match(navigation, /view: "search"/);
  assert.match(storage, /useSyncExternalStore/);
  assert.match(storage, /StorageEvent/);

  assert.match(renderer, /remarkGfm/);
  assert.match(renderer, /remarkMath/);
  assert.match(renderer, /rehypeKatex/);
  assert.match(searchPage, /slice\(0, 7\)/);
  assert.match(searchPage, /b\.count - a\.count/);
  assert.match(sectionPage, /SectionUiIcon/);
  assert.match(sectionPage, /<strong>\{articles\.length\}<\/strong>/);
  assert.doesNotMatch(sectionPage, /minecraft\/items\/(?:comparator|name_tag)\.png/);
  assert.match(sectionPage, /MINECRAFT_UI_ICONS\.articleClosed/);
  assert.match(sectionPage, /MINECRAFT_UI_ICONS\.articleOpen/);
  assert.doesNotMatch(sectionPage, /ARTICLE INDEX/);
  assert.doesNotMatch(sectionPage, /article-index-icon/);
  assert.doesNotMatch(sectionPage, /minecraft\/items\/arrow\.png/);
  assert.match(sectionPage, /article-open-icon/);
  assert.match(globalStyles, /--article-copy-shift-x: 4px/);
  assert.match(globalStyles, /--article-copy-shift-y: 3px/);
  assert.match(globalStyles, /\.article-card h3[^}]*transform: translate\(var\(--article-copy-shift-x\),var\(--article-copy-shift-y\)\)/s);
  assert.match(globalStyles, /\.article-card > p[^}]*transform: translate\(var\(--article-copy-shift-x\),var\(--article-copy-shift-y\)\)/s);
  assert.match(globalStyles, /\.article-card:hover \.article-tags b,\s*\.article-card:focus-visible \.article-tags b/);
  assert.match(globalStyles, /\.article-card:hover \.article-tags b[^}]*color: #bddb84/s);
  assert.match(sectionPage, /index === 0 \? " article-card--featured"/);
  assert.match(layout, /MINELOG/);
  const uiIconBlock = minecraftIcons.slice(
    minecraftIcons.indexOf("export const MINECRAFT_UI_ICONS"),
    minecraftIcons.indexOf("} as const;") + "} as const;".length,
  );
  const uiIconAssets = uiIconBlock.split(String.fromCharCode(10)).flatMap((line) => {
    const itemMatch = line.match(/item[(]"([^"]+)"[)]/);
    const pathMatch = line.match(/"([/]minecraft[/][^"]+[.]png)"/);
    return itemMatch ? [itemMatch[1]] : pathMatch ? [pathMatch[1]] : [];
  });
  assert.ok(uiIconAssets.length > 0);
  assert.equal(new Set(uiIconAssets).size, uiIconAssets.length);
  assert.ok(minecraftIcons.includes("SECTION_ICON_OPTIONS"));
  assert.ok(minecraftIcons.includes("!RESERVED_UI_ICON_SET.has(icon)"));
  assert.ok(minecraftIcons.includes("availableSectionIcons"));
  assert.ok(minecraftIcons.includes("normalizeSectionIcons"));
  assert.ok(sectionEditor.includes("iconOptions.map"));
  assert.ok(sectionEditor.includes("availableSectionIcons(sections"));
  assert.ok(!sectionEditor.includes("const ICONS"));
  assert.ok(!sectionEditor.includes("RANDOM_ICON"));

  assert.match(fileClient, /\/api\/local-articles/);
  assert.match(filePlugin, /writeFile/);
  assert.match(filePlugin, /"content", "local"/);
  assert.match(filePlugin, /deleteUnreferencedAssets/);
  assert.match(filePlugin, /imageAssetReferenceCounts/);
  assert.match(editor, /uploadedAssetUrls\.current\.add\(url\)/);
  assert.match(assetClient, /\/api\/local-assets/);
  assert.match(assetClient, /FileReader/);
  assert.match(assetPlugin, /writeFile/);
  assert.match(assetPlugin, /"content", "local"/);
  assert.match(assetPlugin, /assets/);
  assert.match(assetPlugin, /from "\.\.\/shared\/image-assets\.ts"/);
  assert.match(imageAssets, /"image\/svg\+xml": "svg"/);
  assert.match(renderer, /ResizableMarkdownImage/);
  assert.match(gameModal, /createPortal/);
  assert.match(gameModal, /document\.body/);
  assert.match(editor, /onDirtyChange\?\.\(isDirty\)/);
  assert.match(editor, /window\.addEventListener\("keydown", handleSaveShortcut\)/);
  assert.match(editor, /\(event\.ctrlKey \|\| event\.metaKey\)/);
  assert.doesNotMatch(editor, /if \(key === "s"/);
  assert.match(editor, /markdown !== \(initialValue\.markdown \|\| STARTER_MARKDOWN\)/);
  assert.match(page, /requestEditorExit\(\(\) => runPageTransition/);
  assert.match(page, /window\.addEventListener\("beforeunload", preventUnload\)/);
  assert.match(page, /requestEditorExit\(\(\) => window\.history\.back\(\)\)/);
  assert.match(page, /UNSAVED CHANGES/);
  assert.match(page, /放弃未保存的更改？/);
  assert.match(renderer, /editableImages/);
  assert.match(resizableImage, /markdown-image-resize-handle/);
  assert.match(resizableImage, /markdown-image-caption/);
  assert.match(resizableImage, /const caption = alt\.trim\(\)/);
  assert.match(resizableImage, /closest<HTMLElement>\("\.markdown-image-frame"\)/);
  assert.match(resizableImage, /#width=/);
  assert.match(resizableImage, /versionLocalArticleImageUrl/);
  assert.match(resizableImage, /__MINELOG_LOCAL_MODE__/);
  assert.match(assetClient, /local-asset-v=/);
  assert.match(assetPlugin, /"cache-control", "no-store"/);
  assert.match(editor, /handleEditorPaste/);
  assert.match(editor, /saveLocalArticleImage/);
  assert.match(editor, /updateImageWidth/);
  assert.match(editor, /onImageWidthChange/);
  assert.match(editor, /editor-form-column/);
  assert.match(editor, /editor-markdown-panel/);
  assert.match(editorBase, /position: sticky/);
  assert.match(editorBase, /max-height: calc\(100dvh - 24px\)/);
  assert.match(editorBase, /resize: vertical/);
  assert.match(editor, /setHeadingLevel\(Number\(key\)\)/);
  assert.match(editor, /setTableDialog\(true\)/);
  assert.match(editor, /insertBlock\("\$\$", "E = mc\^2"\)/);
  assert.match(editor, /insertBlock\("```", "代码"\)/);
  assert.match(toolbar, /"math-block"/);
  assert.match(toolbar, /"code-block"/);
  assert.match(toolbar, /label: "插入表格"/);
  assert.doesNotMatch(toolbar, /insert: "image"|insert: "video"|command: "heading"/);
  assert.match(contentModel, /EMPTY_CONTENT_STATE/);
  assert.match(contentModel, /createSearchDocuments/);
  assert.match(contentModel, /export function articleMarkdownKey/);
  assert.match(page, /articleMarkdownKey\(target\.id\)/);
  assert.match(page, /window\.crypto\.randomUUID\(\)/);
  assert.match(contentModel, /latestById/);
  assert.match(filePlugin, /`\$\{article\.id\}\.md`/);
  assert.match(filePlugin, /record\.id !== article\.id/);
  assert.match(editor, /savingArticle/);
  assert.match(editor, /\\u6B63\\u5728\\u4FDD\\u5B58\\u6587\\u7AE0\\u6B63\\u6587\\u2026/);
  assert.doesNotMatch(page, /\$\{(?:sectionId|target\.sectionId)\}::/);
  assert.match(articleReader, /subsectionNumber = 0/);
  assert.match(articleReader, /toc-number/);
  assert.match(articleReader, /buildTableOfContents/);
  assert.match(articleReader, /level === 2 \? sectionNumber : subsectionNumber/);
  assert.match(gitignore, /\/content\/local\//);
});


test("routes every dialog through the shared viewport portal", async () => {
  const componentDirectory = new URL("../app/components/", import.meta.url);
  const componentFiles = (await readdir(componentDirectory)).filter((name) => name.endsWith(".tsx")).sort();
  const componentSources = await Promise.all(componentFiles.map(async (name) => [name, await source("app/components/" + name)]));

  const dialogOwners = componentSources
    .filter(([, contents]) => contents.includes('role="dialog"') || contents.includes("modal-backdrop"))
    .map(([name]) => name);
  assert.deepEqual(dialogOwners, ["game-modal.tsx"]);

  for (const name of ["article-editor.tsx", "editor-access-modal.tsx", "section-editor-modal.tsx"]) {
    const contents = componentSources.find(([fileName]) => fileName === name)?.[1] ?? "";
    assert.ok(contents.includes('import { GameModal } from "./game-modal";'));
  }
});

test("separates local persistence and remote device trust", async () => {
  const [page, styles, viteConfig, localAuth, localSections, remoteSections, sharedAuth, r2Content] = await Promise.all([
    source("app/page.tsx"),
    source("app/globals.css"),
    source("vite.config.ts"),
    source("build/editor-auth-plugin.ts"),
    source("build/local-sections-plugin.ts"),
    source("app/remote-sections.ts"),
    source("shared/editor-auth.ts"),
    source("worker/r2-content.ts"),
  ]);

  assert.match(page, /__MINELOG_LOCAL_MODE__/);
  assert.match(page, /local-sync-off/);
  assert.match(page, /本地模式：无云同步/);
  assert.doesNotMatch(page, />LOCAL</);
  assert.match(styles, /\.local-sync-off/);
  assert.match(styles, /\.topbar \{[^}]*min-height: 90px/s);
  assert.match(styles, /\.topbar \{ min-height: 70px; padding: 14px; \}/);
  assert.match(viteConfig, /__MINELOG_LOCAL_MODE__: "true"/);
  assert.match(viteConfig, /__MINELOG_LOCAL_MODE__: "false"/);
  assert.match(viteConfig, /localSections\(\)/);
  assert.match(localAuth, /authorized: true/);
  assert.match(localAuth, /local: true/);
  assert.doesNotMatch(localAuth, /editorMutationAllowed/);
  assert.match(localSections, /"content", "local", "\.sections\.json"/);
  assert.match(localSections, /await rename\(temporary, filePath\)/);
  assert.match(localSections, /initialized: await sectionsFileExists/);
  assert.match(remoteSections, /initialized\?: boolean/);
  assert.match(sharedAuth, /EDITOR_SESSION_MAX_AGE_SECONDS = 5 \* 24 \* 60 \* 60/);
  assert.match(sharedAuth, /Max-Age=\$\{EDITOR_SESSION_MAX_AGE_SECONDS\}/);
  assert.match(r2Content, /source\.hotbarSlot >= 1 && source\.hotbarSlot <= 7/);
  assert.match(r2Content, /initialized: true, sections/);
});
