const ASSET_ENDPOINT = "/api/local-assets";

export type LocalImageSource = File | string;

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取粘贴的图片"));
    reader.readAsDataURL(file);
  });
}

export async function saveLocalArticleImage(sectionId: string, source: LocalImageSource) {
  const image = typeof source === "string"
    ? source.startsWith("data:") ? { dataUrl: source } : { url: source }
    : { dataUrl: await fileDataUrl(source), name: source.name };
  const response = await fetch(ASSET_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sectionId, image }),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("本地图片文件服务未启用");
  const body = await response.json() as { url?: string; error?: string };
  if (!response.ok || !body.url) throw new Error(body.error ?? "图片保存失败");
  return body.url;
}
