export type Section = {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  description: string;
};

export type FeedEntry = [source: string, title: string, date: string, readTime: string, sectionId?: string];
