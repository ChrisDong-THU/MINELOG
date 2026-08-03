"use client";

import { useMemo, useState } from "react";
import type { Section } from "../content-types";
import type { SectionArticle } from "../section-articles";

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
          <div><p>ARTICLE INDEX</p><h2>板块文章</h2></div>
          <span className="article-total"><strong>{String(articles.length).padStart(2, "0")}</strong> 篇文章</span>
        </div>
        <div className="article-sort" role="group" aria-label="文章排序方式">
          <button aria-pressed={sortMode === "newest"} onClick={() => setSortMode("newest")}>更新时间</button>
          <button aria-pressed={sortMode === "alphabetical"} onClick={() => setSortMode("alphabetical")}>首字母</button>
        </div>
      </div>
      <div className="article-grid">{sortedArticles.map((article) =>
        <button className="article-card" key={article.title} onClick={() => onOpen(article.title)}>
          <span className="article-meta"><b>{article.date}</b><i>{article.read}</i></span>
          <h3>{article.title}</h3>
          <p>{article.summary}</p>
          <span className="article-footer">
            <span>{article.tags.map((tag) => <b key={tag}>{tag}</b>)}</span>
            <img src="/minecraft/items/arrow.png" alt="" />
          </span>
        </button>)}</div>
    </div>
  </div>;
}
