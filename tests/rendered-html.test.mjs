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
  const [page, navigation, storage, renderer, resizableImage, searchPage, layout, fileClient, filePlugin, assetClient, assetPlugin, editor, toolbar, articleReader, contentModel, hotbarModel, gitignore, minecraftIcons, sectionEditor, imageAssets, gameModal, r2Content] = await Promise.all([
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
    source("worker/r2-content.ts"),
  ]);
  const editorBase = await source("app/editor-base.css");
  const globalStyles = await source("app/globals.css");
  const readerStyles = await source("app/reader.css");
  const sectionPage = await source("app/components/section-page.tsx");
  const visitorGlobe = await source("app/components/visitor-globe.tsx");
  const visitorLocations = await source("worker/visitor-locations.ts");
  const homeStyles = await source("app/home-globe.css");
  const homeBackdrop = await source("app/components/home-backdrop.tsx");
  const gameSelect = await source("app/components/game-select.tsx");

  assert.match(page, /from "\.\/navigation"/);
  assert.match(page, /from "\.\/browser-storage"/);
  assert.match(page, /from "\.\/local-article-files"/);
  assert.match(page, /from "\.\/components\/visitor-globe"/);
  assert.match(page, /lazy\(\(\) => import\("\.\/components\/article-editor"\)/);
  assert.match(page, /lazy\(\(\) => import\("\.\/components\/article-reader"\)/);
  assert.match(page, /<Suspense fallback=/);
  assert.doesNotMatch(page, /feed-carousel|broadcast-grid|矿脉日志：挖掘|论文推送|最近更新/);
  assert.doesNotMatch(layout, /minelog-title\.png/);
  assert.match(layout, /import "\.\/home-globe\.css"/);
  assert.match(page, /<HomeBackdrop \/>/);
  assert.match(page, /className=\{`home-globe-layer/);
  assert.match(page, /active=\{active === "home"\}/);
  assert.doesNotMatch(page, /minelog-title\.png|hero-title-image/);
  assert.match(visitorGlobe, /onPointerDown=\{handlePointerDown\}/);
  assert.doesNotMatch(visitorGlobe, /onWheel|changeScale|globe-controls/);
  assert.match(visitorGlobe, /onKeyDown=\{handleKeyDown\}/);
  assert.match(visitorGlobe, /image\.src = "\/earth\/solar-system-scope-earth-8k\.jpg"/);
  assert.match(visitorGlobe, /Math\.min\(4096, maximumTextureSize\)/);
  assert.match(visitorGlobe, /MAX_RENDER_SIZE = 2048/);
  assert.match(visitorGlobe, /requestRenderRef/);
  assert.match(visitorGlobe, /activeRef/);
  assert.match(visitorGlobe, /tabIndex=\{active \? 0 : -1\}/);
  assert.match(visitorGlobe, /prefers-reduced-motion: reduce/);
  assert.match(visitorGlobe, /0\.5 - atan\(world\.z, world\.x\)/);
  assert.match(visitorGlobe, /worldZ = -cosLatitude \* Math\.sin\(longitude\)/);
  assert.match(visitorGlobe, /gl\.TEXTURE_WRAP_S, gl\.REPEAT/);
  assert.match(visitorGlobe, /gl\.TEXTURE_MIN_FILTER, gl\.LINEAR/);
  assert.doesNotMatch(visitorGlobe, /generateMipmap|LINEAR_MIPMAP_LINEAR|seamWidth/);
  assert.match(visitorGlobe, /getContext\("webgl"/);
  assert.match(visitorGlobe, /offline \? "缓慢旋转的地球仪，可按住拖动或使用方向键调整视角"/);
  assert.match(visitorLocations, /RETENTION_DAYS = 7/);
  assert.match(visitorLocations, /Math\.round\(latitude \* 2\) \/ 2/);
  assert.doesNotMatch(visitorLocations, /x-forwarded-for|x-real-ip/);
  assert.match(homeStyles, /\.earth-stage/);
  assert.match(homeStyles, /\.earth-canvas/);
  assert.doesNotMatch(homeStyles, /atlas-metrics|atlas-signals|globe-controls/);
  assert.match(homeStyles, /\.home-grid-base/);
  assert.match(homeStyles, /@keyframes home-cube-bob/);
  assert.match(homeStyles, /\.minecraft-shell\.is-home \.content-viewport[\s\S]*mask-image: none/);
  assert.match(homeStyles, /\.home-content::after/);
  assert.doesNotMatch(homeStyles, /\.home-backdrop\s*\{[^}]*z-index:/s);
  assert.match(homeStyles, /\.home-grid\s*\{[^}]*z-index: 0/s);
  assert.match(homeStyles, /\.home-cubes\s*\{[^}]*z-index: 2/s);
  assert.match(homeStyles, /\.home-globe-layer\.is-active/);
  assert.match(homeStyles, /view-transition-name: home-globe/);
  assert.match(homeStyles, /::view-transition-old\(home-globe\)/);
  assert.match(homeStyles, /@keyframes home-globe-out/);
  assert.match(globalStyles, /--surface-raised:/);
  assert.doesNotMatch(globalStyles, /panorama_0\.png/);
  assert.match(globalStyles, /@keyframes page-forward-in/);
  assert.match(globalStyles, /@keyframes page-backward-in/);
  assert.match(homeBackdrop, /Cube_\$\{cube\.image\}\.png/);
  assert.match(homeBackdrop, /window\.addEventListener\("pointermove"/);
  assert.match(homeBackdrop, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(page, /WELCOME, EXPLORER\.|home-welcome/);
  assert.doesNotMatch(page, /updateLogOpen|panel-link|update-history/);
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
  assert.match(renderer, /rehypeHighlight/);
  assert.match(renderer, /detect: true/);
  assert.match(renderer, /markdown-code-header/);
  assert.match(readerStyles, /\.markdown-code-block \{/);
  assert.match(readerStyles, /\.hljs-keyword/);
  assert.doesNotMatch(readerStyles, /background: #161a17/);
  assert.match(renderer, /navigator\.clipboard\.writeText/);
  assert.match(renderer, /markdown-code-copy-feedback/);
  assert.match(readerStyles, /border-left-width: 2px/);
  assert.match(readerStyles, /\.markdown-code-block:hover/);
  assert.doesNotMatch(readerStyles, /\.markdown-code-block:focus-within/);
  assert.match(readerStyles, /\.markdown-code-copy \{/);
  assert.match(renderer, /markdown-code-language/);
  assert.doesNotMatch(renderer, /markdown-code-mark|blockRef|code-scrollbar-offset/);
  assert.match(renderer, /markdown-code-header[\s\S]*markdown-code-language[\s\S]*markdown-code-copy/);
  assert.match(readerStyles, /padding: 17px 19px 15px/);
  assert.match(readerStyles, /\.markdown-code-copy \{[^}]*border: 0[^}]*background: transparent[^}]*box-shadow: none/s);
  assert.match(readerStyles, /\.markdown-code-copy:focus-visible \{ box-shadow: none; \}/);
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
  assert.match(filePlugin, /join\(root, "articles"/);
  assert.doesNotMatch(filePlugin, /join\(root, article\.sectionId/);
  assert.doesNotMatch(filePlugin, /entry\.isDirectory\(\)/);
  assert.match(filePlugin, /ARTICLE_FILE_PATTERN/);
  assert.match(filePlugin, /deleteUnreferencedAssets/);
  assert.match(filePlugin, /imageAssetReferenceCounts/);
  assert.match(editor, /uploadedAssetUrls\.current\.add\(url\)/);
  assert.match(assetClient, /\/api\/local-assets/);
  assert.match(assetClient, /FileReader/);
  assert.match(assetPlugin, /writeFile/);
  assert.match(assetPlugin, /"content", "local"/);
  assert.match(assetPlugin, /join\(contentRoot, "assets", fileName\)/);
  assert.doesNotMatch(assetPlugin, /sectionId/);
  assert.match(r2Content, /`assets\/\$\{fileName\}`/);
  assert.doesNotMatch(r2Content, /`assets\/\$\{sectionId\}/);
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
  assert.match(editor, /onSourceActivate=\{focusMarkdownSource\}/);
  assert.match(editor, /input\.setSelectionRange\(selection\.start, selection\.end\)/);
  assert.match(editor, /input\.scrollTo\(\{ top, behavior:/);
  assert.match(editor, /function selectionCenterScrollTop/);
  assert.match(editor, /startMarker\.offsetTop \+ endMarker\.offsetTop/);
  assert.match(editor, /input\.scrollHeight - input\.clientHeight/);
  assert.match(renderer, /data-source-start/);
  assert.match(renderer, /onDoubleClick=\{handleDoubleClick\}/);
  assert.match(renderer, /markdownCodeLineRange/);
  assert.match(renderer, /event\.clientY - codeTop/);
  assert.match(editor, /editor-form-column/);
  assert.match(editor, /<GameSelect/);
  assert.match(sectionEditor, /<GameSelect/);
  assert.doesNotMatch(editor, /<select/);
  assert.doesNotMatch(sectionEditor, /<select/);
  assert.match(gameSelect, /role="combobox"/);
  assert.match(gameSelect, /role="listbox"/);
  assert.match(gameSelect, /ArrowDown/);
  assert.doesNotMatch(gameSelect, /scrollIntoView/);
  assert.match(gameSelect, /optionTop < list\.scrollTop/);
  assert.match(gameSelect, /optionBottom - visibleHeight/);
  assert.match(gameSelect, /createPortal/);
  assert.match(gameSelect, /getBoundingClientRect\(\)/);
  assert.match(globalStyles, /\.game-select__popup[^}]*position: fixed[^}]*grid-template-rows: 0fr/s);
  assert.match(globalStyles, /\.game-select__popup\.is-open[^}]*grid-template-rows: 1fr/s);
  assert.doesNotMatch(globalStyles, /\.game-select__options > button\.is-active[^}]*inset 2px/s);
  assert.match(editor, /const \[detailsOpen, setDetailsOpen\] = useState\(false\)/);
  assert.match(editor, /aria-expanded=\{detailsOpen\}/);
  assert.match(editor, /inert=\{!detailsOpen\}/);
  assert.match(editorBase, /\.editor-meta-body[^}]*grid-template-rows: 0fr/s);
  assert.match(editorBase, /\.editor-meta-panel\.is-open \.editor-meta-body[^}]*grid-template-rows: 1fr/s);
  assert.match(editorBase, /\.editor-form-column\.is-meta-collapsed \.editor-markdown-field textarea/);
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
  assert.match(page, /\/minecraft\/ui\/local-sync-off\.png/);
  assert.doesNotMatch(page, /local-sync-off-cloud|local-sync-off-slash/);
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
  assert.match(localSections, /"content", "local", "state", "sections\.json"/);
  assert.match(localSections, /await rename\(temporary, filePath\)/);
  assert.match(localSections, /initialized: await sectionsFileExists/);
  assert.match(remoteSections, /initialized\?: boolean/);
  assert.match(sharedAuth, /EDITOR_SESSION_MAX_AGE_SECONDS = 5 \* 24 \* 60 \* 60/);
  assert.match(sharedAuth, /Max-Age=\$\{EDITOR_SESSION_MAX_AGE_SECONDS\}/);
  assert.match(r2Content, /source\.hotbarSlot >= 1 && source\.hotbarSlot <= 7/);
  assert.match(r2Content, /initialized: true, sections/);
});
