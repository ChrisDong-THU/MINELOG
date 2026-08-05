const ASSET_ENDPOINT = "/api/local-assets";

export type LocalImageSource = File | string;

const LOCAL_ASSET_RENDER_VERSION = "2";

export function versionLocalArticleImageUrl(source: string) {
  if (!source.startsWith(`${ASSET_ENDPOINT}/`)) return source;
  const fragmentIndex = source.indexOf("#");
  const base = fragmentIndex === -1 ? source : source.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? "" : source.slice(fragmentIndex);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}local-asset-v=${LOCAL_ASSET_RENDER_VERSION}${fragment}`;
}

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取粘贴的图片"));
    reader.readAsDataURL(file);
  });
}

export async function saveLocalArticleImage(source: LocalImageSource) {
  const image = typeof source === "string"
    ? source.startsWith("data:") ? { dataUrl: source } : { url: source }
    : { dataUrl: await fileDataUrl(source), name: source.name };
  const response = await fetch(ASSET_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("本地图片文件服务未启用");
  const body = await response.json() as { url?: string; error?: string };
  if (!response.ok || !body.url) throw new Error(body.error ?? "图片保存失败");
  return body.url;
}
