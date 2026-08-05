import { getArticleMarkdown } from "./article-markdown";
import type { ContentState, FeedEntry, SearchDocument, Section, SectionArticle } from "./content-types";
import type { LocalArticleFile } from "./local-article-files";

export const EMPTY_CONTENT_STATE: ContentState = { articles: {}, markdown: {} };

export function articleMarkdownKey(sectionId: string, title: string) {
  return `${sectionId}:${title}`;
}

export function parseLegacyContent(raw: string | null): ContentState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<ContentState>;
    if (!candidate.articles || typeof candidate.articles !== "object") return null;
    if (!candidate.markdown || typeof candidate.markdown !== "object") return null;
    return candidate as ContentState;
  } catch {
    return null;
  }
}

export function contentToLocalFiles(content: ContentState, migratedAt = Date.now()): LocalArticleFile[] {
  let order = 0;
  return Object.entries(content.articles).flatMap(([sectionId, articles]) => articles.map((article) => ({
    ...article,
    sectionId,
    markdown: content.markdown[articleMarkdownKey(sectionId, article.title)] ?? getArticleMarkdown(article),
    updatedAt: new Date(migratedAt - order++ * 1000).toISOString(),
  })));
}

export function contentFromLocalFiles(files: LocalArticleFile[]): ContentState {
  const articles: Record<string, SectionArticle[]> = {};
  const markdown: Record<string, string> = {};
  for (const file of files) {
    const article: SectionArticle = {
      title: file.title,
      summary: file.summary,
      date: file.date,
      read: file.read,
      tags: file.tags,
    };
    (articles[file.sectionId] ??= []).push(article);
    if (typeof file.markdown === "string") markdown[articleMarkdownKey(file.sectionId, file.title)] = file.markdown;
  }
  return { articles, markdown };
}

export function selectRecentFeedEntries(sections: Section[], articles: ContentState["articles"], limit = 10): FeedEntry[] {
  return sections
    .flatMap((section) => (articles[section.id] ?? []).map((article) => [section.label, article.title, article.date, article.read, section.id] as FeedEntry))
    .sort((a, b) => b[2].localeCompare(a[2]))
    .slice(0, limit);
}

export function createSearchDocuments(
  sections: Section[],
  articles: ContentState["articles"],
  markdown: ContentState["markdown"],
): SearchDocument[] {
  return sections.flatMap((section) => (articles[section.id] ?? []).map((article) => ({
    sectionId: section.id,
    sectionLabel: section.label,
    sectionIcon: section.icon,
    article,
    markdown: markdown[articleMarkdownKey(section.id, article.title)] ?? getArticleMarkdown(article),
  })));
}

export function markdownForArticle(markdown: ContentState["markdown"], sectionId: string, article: SectionArticle) {
  return markdown[articleMarkdownKey(sectionId, article.title)] ?? getArticleMarkdown(article);
}
