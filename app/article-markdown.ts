import type { SectionArticle } from "./content-types";

export function getArticleMarkdown(article: SectionArticle) {
  return article.summary ? `${article.summary}\n` : "";
}
