export type Section = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  hotbarSlot?: number;
  description: string;
};

export type FeedEntry = [source: string, title: string, date: string, readTime: string, sectionId?: string];

export type SectionArticle = {
  title: string;
  summary: string;
  date: string;
  read: string;
  tags: string[];
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