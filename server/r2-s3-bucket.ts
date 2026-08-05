import { AwsClient } from "aws4fetch";
import type { R2BucketLike, R2StoredObject } from "../worker/r2-content";

export type R2S3Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint?: string;
};

function encodeObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function bodyValue(value: string | ArrayBuffer | ArrayBufferView | ReadableStream) {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return value as BodyInit;
}

export class R2S3Bucket implements R2BucketLike {
  private readonly client: AwsClient;
  private readonly baseUrl: string;

  constructor(config: R2S3Config) {
    this.client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: "auto",
      service: "s3",
    });
    const endpoint = (config.endpoint || `https://${config.accountId}.r2.cloudflarestorage.com`).replace(/\/$/, "");
    this.baseUrl = `${endpoint}/${encodeURIComponent(config.bucketName)}`;
  }

  private objectUrl(key: string) {
    return `${this.baseUrl}/${encodeObjectKey(key)}`;
  }

  private async signedFetch(key: string, init: RequestInit) {
    const response = await this.client.fetch(this.objectUrl(key), init);
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 S3 request failed (${response.status})`);
    }
    return response;
  }

  async get(key: string): Promise<R2StoredObject | null> {
    const response = await this.signedFetch(key, { method: "GET" });
    if (response.status === 404) return null;
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const contentType = response.headers.get("content-type") ?? undefined;
    const etag = response.headers.get("etag") ?? "";
    return {
      key,
      etag,
      size: bytes.byteLength,
      body: new Blob([bytes]).stream(),
      httpMetadata: { contentType },
      async text() { return new TextDecoder().decode(bytes); },
      async arrayBuffer() { return bytes.slice().buffer; },
    };
  }

  async head(key: string) {
    const response = await this.signedFetch(key, { method: "HEAD" });
    if (response.status === 404) return null;
    return {
      key,
      etag: response.headers.get("etag") ?? "",
      size: Number(response.headers.get("content-length") ?? 0),
      httpMetadata: { contentType: response.headers.get("content-type") ?? undefined },
    };
  }

  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    const headers = new Headers();
    if (options?.httpMetadata?.contentType) headers.set("content-type", options.httpMetadata.contentType);
    for (const [name, metadata] of Object.entries(options?.customMetadata ?? {})) {
      headers.set(`x-amz-meta-${name}`, metadata);
    }
    await this.signedFetch(key, { method: "PUT", headers, body: bodyValue(value) });
    return {};
  }

  async delete(keys: string | string[]) {
    await Promise.all((Array.isArray(keys) ? keys : [keys]).map(async (key) => {
      await this.signedFetch(key, { method: "DELETE" });
    }));
  }
}

export function r2S3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2S3Config | null {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) return null;
  return { accountId, accessKeyId, secretAccessKey, bucketName, endpoint: env.R2_ENDPOINT?.trim() || undefined };
}
