"use client";

import { Children, isValidElement, useEffect, useMemo, type MouseEvent, type ReactNode } from "react";
import type { Section, SectionArticle } from "../content-types";
import { MINECRAFT_UI_ICONS } from "../minecraft-icons";
import { MarkdownRenderer } from "./markdown-renderer";

type ReaderSection = Pick<Section, "label" | "icon">;
type TocItem = { level: number; title: string; id: string; number: string };

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return Children.toArray(node).map(nodeText).join("");
}

function scrollToReaderHeading(id: string, behavior: ScrollBehavior = "smooth") {
  const target = document.getElementById(id);
  const viewport = target?.closest<HTMLElement>(".content-viewport");
  if (!target || !viewport) return;

  document.scrollingElement?.scrollTo({ top: 0, left: 0 });
  document.querySelector<HTMLElement>(".minecraft-shell")?.scrollTo({ top: 0, left: 0 });
  const top = viewport.scrollTop + target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 24;
  viewport.scrollTo({ top: Math.max(0, top), behavior });
}

function buildTableOfContents(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let sectionNumber = 0;
  let subsectionNumber = 0;

  for (const match of markdown.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    const level = match[1].length;
    const title = match[2].replace(/[*_`]/g, "");

    if (level === 2) {
      sectionNumber += 1;
      subsectionNumber = 0;
    } else {
      subsectionNumber += 1;
    }

    items.push({
      level,
      title,
      id: slugify(title),
      number: String(level === 2 ? sectionNumber : subsectionNumber),
    });
  }

  return items;
}

export function ArticleReader({ section, article, markdown, onBack }: { section: ReaderSection; article: SectionArticle; markdown: string; onBack: () => void }) {
  const toc = useMemo(() => buildTableOfContents(markdown), [markdown]);

  useEffect(() => {
    const syncHash = () => window.requestAnimationFrame(() => {
      document.scrollingElement?.scrollTo({ top: 0, left: 0 });
      document.querySelector<HTMLElement>(".minecraft-shell")?.scrollTo({ top: 0, left: 0 });
      const hash = window.location.hash.slice(1);
      if (hash) {
        try { scrollToReaderHeading(decodeURIComponent(hash), "auto"); } catch {}
      } else {
        document.querySelector<HTMLElement>(".content-viewport")?.scrollTo({ top: 0 });
      }
    });

    const frame = syncHash();
    window.addEventListener("popstate", syncHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("popstate", syncHash);
    };
  }, [article.title]);

  const navigateToHeading = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const url = window.location.pathname + window.location.search + "#" + encodeURIComponent(id);
    if (window.location.hash !== "#" + encodeURIComponent(id)) {
      const current = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
      window.history.pushState({ ...current, minelog: true, minelogDepth: Number(current.minelogDepth ?? 0) + 1 }, "", url);
    }
    scrollToReaderHeading(id);
  };
  const heading = (level: 2 | 3, children: ReactNode) => {
    const title = nodeText(children);
    const Tag = level === 2 ? "h2" : "h3";
    const id = slugify(title);
    return <Tag id={id}>{children}<a className="heading-anchor" onClick={(event) => navigateToHeading(event, id)} href={`#${id}`} aria-label={`定位到${title}`}>#</a></Tag>;
  };

  return <div className="reader-page">
    <header className="reader-header">
      <button className="reader-back" onClick={onBack}><img src={MINECRAFT_UI_ICONS.back} alt="" /><span>返回 {section.label}</span></button>
      <div className="reader-category"><img src={section.icon} alt="" /><span>{section.label}</span></div>
      <h1>{article.title}</h1>
      <p>{article.summary}</p>
    </header>

    <div className="reader-layout">
      <MarkdownRenderer
        markdown={markdown}
        components={{
          h2: ({ children }) => heading(2, children),
          h3: ({ children }) => heading(3, children),
        }}
      />

      <aside className="reader-sidebar" aria-label="文章信息与目录">
        <section className="reader-overview">
          <div className="reader-section-mark">
            <span className="reader-section-icon"><img src={section.icon} alt="" /></span>
            <span><small>KNOWLEDGE SECTOR</small><strong>{section.label}</strong></span>
          </div>
          <dl className="reader-details">
            <div><dt>更新时间</dt><dd>2026.{article.date}</dd></div>
            <div><dt>预计阅读</dt><dd>{article.read}</dd></div>
          </dl>
          <div className="reader-tags" aria-label="文章标签">{article.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>

        </section>

        {toc.length > 0 && <section className="reader-toc">
          <span>CONTENTS</span>
          <nav>{toc.map((item) => <a className={item.level === 3 ? "toc-sub" : ""} onClick={(event) => navigateToHeading(event, item.id)} href={`#${item.id}`} key={item.id}><span className="toc-number">{item.number}</span><span>{item.title}</span></a>)}</nav>
        </section>}
      </aside>
    </div>
  </div>;
}
