export type AppRoute =
  | { view: "home" }
  | { view: "search"; query?: string }
  | { view: "more" }
  | { view: "section"; sectionId: string }
  | { view: "reader"; sectionId: string; articleId: string }
  | { view: "editor"; sectionId: string; mode: "new" }
  | { view: "editor"; sectionId: string; mode: "edit"; articleId: string };

export function readAppRoute(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const sectionId = params.get("section");
  const articleId = params.get("article");
  const editor = params.get("editor");
  if (params.get("view") === "search") return { view: "search", query: params.get("q") ?? undefined };
  if (sectionId && editor === "new") return { view: "editor", sectionId, mode: "new" };
  if (sectionId && articleId && editor === "edit") return { view: "editor", sectionId, mode: "edit", articleId };
  if (sectionId && articleId) return { view: "reader", sectionId, articleId };
  if (sectionId) return { view: "section", sectionId };
  if (params.get("view") === "more") return { view: "more" };
  return { view: "home" };
}

export function appRouteUrl(route: AppRoute) {
  const params = new URLSearchParams();
  if (route.view === "more") params.set("view", "more");
  if (route.view === "search") {
    params.set("view", "search");
    if (route.query) params.set("q", route.query);
  }
  if (route.view === "section") params.set("section", route.sectionId);
  if (route.view === "reader") {
    params.set("section", route.sectionId);
    params.set("article", route.articleId);
  }
  if (route.view === "editor") {
    params.set("section", route.sectionId);
    params.set("editor", route.mode);
    if (route.mode === "edit") params.set("article", route.articleId);
  }
  const query = params.toString();
  return window.location.pathname + (query ? `?${query}` : "");
}

export function writeAppRoute(route: AppRoute, mode: "push" | "replace" = "push") {
  const current = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
  const depth = Number(current.minelogDepth ?? 0);
  const state = { ...current, minelog: true, minelogDepth: mode === "push" ? depth + 1 : depth };
  if (mode === "push") window.history.pushState(state, "", appRouteUrl(route));
  else window.history.replaceState(state, "", appRouteUrl(route));
}