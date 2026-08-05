import type { Section } from "./content-types";

const ENDPOINT = "/api/sections";

async function responseJson<T>(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("线上板块存储服务不可用");
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "线上板块存储操作失败");
  return body;
}

export async function loadRemoteSections() {
  const response = await fetch(ENDPOINT, { cache: "no-store", credentials: "same-origin" });
  return responseJson<{ available: boolean; initialized?: boolean; sections: Section[] }>(response);
}

export async function saveRemoteSections(sections: Section[]) {
  const response = await fetch(ENDPOINT, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ sections }),
  });
  return responseJson<{ sections: Section[] }>(response);
}
