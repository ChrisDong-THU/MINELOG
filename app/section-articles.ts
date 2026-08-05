export type SectionArticle = {
  title: string;
  summary: string;
  date: string;
  read: string;
  tags: string[];
};

export const SECTION_ARTICLES: Record<string, SectionArticle[]> = {};
