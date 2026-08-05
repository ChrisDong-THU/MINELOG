import type { ContentState, FeedEntry, SearchDocument, Section, SectionArticle } from "./content-types";
import type { LocalArticleFile } from "./local-article-files";

export const EMPTY_CONTENT_STATE: ContentState = { articles: {}, markdown: {} };
function fallbackMarkdown(article: SectionArticle) {
  return article.summary ? `${article.summary}\n` : "";
}

export function articleMarkdownKey(articleId: string) {
  return articleId;
}

export function parseLegacyContent(raw: string | null): ContentState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const candidate = value as Partial<ContentState>;
    if (!candidate.articles || typeof candidate.articles !== "object") return null;
    if (!candidate.markdown || typeof candidate.markdown !== "object") return null;
    const hasPermanentIds = Object.values(candidate.articles).every((articles) => Array.isArray(articles)
      && articles.every((article) => article && typeof article === "object" && typeof (article as SectionArticle).id === "string"));
    return hasPermanentIds ? candidate as ContentState : null;
  } catch {
    return null;
  }
}

export function contentToLocalFiles(content: ContentState, migratedAt = Date.now()): LocalArticleFile[] {
  let order = 0;
  return Object.entries(content.articles).flatMap(([sectionId, articles]) => articles.map((article) => ({
    ...article,
    sectionId,
    markdown: content.markdown[articleMarkdownKey(article.id)] ?? fallbackMarkdown(article),
    updatedAt: article.updatedAt ?? new Date(migratedAt - order++ * 1000).toISOString(),
  })));
}

function articleUpdateKey(article: Pick<SectionArticle, "date" | "updatedAt">) {
  return article.updatedAt ?? article.date;
}

function uniqueArticles(articles: SectionArticle[]) {
  const latestById = new Map<string, SectionArticle>();
  for (const article of articles) {
    const current = latestById.get(article.id);
    if (!current || articleUpdateKey(article).localeCompare(articleUpdateKey(current)) > 0) {
      latestById.set(article.id, article);
    }
  }
  return Array.from(latestById.values());
}

export function contentFromLocalFiles(files: LocalArticleFile[]): ContentState {
  const articles: Record<string, SectionArticle[]> = {};
  const markdown: Record<string, string> = {};
  const articleIds = new Set<string>();
  for (const file of [...files].sort((a, b) => articleUpdateKey(b).localeCompare(articleUpdateKey(a)))) {
    if (articleIds.has(file.id)) continue;
    articleIds.add(file.id);
    const article: SectionArticle = {
      id: file.id,
      title: file.title,
      summary: file.summary,
      date: file.date,
      read: file.read,
      tags: file.tags,
      updatedAt: file.updatedAt,
    };
    (articles[file.sectionId] ??= []).push(article);
    if (typeof file.markdown === "string") markdown[articleMarkdownKey(file.id)] = file.markdown;
  }
  return { articles, markdown };
}

export function selectRecentFeedEntries(sections: Section[], articles: ContentState["articles"], limit = 10): FeedEntry[] {
  return sections
    .flatMap((section) => uniqueArticles(articles[section.id] ?? []).map((article) => ({ section, article })))
    .sort((a, b) => articleUpdateKey(b.article).localeCompare(articleUpdateKey(a.article)))
    .slice(0, limit)
    .map(({ section, article }) => [section.label, article.title, article.date, article.read, section.id, article.id] as FeedEntry);
}

export function createSearchDocuments(
  sections: Section[],
  articles: ContentState["articles"],
  markdown: ContentState["markdown"],
): SearchDocument[] {
  return sections.flatMap((section) => uniqueArticles(articles[section.id] ?? []).map((article) => ({
    sectionId: section.id,
    sectionLabel: section.label,
    sectionIcon: section.icon,
    article,
    markdown: markdown[articleMarkdownKey(article.id)] ?? fallbackMarkdown(article),
  })));
}

export function markdownForArticle(markdown: ContentState["markdown"], article: SectionArticle) {
  return markdown[articleMarkdownKey(article.id)] ?? fallbackMarkdown(article);
}