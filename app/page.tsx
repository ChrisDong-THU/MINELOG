"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type WheelEvent } from "react";
import { flushSync } from "react-dom";
import { GameIconButton, GameModal } from "./components/game-modal";
import type { ArticleEditorValue } from "./components/article-editor";
import { SectionEditorModal } from "./components/section-editor-modal";
import { EditorAccessModal } from "./components/editor-access-modal";
import { getEditorAccess } from "./editor-auth-client";
import { createJsonStorageStore, useHydrated, useJsonStorageState } from "./browser-storage";
import {
  deleteLocalArticleFile,
  initializeLocalArticleFiles,
  listLocalArticleFiles,
  loadLocalArticleFile,
  saveLocalArticleFile,
} from "./local-article-files";
import { loadRemoteSections, saveRemoteSections } from "./remote-sections";
import { readAppRoute, writeAppRoute, type AppRoute } from "./navigation";
import { HomeBackdrop } from "./components/home-backdrop";
import { VisitorGlobe } from "./components/visitor-globe";
import { SectionPage } from "./components/section-page";
import { SearchPage } from "./components/search-page";
import {
  articleMarkdownKey,
  contentFromLocalFiles,
  contentToLocalFiles,
  createSearchDocuments,
  EMPTY_CONTENT_STATE,
  markdownForArticle,
  parseLegacyContent,
} from "./content-model";
import { assignSectionToHotbarSlot, resolveHotbarSections } from "./hotbar-model";
import type { ContentState, SearchDocument, Section, SectionArticle } from "./content-types";
import { MINECRAFT_UI_ICONS, normalizeSectionIcons } from "./minecraft-icons";

const ArticleEditor = lazy(() => import("./components/article-editor").then((module) => ({ default: module.ArticleEditor })));
const ArticleReader = lazy(() => import("./components/article-reader").then((module) => ({ default: module.ArticleReader })));

type EditorState = { mode: "new" | "edit"; sectionId: string; articleId: string };
type EditorRequest = { mode: "new"; sectionId: string } | { mode: "edit"; sectionId: string; articleId: string };
type SectionDialogState = { mode: "new" | "edit" };
const KEY = "minelog-toolbar-v1";
const CONTENT_KEY = "minelog-content-v1";
const SECTION_STORE = createJsonStorageStore<Section[]>(KEY, []);

function createSectionId() {
  return `section-${window.crypto.randomUUID()}`;
}
function Item({ src, alt = "" }: { src: string; alt?: string }) {
  return <img className="pixel-item" src={src} alt={alt} draggable={false} />;
}

type NavigationLock = { current: boolean };
type PageDirection = "forward" | "backward";

function setPageDirection(direction?: PageDirection) {
  if (direction) {
    document.documentElement.dataset.pageDirection = direction;
  } else {
    document.documentElement.removeAttribute("data-page-direction");
  }
}

function runPageTransition(lock: NavigationLock, update: () => void, direction?: PageDirection) {
  setPageDirection(direction);
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    setPageDirection();
    return;
  }

  lock.current = true;
  document.startViewTransition(update).finished.finally(() => {
    lock.current = false;
    setPageDirection();
  });
}

export default function Home() {
  const [sections, setSections] = useJsonStorageState(SECTION_STORE);
  const [content, setContent] = useState<ContentState>(EMPTY_CONTENT_STATE);
  const [contentReady, setContentReady] = useState(false);
  const [sectionsRemoteReady, setSectionsRemoteReady] = useState(false);
  const hydrated = useHydrated();
  const articlesBySection = content.articles;
  const markdownOverrides = content.markdown;
  const [active, setActive] = useState("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState | null>(null);
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState<{ sectionId: string; articleId: string } | null>(null);
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [editorAuthorized, setEditorAuthorized] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [hudAwake, setHudAwake] = useState(true);
  const [backToTopState, setBackToTopState] = useState({ contentKey: "", visible: false });
  const navigating = useRef(false);
  const dragOriginRef = useRef<"hotbar" | "more" | null>(null);
  const draggingSectionRef = useRef<string | null>(null);
  const hudTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const wheelSwitchAt = useRef(0);
  const editorAuthorizedRef = useRef(false);
  const pendingEditorAction = useRef<(() => void) | null>(null);
  const pendingEditorExit = useRef<(() => void) | null>(null);
  const editorDirtyRef = useRef(false);
  const editingRef = useRef<EditorState | null>(null);
  const remoteSectionsAvailable = useRef(false);
  const remoteSectionsSaveTimer = useRef<number | null>(null);
  const markdownRequests = useRef(new Set<string>());

  useEffect(() => {
    let disposed = false;
    void getEditorAccess()
      .then((result) => {
        if (disposed) return;
        editorAuthorizedRef.current = result.authorized;
        setEditorAuthorized(result.authorized);
      })
      .catch(() => {
        if (disposed) return;
        editorAuthorizedRef.current = false;
        setEditorAuthorized(false);
      })
      .finally(() => { if (!disposed) setAuthReady(true); });
    return () => { disposed = true; };
  }, []);
  const handleEditorDirtyChange = useCallback((dirty: boolean) => {
    editorDirtyRef.current = dirty;
    setEditorDirty(dirty);
  }, []);

  const requestEditorExit = useCallback((action: () => void) => {
    if (!editingRef.current || !editorDirtyRef.current) {
      action();
      return;
    }
    pendingEditorExit.current = action;
    setDiscardDialogOpen(true);
  }, []);

  const continueEditing = useCallback(() => {
    pendingEditorExit.current = null;
    setDiscardDialogOpen(false);
  }, []);

  const discardEditorChanges = useCallback(() => {
    const action = pendingEditorExit.current;
    pendingEditorExit.current = null;
    editorDirtyRef.current = false;
    setEditorDirty(false);
    setDiscardDialogOpen(false);
    action?.();
  }, []);

  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!editorDirty) return undefined;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventUnload);
    return () => window.removeEventListener("beforeunload", preventUnload);
  }, [editorDirty]);

  const sectionsRef = useRef(sections);
  const articlesRef = useRef(articlesBySection);
  useEffect(() => {
    if (!hydrated) return;
    setSections((current) => normalizeSectionIcons(current));
  }, [hydrated, setSections]);

  useEffect(() => {
    sectionsRef.current = sections;
    articlesRef.current = articlesBySection;
  }, [sections, articlesBySection]);

  useEffect(() => {
    if (!hydrated) return undefined;
    let disposed = false;
    void loadRemoteSections()
      .then((result) => {
        if (disposed) return;
        remoteSectionsAvailable.current = result.available;
        if (result.initialized || result.sections.length > 0) setSections(normalizeSectionIcons(result.sections));
      })
      .catch(() => {
        remoteSectionsAvailable.current = false;
      })
      .finally(() => {
        if (!disposed) setSectionsRemoteReady(true);
      });
    return () => { disposed = true; };
  }, [hydrated, setSections]);

  useEffect(() => {
    if (!sectionsRemoteReady || !editorAuthorized || !remoteSectionsAvailable.current) return undefined;
    if (remoteSectionsSaveTimer.current !== null) window.clearTimeout(remoteSectionsSaveTimer.current);
    remoteSectionsSaveTimer.current = window.setTimeout(() => {
      void saveRemoteSections(sections).catch(() => {
        // Article editing remains available if remote section persistence is temporarily unavailable.
      });
    }, 300);
    return () => {
      if (remoteSectionsSaveTimer.current !== null) window.clearTimeout(remoteSectionsSaveTimer.current);
    };
  }, [sections, sectionsRemoteReady, editorAuthorized]);

  useEffect(() => {
    if (!hydrated) return undefined;
    let disposed = false;

    const loadArticles = async () => {
      try {
        let result = await listLocalArticleFiles();
        if (!result.initialized) {
          if (!editorAuthorizedRef.current) {
            if (!disposed) {
              setContent(contentFromLocalFiles(result.articles));
              setContentReady(true);
            }
            return;
          }
                    let legacyRaw: string | null = null;
          try {
            legacyRaw = window.localStorage.getItem(CONTENT_KEY);
          } catch {
            // Local Markdown files remain authoritative when browser storage is unavailable.
          }
          const initialContent = parseLegacyContent(legacyRaw) ?? EMPTY_CONTENT_STATE;
          result = await initializeLocalArticleFiles(contentToLocalFiles(initialContent));
        }
        if (disposed) return;
        setContent(contentFromLocalFiles(result.articles));
        setContentReady(true);
        try {
          window.localStorage.removeItem(CONTENT_KEY);
        } catch {
          // The file store is authoritative even when legacy browser storage cannot be removed.
        }
      } catch (error) {
        if (disposed) return;
        setContentReady(true);
        setNotice(error instanceof Error
          ? `${error.message}\uFF0C\u5F53\u524D\u4F7F\u7528\u5185\u7F6E\u53EA\u8BFB\u6587\u7AE0`
          : "\u672C\u5730\u6587\u7AE0\u76EE\u5F55\u4E0D\u53EF\u7528\uFF0C\u5F53\u524D\u4F7F\u7528\u5185\u7F6E\u53EA\u8BFB\u6587\u7AE0");
      }
    };

    void loadArticles();
    return () => {
      disposed = true;
    };
  }, [hydrated, editorAuthorized]);

  useEffect(() => {
    if (!hydrated || !contentReady || !authReady || !sectionsRemoteReady) return;

    const applyRoute = () => {
      let route = readAppRoute();
      const routeSectionId = "sectionId" in route ? route.sectionId : undefined;
      const sectionExists = routeSectionId ? sectionsRef.current.some((section) => section.id === routeSectionId) : true;
      const routeArticleId = route.view === "reader" || (route.view === "editor" && route.mode === "edit") ? route.articleId : undefined;
      const articleExists = routeArticleId
        ? Boolean(routeSectionId && articlesRef.current[routeSectionId]?.some((article) => article.id === routeArticleId))
        : true;

      if (!sectionExists) {
        route = { view: "home" };
        writeAppRoute(route, "replace");
      } else if (!articleExists && routeSectionId) {
        route = { view: "section", sectionId: routeSectionId };
        writeAppRoute(route, "replace");
      }
      if (route.view === "editor" && !editorAuthorizedRef.current) {
        const intendedRoute = route;
        route = route.mode === "edit"
          ? { view: "reader", sectionId: route.sectionId, articleId: route.articleId }
          : { view: "section", sectionId: route.sectionId };
        writeAppRoute(route, "replace");
        pendingEditorAction.current = () => {
          writeAppRoute(intendedRoute);
          window.dispatchEvent(new PopStateEvent("popstate"));
        };
        setAuthDialogOpen(true);
      }
      setSectionDialog(null);

      if (route.view === "home") {
        setActive("home"); setReading(null); setEditing(null); setHudAwake(true);
      } else if (route.view === "search") {
        setActive("search"); setSearchQuery(route.query ?? ""); setReading(null); setEditing(null); setHudAwake(true);
      } else if (route.view === "more") {
        setActive("more"); setReading(null); setEditing(null); setHudAwake(true);
      } else if (route.view === "section") {
        setActive(route.sectionId); setReading(null); setEditing(null); setHudAwake(true);
      } else if (route.view === "reader") {
        setActive(route.sectionId); setReading({ sectionId: route.sectionId, articleId: route.articleId }); setEditing(null); setHudAwake(false);
      } else {
        setActive(route.sectionId);
        setReading(route.mode === "edit" ? { sectionId: route.sectionId, articleId: route.articleId } : null);
        setEditing({ mode: route.mode, sectionId: route.sectionId, articleId: route.mode === "edit" ? route.articleId : window.crypto.randomUUID() });
        setHudAwake(false);
      }

      if (!window.location.hash) {
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 }));
      }
    };

    const current = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.replaceState({ ...current, minelog: true, minelogDepth: Number(current.minelogDepth ?? 0) }, "", window.location.href);
    const handlePopState = () => {
      const currentEditing = editingRef.current;
      if (!currentEditing || !editorDirtyRef.current) {
        applyRoute();
        return;
      }
      writeAppRoute(currentEditing.mode === "edit"
        ? { view: "editor", sectionId: currentEditing.sectionId, mode: "edit", articleId: currentEditing.articleId }
        : { view: "editor", sectionId: currentEditing.sectionId, mode: "new" });
      requestEditorExit(() => window.history.back());
    };

    applyRoute();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hydrated, contentReady, authReady, sectionsRemoteReady, requestEditorExit]);
  const immersive = Boolean(reading || editing);
  const autoHideHud = immersive;
  const immersiveContentKey = editing
    ? `editing:${editing.articleId}`
    : reading
      ? `reading:${reading.articleId}`
      : "";
  const showBackToTop = backToTopState.contentKey === immersiveContentKey && backToTopState.visible;
  useEffect(() => {
    if (!immersive) return undefined;

    const viewport = document.querySelector<HTMLElement>(".content-viewport");
    if (!viewport) return undefined;

    let frame = 0;
    const update = () => {
      frame = 0;
      const remaining = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
      const nearBottom = remaining <= Math.max(120, viewport.clientHeight * 0.18);
      const visible = viewport.scrollTop > 240 && nearBottom;
      setBackToTopState((current) => current.contentKey === immersiveContentKey && current.visible === visible
        ? current
        : { contentKey: immersiveContentKey, visible });
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [immersive, immersiveContentKey]);

  const scrollArticleToTop = useCallback(() => {
    const viewport = document.querySelector<HTMLElement>(".content-viewport");
    if (!viewport) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    viewport.scrollTo({ top: 0, left: 0, behavior });
  }, []);

  useEffect(() => () => {
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const sectionById = useMemo(() => new Map(sections.map((section) => [section.id, section])), [sections]);
  const hotbarSections = useMemo(() => resolveHotbarSections(sections), [sections]);
  const visible = useMemo(() => hotbarSections.filter((section): section is Section => Boolean(section)), [hotbarSections]);
  const visibleSectionIds = useMemo(() => new Set(visible.map((section) => section.id)), [visible]);
  const hidden = useMemo(() => sections.filter((section) => !visibleSectionIds.has(section.id)), [sections, visibleSectionIds]);
  const searchDocuments = useMemo<SearchDocument[]>(
    () => createSearchDocuments(sections, articlesBySection, markdownOverrides),
    [sections, articlesBySection, markdownOverrides],
  );
  const activeSection = sectionById.get(active);
  const readingSection = reading ? sectionById.get(reading.sectionId) : undefined;
  const readingArticle = reading ? articlesBySection[reading.sectionId]?.find((article) => article.id === reading.articleId) : undefined;
  const editingArticle = editing?.mode === "edit" ? articlesBySection[editing.sectionId]?.find((article) => article.id === editing.articleId) : undefined;
  const articleMarkdown = (article: SectionArticle) => markdownForArticle(markdownOverrides, article);
  const hasMarkdown = useCallback((articleId: string) => Object.prototype.hasOwnProperty.call(markdownOverrides, articleMarkdownKey(articleId)), [markdownOverrides]);
  const readingMarkdownReady = Boolean(reading && readingArticle && hasMarkdown(readingArticle.id));
  const editingMarkdownReady = editing?.mode !== "edit" || Boolean(editingArticle && hasMarkdown(editingArticle.id));
  const editorInitialValue = editing && editingMarkdownReady ? {
    id: editing.articleId,
    sectionId: editing.sectionId,
    title: editingArticle?.title ?? "",
    author: editingArticle?.author ?? "",
    summary: editingArticle?.summary ?? "",
    tags: editingArticle?.tags ?? [],
    markdown: editingArticle ? articleMarkdown(editingArticle) : "",
  } : undefined;

  useEffect(() => {
    const target = editing?.mode === "edit" && editingArticle
      ? editingArticle
      : reading && readingArticle
        ? readingArticle
        : undefined;
    if (!target || hasMarkdown(target.id)) return;
    const key = articleMarkdownKey(target.id);
    if (markdownRequests.current.has(key)) return;
    markdownRequests.current.add(key);
    void loadLocalArticleFile(target.id)
      .then(({ article }) => {
        if (typeof article.markdown !== "string") return;
        setContent((current) => ({
          ...current,
          markdown: { ...current.markdown, [key]: article.markdown as string },
        }));
      })
      .catch(() => {
        markdownRequests.current.delete(key);
        setNotice("文章正文载入失败，请稍后重试");
      });
  }, [editing, editingArticle, reading, readingArticle, hasMarkdown]);


  const ping = (message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2400);
  };
  const requestEditorAccess = (action: () => void) => {
    if (editorAuthorizedRef.current) {
      action();
      return;
    }
    pendingEditorAction.current = action;
    setAuthDialogOpen(true);
  };
  const finishEditorAuthorization = () => {
    editorAuthorizedRef.current = true;
    setEditorAuthorized(true);
    setAuthDialogOpen(false);
    const action = pendingEditorAction.current;
    pendingEditorAction.current = null;
    action?.();
  };
  const closeEditorAuthorization = () => {
    pendingEditorAction.current = null;
    setAuthDialogOpen(false);
  };  const saveSection = (value: Pick<Section, "id" | "label" | "icon" | "description">) => {
    if (!editorAuthorizedRef.current) return;
    if (!sectionDialog) return;
    if (sectionDialog.mode === "new") {
      const id = createSectionId();
      setSections((current) => [...current, { ...value, id, enabled: false }]);
      setContent((current) => ({ ...current, articles: { ...current.articles, [id]: [] } }));
      ping("新板块已添加到更多板块页");
    } else {
      setSections((current) => current.map((section) => section.id === value.id ? { ...section, ...value } : section));
      ping("板块信息已保存");
    }
    setSectionDialog(null);
  };
  const deleteSection = async (id: string) => {
    if (!editorAuthorizedRef.current) return;
    try {
      await deleteLocalArticleFile(id);
    } catch (error) {
      ping(error instanceof Error ? error.message : "\u5220\u9664\u677F\u5757\u6587\u4EF6\u5931\u8D25");
      return;
    }
    setSections((current) => current.filter((section) => section.id !== id));
    setContent((current) => ({
      articles: Object.fromEntries(Object.entries(current.articles).filter(([sectionId]) => sectionId !== id)) as Record<string, SectionArticle[]>,
      markdown: Object.fromEntries(Object.entries(current.markdown).filter(([key]) => !(current.articles[id] ?? []).some((article) => article.id === key))),
    }));
    if (active === id) { setActive("more"); writeAppRoute({ view: "more" }, "replace"); }
    setReading(null);
    setEditing(null);
    setSectionDialog(null);
    ping("板块及其文章已删除");
  };

  const wakeHud = () => {
    if (!autoHideHud) return;
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    setHudAwake(true);
    hudTimer.current = window.setTimeout(() => setHudAwake(false), 2600);
  };
  const holdHud = () => {
    if (!autoHideHud) return;
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    hudTimer.current = null;
    setHudAwake(true);
  };
  const releaseHud = () => {
    if (!autoHideHud) return;
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHudAwake(false), 900);
  };

  const beginSectionDrag = (event: DragEvent<HTMLElement>, sectionId: string, origin: "hotbar" | "more") => {
    if (!editorAuthorizedRef.current) {
      event.preventDefault();
      requestEditorAccess(() => undefined);
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-minelog-section", sectionId);
    event.dataTransfer.setData("text/plain", sectionId);
    const dragIcon = event.currentTarget.querySelector<HTMLImageElement>(".pixel-item");
    if (dragIcon) event.dataTransfer.setDragImage(dragIcon, dragIcon.offsetWidth / 2, dragIcon.offsetHeight / 2);
    dragOriginRef.current = origin;
    draggingSectionRef.current = sectionId;
    setDraggingSectionId(sectionId);
  };

  const finishSectionDrag = (event?: DragEvent<HTMLElement>) => {
    const releaseTarget = event ? document.elementFromPoint(event.clientX, event.clientY) : null;
    if (event && dragOriginRef.current === "hotbar" && active === "more" && !releaseTarget?.closest(".game-hud")) {
      const sectionId = draggingSectionRef.current;
      if (sectionId) {
        setSections((current) => current.map((section) => section.id === sectionId
          ? { ...section, enabled: false, hotbarSlot: undefined }
          : section));
        ping("板块已移入更多板块页");
      }
    }
    dragOriginRef.current = null;
    draggingSectionRef.current = null;
    setDraggingSectionId(null);
    setDragOverSlot(null);
  };

  const placeSectionInSlot = (sectionId: string, targetSlot: number) => {
    setSections((current) => assignSectionToHotbarSlot(current, sectionId, targetSlot));
    ping("\u5DE5\u5177\u69FD\u4F4D\u7F6E\u5DF2\u66F4\u65B0");
  };
  const allowSectionDrop = (event: DragEvent<HTMLElement>, slot: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverSlot !== slot) setDragOverSlot(slot);
  };

  const dropSectionInSlot = (event: DragEvent<HTMLElement>, slot: number) => {
    event.preventDefault();
    const sectionId = event.dataTransfer.getData("application/x-minelog-section")
      || event.dataTransfer.getData("text/plain")
      || draggingSectionId;
    if (sectionId) placeSectionInSlot(sectionId, slot);
    finishSectionDrag();
  };

  const slots: Array<Section | "home" | "more" | null> = Array(9).fill(null);
  slots[0] = "home";
  hotbarSections.forEach((section, index) => { slots[index + 1] = section; });
  slots[8] = "more";

  const openSearch = () => {
    if (navigating.current || active === "search") return;
    const update = () => {
      writeAppRoute({ view: "search" });
      flushSync(() => { setActive("search"); setSearchQuery(""); setReading(null); setEditing(null); setHudAwake(true); });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };
    requestEditorExit(() => runPageTransition(navigating, update));
  };

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    writeAppRoute({ view: "search", query }, "replace");
  };
  const navigate = (next: string) => {
    if (navigating.current || (next === active && !immersive)) return;
    const order = ["home", ...sections.map((section) => section.id), "more"];
    const direction: PageDirection = order.indexOf(next) >= order.indexOf(active) ? "forward" : "backward";
    const route: AppRoute = next === "home" ? { view: "home" } : next === "more" ? { view: "more" } : { view: "section", sectionId: next };
    const update = () => {
      writeAppRoute(route);
      flushSync(() => { setActive(next); setReading(null); setEditing(null); setHudAwake(true); });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };

    requestEditorExit(() => runPageTransition(navigating, update, direction));
  };

  const switchHotbarPage = (event: WheelEvent<HTMLElement>) => {
    if (event.ctrlKey || draggingSectionId) return;
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 3) return;
    event.preventDefault();

    const now = window.performance.now();
    if (navigating.current || now - wheelSwitchAt.current < 420) return;
    const pages = slots.reduce<string[]>((items, slot) => {
      if (slot) items.push(typeof slot === "string" ? slot : slot.id);
      return items;
    }, []);
    if (pages.length < 2) return;

    const step = delta > 0 ? 1 : -1;
    const currentIndex = pages.indexOf(active);
    const baseIndex = currentIndex >= 0 ? currentIndex : step > 0 ? -1 : 0;
    const next = pages[(baseIndex + step + pages.length) % pages.length];
    wheelSwitchAt.current = now;
    navigate(next);
  };
  const openReader = (sectionId: string, articleId: string) => {
    if (navigating.current) return;
    const update = () => {
      writeAppRoute({ view: "reader", sectionId, articleId });
      flushSync(() => { setActive(sectionId); setReading({ sectionId, articleId }); setEditing(null); setHudAwake(false); });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };
    runPageTransition(navigating, update);
  };

  const closeReader = () => {
    if (navigating.current) return;
    if (Number(window.history.state?.minelogDepth ?? 0) > 0) {
      window.history.back();
      return;
    }
    const update = () => {
      const sectionId = reading?.sectionId ?? active;
      writeAppRoute({ view: "section", sectionId }, "replace");
      flushSync(() => { setActive(sectionId); setReading(null); setHudAwake(true); });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };
    runPageTransition(navigating, update);
  };

  const openEditor = (request: EditorRequest) => {
    if (!editorAuthorizedRef.current) {
      requestEditorAccess(() => openEditor(request));
      return;
    }
    if (navigating.current) return;
    const state: EditorState = request.mode === "edit"
      ? request
      : { ...request, articleId: window.crypto.randomUUID() };
    const update = () => {
      writeAppRoute(state.mode === "edit"
        ? { view: "editor", sectionId: state.sectionId, mode: "edit", articleId: state.articleId }
        : { view: "editor", sectionId: state.sectionId, mode: "new" });
      flushSync(() => {
        setActive(state.sectionId);
        setEditing(state);
        if (state.mode === "new") setReading(null);
        setHudAwake(false);
      });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };
    runPageTransition(navigating, update);
  };

  const closeEditor = () => {
    requestEditorExit(() => {
      if (Number(window.history.state?.minelogDepth ?? 0) > 0) {
        window.history.back();
        return;
      }
      const route: AppRoute = reading
        ? { view: "reader", sectionId: reading.sectionId, articleId: reading.articleId }
        : { view: "section", sectionId: editing?.sectionId ?? active };
      writeAppRoute(route, "replace");
      setEditing(null);
      setHudAwake(!reading);
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    });
  };

  const saveArticle = async (value: ArticleEditorValue) => {
    if (!editing || !editorAuthorizedRef.current) return;
    const today = new Date();
    const date = `${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
    const updatedAt = new Date().toISOString();
    const nextArticle: SectionArticle = {
      id: value.id,
      title: value.title,
      author: value.author,
      summary: value.summary,
      tags: value.tags,
      date,
      read: `${Math.max(1, Math.ceil(value.markdown.replace(/\s/g, "").length / 500))} MIN`,
      updatedAt,
    };

    try {
      await saveLocalArticleFile({
        ...nextArticle,
        sectionId: value.sectionId,
        markdown: value.markdown,
      }, value.uploadedAssetUrls ?? []);
    } catch (error) {
      ping(error instanceof Error ? error.message : "\u4FDD\u5B58 Markdown \u6587\u4EF6\u5931\u8D25");
      return;
    }

    setContent((current) => {
      const articles = Object.fromEntries(Object.entries(current.articles).map(([id, entries]) => [id, [...entries]])) as Record<string, SectionArticle[]>;
      for (const sectionId of Object.keys(articles)) {
        articles[sectionId] = articles[sectionId].filter((article) => article.id !== value.id);
      }
      articles[value.sectionId] = [nextArticle, ...(articles[value.sectionId] ?? [])];
      return {
        articles,
        markdown: { ...current.markdown, [articleMarkdownKey(value.id)]: value.markdown },
      };
    });
    setActive(value.sectionId);
    setReading({ sectionId: value.sectionId, articleId: value.id });
    setEditing(null);
    setHudAwake(false);
    writeAppRoute({ view: "reader", sectionId: value.sectionId, articleId: value.id }, "replace");
    document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    ping(editing.mode === "edit" ? "文章修改已保存" : "新文章已保存");
  };

  const deleteArticle = async () => {
    if (!editing || editing.mode !== "edit" || !editorAuthorizedRef.current) return;
    const { sectionId, articleId } = editing;
    try {
      await deleteLocalArticleFile(sectionId, articleId);
    } catch (error) {
      ping(error instanceof Error ? error.message : "\u5220\u9664 Markdown \u6587\u4EF6\u5931\u8D25");
      return;
    }
    setContent((current) => {
      const markdown = { ...current.markdown };
      delete markdown[articleMarkdownKey(articleId)];
      return {
        articles: {
          ...current.articles,
          [sectionId]: (current.articles[sectionId] ?? []).filter((article) => article.id !== articleId),
        },
        markdown,
      };
    });
    setEditing(null);
    setReading(null);
    setActive(sectionId);
    setHudAwake(true);
    writeAppRoute({ view: "section", sectionId }, "replace");
    document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    ping("文章已删除");
  };
  return <main className={`minecraft-shell${active === "home" ? " is-home" : ""}`}>
    <div className="scene-shade" />
    <HomeBackdrop />
    <div
      className={`home-globe-layer${active === "home" ? " is-active" : ""}`}
      aria-hidden={active !== "home"}
    >
      <VisitorGlobe offline={__MINELOG_LOCAL_MODE__} active={active === "home"} />
    </div>
    <header className="topbar">
      <button className={`brand-lockup${__MINELOG_LOCAL_MODE__ ? " is-local" : ""}`} onClick={() => navigate("home")} aria-label="返回首页">
        <span className="brand-icon-stack">
          <span className="brand-cube" />
          {__MINELOG_LOCAL_MODE__ && <span className="local-sync-off" title="本地模式：无云同步" aria-label="本地模式：无云同步">
            <img src="/minecraft/ui/local-sync-off.png" alt="" aria-hidden="true" />
          </span>}
        </span>
        <strong>MINELOG</strong>
      </button>
      <div className="top-actions">
        {active === "home" && !immersive && <GameIconButton className="search-trigger" icon={MINECRAFT_UI_ICONS.search} label="搜索全部文章" onClick={openSearch} />}
        {active === "more" && !immersive && sections.length > 0 && <GameIconButton className="section-edit-trigger" icon={MINECRAFT_UI_ICONS.manageSections} label="编辑板块" onClick={() => requestEditorAccess(() => setSectionDialog({ mode: "edit" }))} />}
        {activeSection && !immersive && <GameIconButton className="new-article-trigger" icon={MINECRAFT_UI_ICONS.createArticle} label={`在${activeSection.label}新增文章`} onClick={() => openEditor({ mode: "new", sectionId: activeSection.id })} />}
        {reading && readingArticle && !editing && <GameIconButton className="reader-edit-trigger" icon={MINECRAFT_UI_ICONS.editArticle} label="编辑当前文章" onClick={() => openEditor({ mode: "edit", sectionId: reading.sectionId, articleId: readingArticle.id })} />}
      </div>
    </header>

    <section className={`content-viewport${immersive ? " is-reading" : ""}`} aria-live="polite">
      <Suspense fallback={<div className="content-loading-state" role="status">正在载入页面…</div>}>
      {editing ? (editorInitialValue ? <ArticleEditor mode={editing.mode} sections={sections} initialValue={editorInitialValue} onCancel={closeEditor} onSave={saveArticle} onDelete={editing.mode === "edit" ? deleteArticle : undefined} onDirtyChange={handleEditorDirtyChange} /> : <div className="content-loading-state" role="status">正在载入文章正文…</div>) : readingSection && readingArticle ? (readingMarkdownReady ? <ArticleReader section={readingSection} article={readingArticle} markdown={articleMarkdown(readingArticle)} onBack={closeReader} /> : <div className="content-loading-state" role="status">正在载入文章正文…</div>) : <>
      {active === "home" && <div className="home-content" />}

      {active === "search" && <SearchPage
        query={searchQuery}
        documents={searchDocuments}
        onQueryChange={updateSearchQuery}
        onOpen={openReader}
      />}
      {activeSection && <SectionPage section={activeSection} articles={articlesBySection[activeSection.id] ?? []} onOpen={(title) => openReader(activeSection.id, title)} />}

      {active === "more" && <div className="more-page">
        <header className="section-hero more-hero">
          <div className="section-title"><h1>更多板块</h1><span>板块可拖入工具槽；将槽内板块拖出工具槽即可移回此页。</span></div>
        </header>
        <div className={`more-grid${draggingSectionId ? " has-active-drag" : ""}`}>{hidden.map((x) =>
          <button
            type="button"
            key={x.id}
            className={draggingSectionId === x.id ? "is-dragging" : ""}
            draggable={editorAuthorized}
            onDragStart={(event) => beginSectionDrag(event, x.id, "more")}
            onDragEnd={finishSectionDrag}
            onClick={() => navigate(x.id)}
            aria-label={`${x.label}，按住可拖入工具槽`}
          >
            <span className="block-swatch"><Item src={x.icon} /></span>
            <span className="more-copy"><strong>{x.label}</strong><small>{x.description}</small></span>
            <span className="more-drag-handle" aria-hidden="true">⋮</span>
          </button>)}
          <button type="button" className="more-add-card" onClick={() => requestEditorAccess(() => setSectionDialog({ mode: "new" }))}><span className="block-swatch more-add-swatch"><Item src={MINECRAFT_UI_ICONS.createSection} /></span><span className="more-copy"><strong>新增板块</strong><small>设置图标、大标题与副标题</small></span><span className="more-add-mark" aria-hidden="true">＋</span></button>
        </div>
      </div>}
      </>}
      </Suspense>
    </section>

    {immersive && <button
      type="button"
      className={`article-back-to-top${showBackToTop ? " is-visible" : ""}`}
      aria-label="回到顶部"
      aria-hidden={!showBackToTop}
      tabIndex={showBackToTop ? 0 : -1}
      onClick={scrollArticleToTop}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7.5h14M6.5 15.5 12 10l5.5 5.5" />
      </svg>
    </button>}

    {!immersive && <div className="page-bottom-fade" aria-hidden="true" />}

    <nav className={`game-hud${autoHideHud ? (hudAwake ? " immersive-hud-awake" : " immersive-hud-hidden") : ""}`} aria-label="页面工具槽" onWheel={switchHotbarPage} onPointerEnter={holdHud} onPointerLeave={releaseHud} onFocus={holdHud} onBlur={releaseHud}>
      <div className="hotbar-shell"><img className="hotbar-frame" src="/minecraft/hud/hotbar.png" alt="" /><div className="hotbar-slots">
        {slots.map((slot, i) => {
          if (!slot) return <button
            type="button"
            className={`empty-slot${dragOverSlot === i ? " is-drop-target" : ""}`}
            key={"empty-" + i}
            onDragOver={(event) => allowSectionDrop(event, i)}
            onDragEnter={() => setDragOverSlot(i)}
            onDrop={(event) => dropSectionInSlot(event, i)}
            aria-label={`空工具槽 ${i}，可拖入板块`}
          ><span aria-hidden="true">·</span></button>;
          const id = typeof slot === "string" ? slot : slot.id;
          const label = slot === "home" ? "首页" : slot === "more" ? "更多" : slot.label;
          const icon = slot === "home" ? MINECRAFT_UI_ICONS.home : slot === "more" ? MINECRAFT_UI_ICONS.more : slot.icon;
          const draggable = typeof slot !== "string" && editorAuthorized;
          const className = [active === id ? "active" : "", draggingSectionId === id ? "is-dragging" : "", dragOverSlot === i ? "is-drop-target" : ""].filter(Boolean).join(" ");
          return <button
            type="button"
            key={id}
            className={className}
            draggable={draggable}
            onDragStart={draggable ? (event) => beginSectionDrag(event, id, "hotbar") : undefined}
            onDragEnd={draggable ? finishSectionDrag : undefined}
            onDragOver={draggable ? (event) => allowSectionDrop(event, i) : undefined}
            onDragEnter={draggable ? () => setDragOverSlot(i) : undefined}
            onDrop={draggable ? (event) => dropSectionInSlot(event, i) : undefined}
            onClick={() => navigate(id)}
            aria-label={draggable ? `${label}，可拖动调整工具槽位置` : `前往${label}`}
            aria-current={active === id ? "page" : undefined}
          ><Item src={icon} /><span className="slot-tooltip">{label}</span></button>;
        })}
      </div></div>
    </nav>
    {autoHideHud && <button className={`hud-wake-zone${hudAwake ? " is-dormant" : ""}`} type="button" aria-label="显示页面工具栏" onPointerEnter={wakeHud} onClick={wakeHud} />}

    {notice && <div className="toast" role="status">{notice}</div>}

    {authDialogOpen && <EditorAccessModal onAuthorized={finishEditorAuthorization} onClose={closeEditorAuthorization} />}

    {discardDialogOpen && <GameModal
      eyebrow="UNSAVED CHANGES"
      title="放弃未保存的更改？"
      description="当前文章已经发生更改，但尚未保存。离开编辑页后，本次修改将无法恢复。"
      icon={MINECRAFT_UI_ICONS.editArticle}
      onClose={continueEditing}
      footer={<><button type="button" className="pixel-button" onClick={continueEditing}>继续编辑</button><button type="button" className="pixel-button editor-delete-confirm" onClick={discardEditorChanges}>放弃更改</button></>}
    >
      <div className="editor-delete-summary editor-discard-summary"><span>尚未保存</span><strong>文章内容已被修改</strong><small>建议先保存文章，再切换到其他页面。</small></div>
    </GameModal>}

    {sectionDialog && <SectionEditorModal
      mode={sectionDialog.mode}
      sections={sections}
      onClose={() => setSectionDialog(null)}
      onSave={saveSection}
      onDelete={deleteSection}
    />}
  </main>;
}
