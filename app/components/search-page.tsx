"use client";

import { useMemo, useRef } from "react";
import type { SearchDocument } from "../content-types";
import { MINECRAFT_UI_ICONS } from "../minecraft-icons";

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
}

function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_#>|~$\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type IndexedSearchDocument = {
  document: SearchDocument;
  title: string;
  author: string;
  summary: string;
  section: string;
  tags: string;
  body: string;
  normalizedBody: string;
  searchable: string;
};

function indexDocument(document: SearchDocument): IndexedSearchDocument {
  const title = normalize(document.article.title);
  const author = normalize(document.article.author);
  const summary = normalize(document.article.summary);
  const section = normalize(document.sectionLabel);
  const tags = normalize(document.article.tags.join(" "));
  const body = plainText(document.markdown);
  const normalizedBody = normalize(body);

  return {
    document,
    title,
    author,
    summary,
    section,
    tags,
    body,
    normalizedBody,
    searchable: [title, author, summary, section, tags, normalizedBody].join(" "),
  };
}

function excerpt(indexed: IndexedSearchDocument, term: string) {
  const { document, body, normalizedBody } = indexed;
  const summary = document.article.summary;
  if (!term || normalize(summary).includes(term)) return summary;
  const index = normalizedBody.indexOf(term);
  if (index < 0) return summary;
  const start = Math.max(0, index - 36);
  const end = Math.min(body.length, index + term.length + 72);
  return (start > 0 ? "\u2026" : "") + body.slice(start, end) + (end < body.length ? "\u2026" : "");
}

function highlight(text: string, query: string) {
  const term = query.trim().split(/\s+/)[0];
  if (!term) return text;
  const index = normalize(text).indexOf(normalize(term));
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark>{text.slice(index, index + term.length)}</mark>{text.slice(index + term.length)}</>;
}

export function SearchPage({
  query,
  documents,
  onQueryChange,
  onOpen,
}: {
  query: string;
  documents: SearchDocument[];
  onQueryChange: (query: string) => void;
  onOpen: (sectionId: string, articleId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalize(query);
  const indexedDocuments = useMemo(() => documents.map(indexDocument), [documents]);
  const terms = useMemo(() => normalizedQuery.split(/\s+/).filter(Boolean), [normalizedQuery]);
  const results = useMemo(() => {
    if (!terms.length) return [];
    return indexedDocuments
      .map((indexed) => {
        const { title, author, summary, section, tags, normalizedBody: body, searchable } = indexed;
        if (!terms.every((term) => searchable.includes(term))) return null;
        const score = terms.reduce((total, term) => total
          + (title === term ? 120 : title.startsWith(term) ? 70 : title.includes(term) ? 48 : 0)
          + (author.includes(term) ? 28 : 0)
          + (tags.includes(term) ? 24 : 0)
          + (section.includes(term) ? 16 : 0)
          + (summary.includes(term) ? 12 : 0)
          + (body.includes(term) ? 3 : 0), 0);
        return { indexed, score };
      })
      .filter((result): result is { indexed: IndexedSearchDocument; score: number } => result !== null)
      .sort((a, b) => b.score - a.score
        || b.indexed.document.article.date.localeCompare(a.indexed.document.article.date));
  }, [indexedDocuments, terms]);

  const suggestions = useMemo(() => {
    const tagCounts = new Map<string, { label: string; count: number }>();
    documents.forEach((document) => {
      const articleTags = new Set(document.article.tags.map((tag) => tag.trim()).filter(Boolean));
      articleTags.forEach((tag) => {
        const key = normalize(tag);
        const current = tagCounts.get(key);
        tagCounts.set(key, { label: current?.label ?? tag, count: (current?.count ?? 0) + 1 });
      });
    });
    return [...tagCounts.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN", { sensitivity: "base" }))
      .slice(0, 7)
      .map(({ label }) => label);
  }, [documents]);

  return <div className="search-page">
    <header className="section-hero search-hero">
      <div className="section-title">
        <h1>搜索我的日志</h1>
        <span>从标题、作者、摘要、标签与 Markdown 正文中定位需要的内容。</span>
      </div>
    </header>

    <div className="search-console">
      <label className="search-input-shell">
        <img src={MINECRAFT_UI_ICONS.search} alt="" />
        <input
          ref={inputRef}
          autoFocus
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="输入标题、标签、技术名词或正文片段…"
          aria-label="搜索全部文章"
        />
        {query && <button type="button" onClick={() => { onQueryChange(""); inputRef.current?.focus(); }} aria-label="清空搜索">×</button>}
      </label>
      <div className="search-console-meta">
        <span><b>{documents.length}</b> 篇文章已建立索引</span>
        {query && <span><b>{results.length}</b> 条匹配结果</span>}
      </div>
    </div>

    {!query && <section className="search-start">
      <div className="search-start-heading"><span>START SEARCH</span><h2>可以搜索什么？</h2></div>
      <div className="search-scope-grid">
        <article><b>01</b><strong>文章标题与摘要</strong><span>快速定位明确记得的主题和结论。</span></article>
        <article><b>02</b><strong>板块与文章标签</strong><span>跨板块聚合相同技术栈与研究方向。</span></article>
        <article><b>03</b><strong>Markdown 正文</strong><span>用代码名、概念或句子找到正文片段。</span></article>
      </div>
      <div className="search-suggestions"><span>常用标签</span>{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => onQueryChange(suggestion)}>{suggestion}</button>)}</div>
    </section>}

    {query && <section className="search-results" aria-live="polite">
      <div className="search-results-heading"><div><span>SEARCH RESULTS</span><h2>{results.length ? `找到 ${results.length} 篇文章` : "没有找到匹配内容"}</h2></div><small>按相关度排序</small></div>
      {results.length > 0 ? <div className="search-result-list">{results.map(({ indexed }) =>
        <button type="button" className="search-result-card" key={indexed.document.article.id} onClick={() => onOpen(indexed.document.sectionId, indexed.document.article.id)}>
          <span className="search-result-icon"><img src={indexed.document.sectionIcon} alt="" /></span>
          <span className="search-result-copy">
            <small>{indexed.document.sectionLabel} · {indexed.document.article.date} · {indexed.document.article.read}</small>
            <strong>{highlight(indexed.document.article.title, query)}</strong>
            <span>{highlight(excerpt(indexed, terms[0] ?? ""), query)}</span>
            <i>{indexed.document.article.tags.map((tag) => <b key={tag}>{tag}</b>)}</i>
          </span>
          <img className="search-result-arrow" src={MINECRAFT_UI_ICONS.back} alt="" />
        </button>)}</div> : <div className="search-empty">
        <img src={MINECRAFT_UI_ICONS.search} alt="" />
        <strong>这里暂时没有记录</strong>
        <span>尝试减少关键词，或改用板块名称与文章标签。</span>
        <button type="button" onClick={() => { onQueryChange(""); inputRef.current?.focus(); }}>重新搜索</button>
      </div>}
    </section>}
  </div>;
}
