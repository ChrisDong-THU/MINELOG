"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { GameIconButton, GameModal } from "./components/game-modal";
import { ArticleReader } from "./components/article-reader";
import { ArticleEditor, type ArticleEditorValue } from "./components/article-editor";
import { SectionEditorModal } from "./components/section-editor-modal";
import { getArticleMarkdown } from "./article-markdown";
import { SECTION_ARTICLES, type SectionArticle } from "./section-articles";
import { createJsonStorageStore, useHydrated, useJsonStorageState } from "./browser-storage";
import { readAppRoute, writeAppRoute, type AppRoute } from "./navigation";
import { FeedCarousel } from "./components/feed-carousel";
import { SectionPage } from "./components/section-page";
import { SearchPage, type SearchDocument } from "./components/search-page";
import type { FeedEntry, Section } from "./content-types";

type EditorState = { mode: "new" | "edit"; sectionId: string; title?: string };
type SectionDialogState = { mode: "new" | "edit" };
const KEY = "minelog-toolbar-v1";
const CONTENT_KEY = "minelog-content-v1";
const DEFAULTS: Section[] = [
  { id: "ai", label: "AI 工程", icon: "/minecraft/items/redstone.png", enabled: true, description: "模型、智能体、RAG 与推理系统" },
  { id: "web", label: "Web 开发", icon: "/minecraft/items/spyglass.png", enabled: true, description: "前端、服务端与体验工程" },
  { id: "data", label: "数据笔记", icon: "/minecraft/items/writable_book.png", enabled: true, description: "数据库、分析与数据管道" },
  { id: "systems", label: "系统设计", icon: "/minecraft/items/ender_eye.png", enabled: true, description: "架构、分布式系统与可靠性" },
  { id: "toolbox", label: "工具箱", icon: "/minecraft/items/chest_minecart.png", enabled: true, description: "工作流、脚本与效率工具" },
  { id: "reading", label: "阅读札记", icon: "/minecraft/items/nether_star.png", enabled: true, description: "书籍、论文与长期阅读" },
  { id: "devops", label: "DevOps", icon: "/minecraft/items/redstone.png", enabled: false, description: "交付、观测与基础设施" },
  { id: "life", label: "生活实验", icon: "/minecraft/items/bundle.png", enabled: false, description: "习惯、旅行与日常发现" },
];

type ContentState = {
  articles: Record<string, SectionArticle[]>;
  markdown: Record<string, string>;
};

const DEFAULT_CONTENT: ContentState = {
  articles: Object.fromEntries(Object.entries(SECTION_ARTICLES).map(([id, articles]) => [id, [...articles]])),
  markdown: {},
};
const SECTION_STORE = createJsonStorageStore(KEY, DEFAULTS);
const CONTENT_STORE = createJsonStorageStore(CONTENT_KEY, DEFAULT_CONTENT);

const papers: FeedEntry[] = [
  ["Nature Machine Intelligence", "Agentic Memory for Long-Horizon LLM Agents", "08.01", "14 MIN"],
  ["NeurIPS 2025", "Efficient Inference via Adaptive Token Routing", "07.28", "11 MIN"],
  ["ACL 2025", "Multimodal Retrieval-Augmented Generation at Scale", "07.21", "9 MIN"],
];

function createSectionId() {
  return `section-${window.crypto.randomUUID()}`;
}
function Item({ src, alt = "" }: { src: string; alt?: string }) {
  return <img className="pixel-item" src={src} alt={alt} draggable={false} />;
}

export default function Home() {
  const [sections, setSections] = useJsonStorageState(SECTION_STORE);
  const [content, setContent] = useJsonStorageState(CONTENT_STORE);
  const hydrated = useHydrated();
  const articlesBySection = content.articles;
  const markdownOverrides = content.markdown;
  const [active, setActive] = useState("home");
  const [settings, setSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [updateLogOpen, setUpdateLogOpen] = useState(false);
  const [sectionDialog, setSectionDialog] = useState<SectionDialogState | null>(null);
  const [notice, setNotice] = useState("");
  const [reading, setReading] = useState<{ sectionId: string; title: string } | null>(null);
  const [editing, setEditing] = useState<EditorState | null>(null);
  const [hudAwake, setHudAwake] = useState(true);
  const navigating = useRef(false);
  const hudTimer = useRef<number | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const sectionsRef = useRef(sections);
  const articlesRef = useRef(articlesBySection);
  useEffect(() => {
    sectionsRef.current = sections;
    articlesRef.current = articlesBySection;
  }, [sections, articlesBySection]);

  useEffect(() => {
    if (!hydrated) return;

    const applyRoute = () => {
      let route = readAppRoute();
      const routeSectionId = "sectionId" in route ? route.sectionId : undefined;
      const sectionExists = routeSectionId ? sectionsRef.current.some((section) => section.id === routeSectionId) : true;
      const articleExists = route.view === "reader" || (route.view === "editor" && route.mode === "edit")
        ? Boolean(routeSectionId && route.title && articlesRef.current[routeSectionId]?.some((article) => article.title === route.title))
        : true;

      if (!sectionExists) {
        route = { view: "home" };
        writeAppRoute(route, "replace");
      } else if (!articleExists && routeSectionId) {
        route = { view: "section", sectionId: routeSectionId };
        writeAppRoute(route, "replace");
      }

      setSettings(false);
      setUpdateLogOpen(false);
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
        setActive(route.sectionId); setReading({ sectionId: route.sectionId, title: route.title }); setEditing(null); setHudAwake(false);
      } else {
        setActive(route.sectionId);
        setReading(route.mode === "edit" && route.title ? { sectionId: route.sectionId, title: route.title } : null);
        setEditing({ mode: route.mode, sectionId: route.sectionId, title: route.title });
        setHudAwake(false);
      }

      if (!window.location.hash) {
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 }));
      }
    };

    const current = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.replaceState({ ...current, minelog: true, minelogDepth: Number(current.minelogDepth ?? 0) }, "", window.location.href);
    applyRoute();
    window.addEventListener("popstate", applyRoute);
    return () => window.removeEventListener("popstate", applyRoute);
  }, [hydrated]);
  const immersive = Boolean(reading || editing);
  useEffect(() => () => {
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
  }, []);

  const visible = useMemo(() => sections.filter((x) => x.enabled).slice(0, 7), [sections]);
  const hidden = useMemo(() => sections.filter((x) => !visible.some((y) => y.id === x.id)), [sections, visible]);
  const recentHistory = useMemo<FeedEntry[]>(() => sections
    .flatMap((section) => (articlesBySection[section.id] ?? []).map((article) => [section.label, article.title, article.date, article.read, section.id] as FeedEntry))
    .sort((a, b) => b[2].localeCompare(a[2]))
    .slice(0, 20), [sections, articlesBySection]);
  const recentPosts = useMemo(() => recentHistory.slice(0, 5), [recentHistory]);
  const searchDocuments = useMemo<SearchDocument[]>(() => sections.flatMap((section) =>
    (articlesBySection[section.id] ?? []).map((article) => ({
      sectionId: section.id,
      sectionLabel: section.label,
      sectionIcon: section.icon,
      article,
      markdown: markdownOverrides[`${section.id}:${article.title}`] ?? getArticleMarkdown(article),
    }))
  ), [sections, articlesBySection, markdownOverrides]);
  const activeSection = sections.find((x) => x.id === active);
  const readingSection = reading ? sections.find((section) => section.id === reading.sectionId) : undefined;
  const readingArticle = reading ? articlesBySection[reading.sectionId]?.find((article) => article.title === reading.title) : undefined;
  const editingArticle = editing?.mode === "edit" ? articlesBySection[editing.sectionId]?.find((article) => article.title === editing.title) : undefined;
  const articleMarkdown = (sectionId: string, article: SectionArticle) => markdownOverrides[`${sectionId}:${article.title}`] ?? getArticleMarkdown(article);
  const editorInitialValue = editing ? {
    sectionId: editing.sectionId,
    title: editingArticle?.title ?? "",
    summary: editingArticle?.summary ?? "",
    tags: editingArticle?.tags ?? [],
    markdown: editingArticle ? articleMarkdown(editing.sectionId, editingArticle) : "",
  } : undefined;


  const ping = (message: string) => {
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2400);
  };
  const move = (index: number, step: number) => {
    const to = index + step;
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    [next[index], next[to]] = [next[to], next[index]];
    setSections(next);
  };
  const toggle = (id: string) => {
    const count = sections.filter((x) => x.enabled).length;
    setSections(sections.map((x) => {
      if (x.id !== id) return x;
      if (!x.enabled && count >= 7) { ping("工具槽最多展示 7 个动态板块"); return x; }
      return { ...x, enabled: !x.enabled };
    }));
  };
  const saveSection = (value: Pick<Section, "id" | "label" | "icon" | "description">) => {
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
  const deleteSection = (id: string) => {
    setSections((current) => current.filter((section) => section.id !== id));
    setContent((current) => ({
      articles: Object.fromEntries(Object.entries(current.articles).filter(([sectionId]) => sectionId !== id)) as Record<string, SectionArticle[]>,
      markdown: Object.fromEntries(Object.entries(current.markdown).filter(([key]) => !key.startsWith(`${id}:`))),
    }));
    if (active === id) { setActive("more"); writeAppRoute({ view: "more" }, "replace"); }
    setReading(null);
    setEditing(null);
    setSectionDialog(null);
    ping("板块及其文章已删除");
  };

  const wakeHud = () => {
    if (!immersive) return;
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    setHudAwake(true);
    hudTimer.current = window.setTimeout(() => setHudAwake(false), 2600);
  };
  const holdHud = () => {
    if (!immersive) return;
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    hudTimer.current = null;
    setHudAwake(true);
  };
  const releaseHud = () => {
    if (!immersive) return;
    if (hudTimer.current !== null) window.clearTimeout(hudTimer.current);
    hudTimer.current = window.setTimeout(() => setHudAwake(false), 900);
  };

  const slots: Array<Section | "home" | "more" | null> = Array(9).fill(null);
  slots[0] = "home";
  visible.forEach((x, i) => { slots[i + 1] = x; });
  slots[8] = "more";

  const openSearch = () => {
    if (navigating.current || active === "search") return;
    const update = () => {
      writeAppRoute({ view: "search" });
      flushSync(() => { setActive("search"); setSearchQuery(""); setReading(null); setEditing(null); setHudAwake(true); });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };
    if (!document.startViewTransition) { update(); return; }
    navigating.current = true;
    document.startViewTransition(update).finished.finally(() => { navigating.current = false; });
  };

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    writeAppRoute({ view: "search", query }, "replace");
  };
  const navigate = (next: string) => {
    if (navigating.current || (next === active && !immersive)) return;
    const order = ["home", ...sections.map((section) => section.id), "more"];
    const direction = order.indexOf(next) >= order.indexOf(active) ? "forward" : "backward";
    const root = document.documentElement;
    const route: AppRoute = next === "home" ? { view: "home" } : next === "more" ? { view: "more" } : { view: "section", sectionId: next };
    const update = () => {
      writeAppRoute(route);
      flushSync(() => { setActive(next); setReading(null); setEditing(null); setHudAwake(true); });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };

    root.dataset.pageDirection = direction;
    if (!document.startViewTransition) {
      update();
      delete root.dataset.pageDirection;
      return;
    }

    navigating.current = true;
    document.startViewTransition(update).finished.finally(() => {
      navigating.current = false;
      delete root.dataset.pageDirection;
    });
  };

  const openReader = (sectionId: string, title: string) => {
    if (navigating.current) return;
    const update = () => {
      writeAppRoute({ view: "reader", sectionId, title });
      flushSync(() => { setActive(sectionId); setReading({ sectionId, title }); setEditing(null); setHudAwake(false); });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };
    if (!document.startViewTransition) { update(); return; }
    navigating.current = true;
    document.startViewTransition(update).finished.finally(() => { navigating.current = false; });
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
    if (!document.startViewTransition) { update(); return; }
    navigating.current = true;
    document.startViewTransition(update).finished.finally(() => { navigating.current = false; });
  };

  const openEditor = (state: EditorState) => {
    if (navigating.current) return;
    const update = () => {
      writeAppRoute({ view: "editor", sectionId: state.sectionId, mode: state.mode, title: state.title });
      flushSync(() => {
        setActive(state.sectionId);
        setEditing(state);
        if (state.mode === "new") setReading(null);
        setHudAwake(false);
      });
      document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    };
    if (!document.startViewTransition) { update(); return; }
    navigating.current = true;
    document.startViewTransition(update).finished.finally(() => { navigating.current = false; });
  };

  const closeEditor = () => {
    if (Number(window.history.state?.minelogDepth ?? 0) > 0) {
      window.history.back();
      return;
    }
    const route: AppRoute = reading
      ? { view: "reader", sectionId: reading.sectionId, title: reading.title }
      : { view: "section", sectionId: editing?.sectionId ?? active };
    writeAppRoute(route, "replace");
    setEditing(null);
    setHudAwake(!reading);
    document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
  };

  const saveArticle = (value: ArticleEditorValue) => {
    if (!editing) return;
    const today = new Date();
    const date = `${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
    const nextArticle: SectionArticle = {
      title: value.title,
      summary: value.summary,
      tags: value.tags,
      date,
      read: `${Math.max(1, Math.ceil(value.markdown.replace(/\s/g, "").length / 500))} MIN`,
    };

    setContent((current) => {
      const articles = Object.fromEntries(Object.entries(current.articles).map(([id, entries]) => [id, [...entries]])) as Record<string, SectionArticle[]>;
      const markdown = { ...current.markdown };
      if (editing.mode === "edit") {
        articles[editing.sectionId] = (articles[editing.sectionId] ?? []).filter((article) => article.title !== editing.title);
        delete markdown[`${editing.sectionId}:${editing.title}`];
      }
      articles[value.sectionId] = [nextArticle, ...(articles[value.sectionId] ?? []).filter((article) => article.title !== value.title)];
      markdown[`${value.sectionId}:${value.title}`] = value.markdown;
      return { articles, markdown };
    });
    setActive(value.sectionId);
    setReading({ sectionId: value.sectionId, title: value.title });
    setEditing(null);
    setHudAwake(false);
    writeAppRoute({ view: "reader", sectionId: value.sectionId, title: value.title }, "replace");
    document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
    ping(editing.mode === "edit" ? "文章修改已保存" : "新文章已保存");
  };
  const deleteArticle = () => {
    if (!editing || editing.mode !== "edit" || !editing.title) return;
    const { sectionId, title } = editing;
    setContent((current) => {
      const markdown = { ...current.markdown };
      delete markdown[`${sectionId}:${title}`];
      return {
        articles: {
          ...current.articles,
          [sectionId]: (current.articles[sectionId] ?? []).filter((article) => article.title !== title),
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
  return <main className="minecraft-shell">
    <div className="scene-shade" />
    <header className="topbar">
      <button className="brand-lockup" onClick={() => navigate("home")} aria-label="返回首页">
        <span className="brand-cube" /><strong>MINELOG</strong>
      </button>
      <div className="top-actions">
        {active === "home" && !immersive && <GameIconButton className="search-trigger" icon="/minecraft/items/spyglass.png" label="搜索全部文章" onClick={openSearch} />}
        {active === "home" && !immersive && <GameIconButton className="settings-trigger" icon="/minecraft/items/comparator.png" label="打开工具槽设置" onClick={() => setSettings(true)} />}
        {active === "more" && !immersive && sections.length > 0 && <GameIconButton className="section-edit-trigger" icon="/minecraft/items/writable_book.png" label="编辑板块" onClick={() => setSectionDialog({ mode: "edit" })} />}
        {activeSection && !immersive && <GameIconButton className="new-article-trigger" icon="/minecraft/items/writable_book.png" label={`在${activeSection.label}新增文章`} onClick={() => openEditor({ mode: "new", sectionId: activeSection.id })} />}
        {reading && readingArticle && !editing && <GameIconButton className="reader-edit-trigger" icon="/minecraft/items/writable_book.png" label="编辑当前文章" onClick={() => openEditor({ mode: "edit", sectionId: reading.sectionId, title: readingArticle.title })} />}
      </div>
    </header>

    <section className={`content-viewport${immersive ? " is-reading" : ""}`} aria-live="polite">
      {editing && editorInitialValue ? <ArticleEditor mode={editing.mode} sections={sections} initialValue={editorInitialValue} onCancel={closeEditor} onSave={saveArticle} onDelete={editing.mode === "edit" ? deleteArticle : undefined} /> : readingSection && readingArticle ? <ArticleReader section={readingSection} article={readingArticle} markdown={articleMarkdown(readingSection.id, readingArticle)} onBack={closeReader} /> : <>
      {active === "home" && <div className="home-content">
        <div className="hero-copy">
          <h1 className="hero-title"><img className="hero-title-image" src="/minecraft/ui/minelog-title.png" alt="MINELOG" /></h1>
          <p className="tagline">矿脉日志：挖掘 &amp; 记录</p>
        </div>
        <div className="broadcast-grid">
          <section className="broadcast-panel recent-panel">
            <div className="panel-heading"><div><p className="panel-kicker">WORLD LOG / 01</p><h2>最近更新</h2></div><span className="live-chip"><i /> LIVE</span></div>
            <FeedCarousel entries={recentPosts} arrow="/minecraft/items/arrow.png" onOpen={(entry) => {
              const section = sections.find((item) => item.id === entry[4]);
              const article = section ? articlesBySection[section.id]?.find((item) => item.title === entry[1]) : undefined;
              if (section && article) openReader(section.id, article.title); else ping("该文章正文尚未录入");
            }} />
            <button className="panel-link" onClick={() => setUpdateLogOpen(true)}><span>查看全部记录</span><img className="link-arrow" src="/minecraft/items/arrow.png" alt="" /></button>
          </section>
          <section className="broadcast-panel paper-panel">
            <div className="panel-heading"><div><p className="panel-kicker">PAPER FEED / 02</p><h2>论文推送</h2></div><span className="live-chip paper-chip"><i /> FEED</span></div>
            <FeedCarousel entries={papers} arrow="/minecraft/items/spectral_arrow.png" onOpen={() => ping("Paper Feed 接口将在后续阶段接入")} />
            <button className="panel-link" onClick={() => ping("论文索引将在订阅源接入后开放")}><span>查看全部论文</span><img className="link-arrow" src="/minecraft/items/spectral_arrow.png" alt="" /></button>
          </section>
        </div>
      </div>}

      {active === "search" && <SearchPage
        query={searchQuery}
        documents={searchDocuments}
        onQueryChange={updateSearchQuery}
        onOpen={openReader}
      />}
      {activeSection && <SectionPage section={activeSection} articles={articlesBySection[activeSection.id] ?? []} onOpen={(title) => openReader(activeSection.id, title)} />}

      {active === "more" && <div className="more-page">
        <header className="section-hero more-hero">
          <div className="section-title"><h1>更多板块</h1><span>未放入快捷工具槽的板块，都集中存放在这里。</span></div>
        </header>
        <div className="more-grid">{(hidden.length ? hidden : sections).map((x) =>
          <button type="button" key={x.id} onClick={() => navigate(x.id)}><span className="block-swatch"><Item src={x.icon} /></span><span className="more-copy"><strong>{x.label}</strong><small>{x.description}</small></span><img className="more-arrow" src="/minecraft/items/arrow.png" alt="" /></button>)}
          <button type="button" className="more-add-card" onClick={() => setSectionDialog({ mode: "new" })}><span className="block-swatch more-add-swatch"><Item src="/minecraft/items/writable_book.png" /></span><span className="more-copy"><strong>新增板块</strong><small>设置图标、大标题与副标题</small></span><span className="more-add-mark" aria-hidden="true">＋</span></button>
        </div>
      </div>}
      </>}
    </section>

    <nav className={`game-hud${immersive ? (hudAwake ? " reader-hud-awake" : " reader-hud-hidden") : ""}`} aria-label="页面工具槽" onPointerEnter={holdHud} onPointerLeave={releaseHud} onFocus={holdHud} onBlur={releaseHud}>
      <div className="hotbar-shell"><img className="hotbar-frame" src="/minecraft/hud/hotbar.png" alt="" /><div className="hotbar-slots">
        {slots.map((slot, i) => {
          if (!slot) return <span className="empty-slot" key={"empty-" + i} />;
          const id = typeof slot === "string" ? slot : slot.id;
          const label = slot === "home" ? "首页" : slot === "more" ? "更多" : slot.label;
          const icon = slot === "home" ? "/minecraft/items/book.png" : slot === "more" ? "/minecraft/items/bundle.png" : slot.icon;
          return <button key={id} className={active === id ? "active" : ""} onClick={() => navigate(id)} aria-label={"前往" + label} aria-current={active === id ? "page" : undefined}><Item src={icon} /><span className="slot-tooltip">{i + 1} · {label}</span></button>;
        })}
      </div></div>
    </nav>
    {immersive && <button className={`hud-wake-zone${hudAwake ? " is-dormant" : ""}`} type="button" aria-label="显示页面工具栏" onPointerEnter={wakeHud} onClick={wakeHud} />}

    {notice && <div className="toast" role="status">{notice}</div>}

    {sectionDialog && <SectionEditorModal
      mode={sectionDialog.mode}
      sections={hidden.length ? hidden : sections}
      onClose={() => setSectionDialog(null)}
      onSave={saveSection}
      onDelete={deleteSection}
    />}

    {updateLogOpen && <GameModal
      className="update-history-modal"
      eyebrow="WORLD LOG / ARCHIVE"
      title="最近更新记录"
      description="按更新时间排列最近 20 篇文章；点击任意记录可直接进入阅读。"
      icon="/minecraft/items/book.png"
      onClose={() => setUpdateLogOpen(false)}
      footer={<><span className="update-history__summary">已显示最近 {recentHistory.length} 条</span><button className="pixel-button modal-done" onClick={() => setUpdateLogOpen(false)}>关闭</button></>}
    >
      <div className="update-history-list">
        {recentHistory.map((entry, index) => <button className="update-history-entry" type="button" key={(entry[4] ?? entry[0]) + ":" + entry[1]} onClick={() => {
          const section = sections.find((item) => item.id === entry[4]);
          const article = section ? articlesBySection[section.id]?.find((item) => item.title === entry[1]) : undefined;
          if (section && article) { setUpdateLogOpen(false); openReader(section.id, article.title); }
        }}>
          <span className="update-history-entry__index">{String(index + 1).padStart(2, "0")}</span>
          <span className="update-history-entry__copy"><small>{entry[0]} · {entry[2]}</small><strong>{entry[1]}</strong></span>
          <span className="update-history-entry__read">{entry[3]}<img src="/minecraft/items/arrow.png" alt="" /></span>
        </button>)}
        {recentHistory.length === 0 && <p className="update-history-empty">暂无文章更新记录</p>}
      </div>
    </GameModal>}
    {settings && <GameModal
      eyebrow="HOTBAR LOADOUT"
      title="工具槽配置"
      description="选择常驻板块并调整顺序；修改会自动保存在当前设备。"
      icon="/minecraft/items/comparator.png"
      onClose={() => setSettings(false)}
      footer={<><span className="slot-usage"><b>{visible.length}</b> / 7 个动态槽位</span><button className="pixel-button modal-done" onClick={() => setSettings(false)}>完成</button></>}
    >
      <div className="section-settings">{sections.map((x, i) => <div className={"setting-row " + (x.enabled ? "enabled" : "")} key={x.id}>
        <span className="setting-icon"><Item src={x.icon} /></span>
        <span className="setting-name"><strong>{x.label}</strong><small>{x.description}</small></span>
        <span className="order-controls" role="group" aria-label={"调整" + x.label + "的顺序"}>
          <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="向前移动"><span aria-hidden="true">↑</span></button>
          <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label="向后移动"><span aria-hidden="true">↓</span></button>
        </span>
        <button className="toggle-button" onClick={() => toggle(x.id)} aria-pressed={x.enabled}><i /><span>{x.enabled ? "已展示" : "未展示"}</span></button>
      </div>)}</div>
    </GameModal>}

  </main>;
}

