export type Section = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  hotbarSlot?: number;
  description: string;
};

export type FeedEntry = [source: string, title: string, date: string, readTime: string, sectionId?: string, articleId?: string];

export type SectionArticle = {
  id: string;
  title: string;
  summary: string;
  date: string;
  read: string;
  tags: string[];
  updatedAt?: string;
};

export type ContentState = {
  articles: Record<string, SectionArticle[]>;
  markdown: Record<string, string>;
};

export type SearchDocument = {
  sectionId: string;
  sectionLabel: string;
  sectionIcon: string;
  article: SectionArticle;
  markdown: string;
};