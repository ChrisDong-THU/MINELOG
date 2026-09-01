import type { SectionArticle } from "./content-types";
import { createTextPatch, textPatchSavesBytes, type VersionedTextPatch } from "../shared/text-patch.ts";

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

type ArticleSaveBase = Pick<LocalArticleFile, "markdown" | "updatedAt">;
type ArticleSavePayload = {
  article: Omit<LocalArticleFile, "markdown"> & { markdown?: string };
  cleanupAssetUrls: string[];
  baseUpdatedAt?: string;
  markdownPatch?: VersionedTextPatch;
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

export function buildArticleSavePayload(article: LocalArticleFile, cleanupAssetUrls: string[] = [], previous?: ArticleSaveBase): ArticleSavePayload {
  if (previous?.updatedAt) {
    const markdown = article.markdown ?? "";
    const patch = createTextPatch(previous.markdown ?? "", markdown);
    if (textPatchSavesBytes(patch, markdown)) {
      const metadata = { ...article };
      delete metadata.markdown;
      return {
        article: metadata,
        cleanupAssetUrls,
        baseUpdatedAt: previous.updatedAt,
        markdownPatch: { ...patch, baseUpdatedAt: previous.updatedAt },
      };
    }
  }
  return { article, cleanupAssetUrls, ...(previous?.updatedAt ? { baseUpdatedAt: previous.updatedAt } : {}) };
}

export async function saveLocalArticleFile(article: LocalArticleFile, cleanupAssetUrls: string[] = [], previous?: ArticleSaveBase) {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildArticleSavePayload(article, cleanupAssetUrls, previous)),
  });
  return (await responseJson<{ article: LocalArticleFile }>(response)).article;
}

export async function deleteLocalArticleFile(sectionId: string, articleId?: string) {
  const response = await fetch(ENDPOINT, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionId, id: articleId }),
  });
  return responseJson<{ deleted: number }>(response);
}
