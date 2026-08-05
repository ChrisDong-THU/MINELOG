"use client";

import { useMemo, useState } from "react";
import type { Section } from "../content-types";
import { MINECRAFT_UI_ICONS } from "../minecraft-icons";
import type { SectionArticle } from "../content-types";

type SectionUiIconName = "recent" | "alphabetical";

function SectionUiIcon({ name }: { name: SectionUiIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "square" as const,
    strokeLinejoin: "miter" as const,
    strokeWidth: 1.8,
  };

  if (name === "recent") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle {...common} cx="12" cy="12" r="8.5" /><path {...common} d="M12 7v5l3.5 2M4.5 5.5H8v3.5" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M6 4v16m0 0-3-3m3 3 3-3M12 6h9M12 12h7M12 18h5" /></svg>;
}
export function SectionPage({
  section,
  articles,
  onOpen,
}: {
  section: Section;
  articles: SectionArticle[];
  onOpen: (title: string) => void;
}) {
  const [sortMode, setSortMode] = useState<"newest" | "alphabetical">("newest");
  const sortedArticles = useMemo(() => [...articles].sort((a, b) =>
    sortMode === "newest" ? b.date.localeCompare(a.date) : a.title.localeCompare(b.title, "zh-CN", { sensitivity: "base" })
  ), [articles, sortMode]);

  return <div className="section-page">
    <header className="section-hero">
      <div className="section-title">
        <h1>{section.label}</h1>
        <span>{section.description}</span>
      </div>
    </header>

    <div className="section-body">
      <div className="article-index-heading">
        <div className="article-index-title">
          <div className="article-index-copy">
            <h2>文章目录</h2>
            <span className="article-total"><strong>{articles.length}</strong><span>篇文章</span></span>
          </div>
        </div>
        <div className="article-sort" role="group" aria-label="文章排序方式">
          <button type="button" aria-label="按更新时间排序" title="按更新时间排序" aria-pressed={sortMode === "newest"} onClick={() => setSortMode("newest")}><SectionUiIcon name="recent" /></button>
          <button type="button" aria-label="按标题排序" title="按标题排序" aria-pressed={sortMode === "alphabetical"} onClick={() => setSortMode("alphabetical")}><SectionUiIcon name="alphabetical" /></button>
        </div>
      </div>
      <div className="article-grid">{sortedArticles.map((article, index) =>
        <button className={`article-card${index === 0 ? " article-card--featured" : ""}`} key={article.title} onClick={() => onOpen(article.title)}>
          <h3>{article.title}</h3>
          <p>{article.summary}</p>
          <span className="article-footer">
            <span className="article-tags">{article.tags.map((tag) => <b key={tag}>{tag}</b>)}</span>
            <span className="article-card-details">
              <span className="article-meta"><b>{article.date}</b><i>{article.read}</i></span>
              <span className="article-open-icon" aria-hidden="true">
                <img className="article-book-icon article-book-icon--closed" src={MINECRAFT_UI_ICONS.articleClosed} alt="" draggable={false} />
                <img className="article-book-icon article-book-icon--open" src={MINECRAFT_UI_ICONS.articleOpen} alt="" draggable={false} />
              </span>
            </span>
          </span>
        </button>)}</div>
    </div>
  </div>;
}
