import type { SectionArticle } from "./content-types";

const ENDPOINT = "/api/local-articles";

export type LocalArticleFile = SectionArticle & {
  sectionId: string;
  markdown?: string;
};

type ListResponse = {
  available: boolean;
  initialized: boolean;
  articles: LocalArticleFile[];
};

async function responseJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("本地文章文件服务未启用");
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "本地文章文件操作失败");
  return body;
}

export async function listLocalArticleFiles(): Promise<ListResponse> {
  const response = await fetch(ENDPOINT, { cache: "no-store" });
  return responseJson<ListResponse>(response);
}

export async function loadLocalArticleFile(articleId: string) {
  const params = new URLSearchParams({ id: articleId });
  const response = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store" });
  return responseJson<{ article: LocalArticleFile }>(response);
}

export async function initializeLocalArticleFiles(articles: LocalArticleFile[]): Promise<ListResponse> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ articles }),
  });
  return responseJson<ListResponse>(response);
}

export async function saveLocalArticleFile(article: LocalArticleFile) {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ article }),
  });
  return responseJson<{ article: LocalArticleFile }>(response);
}

export async function deleteLocalArticleFile(sectionId: string, articleId?: string) {
  const response = await fetch(ENDPOINT, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionId, id: articleId }),
  });
  return responseJson<{ deleted: number }>(response);
}