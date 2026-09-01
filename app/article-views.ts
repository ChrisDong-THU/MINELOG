const ARTICLE_VIEWS_ENDPOINT = "/api/article-views";
const SESSION_KEY_PREFIX = "minelog:article-view:";
const pendingViews = new Map<string, Promise<number>>();

function viewCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function formatArticleViews(views: number) {
  return views > 999 ? "999+" : String(views);
}

async function requestArticleView(articleId: string) {
  const sessionKey = `${SESSION_KEY_PREFIX}${articleId}`;
  let counted = false;
  try {
    counted = window.sessionStorage.getItem(sessionKey) === "1";
  } catch {
    // View counting still works when session storage is unavailable.
  }

  const response = await fetch(`${ARTICLE_VIEWS_ENDPOINT}?${new URLSearchParams({ id: articleId })}`, {
    method: counted ? "GET" : "POST",
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("阅读次数暂时不可用");
  const body = await response.json() as { views?: unknown };
  const views = viewCount(body.views);
  if (views === null) throw new Error("阅读次数数据格式不正确");

  if (!counted) {
    try { window.sessionStorage.setItem(sessionKey, "1"); } catch {}
  }
  return views;
}

export function recordArticleView(articleId: string) {
  const pending = pendingViews.get(articleId);
  if (pending) return pending;
  const request = requestArticleView(articleId).finally(() => pendingViews.delete(articleId));
  pendingViews.set(articleId, request);
  return request;
}
