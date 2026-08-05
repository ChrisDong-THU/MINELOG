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
export const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox";

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

export function imageResponseSecurityHeaders(fileName: string): Record<string, string> {
  return fileName.endsWith(".svg") ? { "content-security-policy": SVG_CONTENT_SECURITY_POLICY } : {};
}