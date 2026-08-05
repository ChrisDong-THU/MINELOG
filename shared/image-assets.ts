export const IMAGE_TYPE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
};

const IMAGE_EXTENSION_TYPES = Object.fromEntries(
  Object.entries(IMAGE_TYPE_EXTENSIONS).map(([mime, extension]) => [extension, mime]),
) as Readonly<Record<string, string>>;

export const STORED_IMAGE_FILE_PATTERN = /^[a-f0-9]{24}\.(png|jpg|gif|webp|avif|bmp|svg|ico)$/;

const STORED_IMAGE_URL_PATTERN = /\/api\/local-assets\/([a-f0-9]{24}\.(?:png|jpg|gif|webp|avif|bmp|svg|ico))(?:[?#][^\s)]*)?/g;
const EXACT_STORED_IMAGE_URL_PATTERN = /^\/api\/local-assets\/([a-f0-9]{24}\.(?:png|jpg|gif|webp|avif|bmp|svg|ico))(?:[?#][^\s)]*)?$/;
const STORED_IMAGE_ASSET_KEY_PATTERN = /^assets\/([a-f0-9]{24}\.(?:png|jpg|gif|webp|avif|bmp|svg|ico))$/;

export const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

export function storedImageAssetKey(fileName: string) {
  return `assets/${fileName}`;
}

export function storedImageAssetFileName(assetKey: string) {
  return STORED_IMAGE_ASSET_KEY_PATTERN.exec(assetKey)?.[1] ?? null;
}

export function imageAssetKeysFromMarkdown(markdown: string) {
  const keys = new Set<string>();
  for (const match of markdown.matchAll(STORED_IMAGE_URL_PATTERN)) keys.add(storedImageAssetKey(match[1]));
  return [...keys];
}

export function imageAssetKeyFromUrl(url: string) {
  const match = EXACT_STORED_IMAGE_URL_PATTERN.exec(url);
  return match ? storedImageAssetKey(match[1]) : null;
}

export function imageAssetReferenceCounts(assetKeyGroups: Iterable<Iterable<string>>) {
  const counts = new Map<string, number>();
  for (const keys of assetKeyGroups) {
    for (const key of new Set(keys)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function normalizeImageMime(value: string | null) {
  const mime = (value ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!IMAGE_TYPE_EXTENSIONS[mime]) throw new Error("仅支持 PNG、JPEG、GIF、WebP、AVIF、BMP、SVG 和 ICO 图片");
  return mime;
}

export function imageExtensionForMime(mime: string) {
  return IMAGE_TYPE_EXTENSIONS[mime];
}

export function imageMimeForExtension(extension: string) {
  return IMAGE_EXTENSION_TYPES[extension] ?? "application/octet-stream";
}

export function imageMimeForStoredFile(fileName: string) {
  if (!STORED_IMAGE_FILE_PATTERN.test(fileName)) throw new Error("图片文件名不合法");
  return imageMimeForExtension(fileName.slice(fileName.lastIndexOf(".") + 1));
}

export function imageResponseSecurityHeaders(fileName: string): Record<string, string> {
  return fileName.endsWith(".svg") ? { "content-security-policy": SVG_CONTENT_SECURITY_POLICY } : {};
}
