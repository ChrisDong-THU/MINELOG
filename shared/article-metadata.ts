export const DEFAULT_ARTICLE_AUTHOR = "未署名";

export function articleAuthor(value: unknown) {
  if (typeof value !== "string") return DEFAULT_ARTICLE_AUTHOR;
  return value.trim() || DEFAULT_ARTICLE_AUTHOR;
}
