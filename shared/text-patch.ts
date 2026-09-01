export type TextPatch = {
  start: number;
  deleteCount: number;
  insert: string;
};

export type VersionedTextPatch = TextPatch & {
  baseUpdatedAt: string;
};

const encoder = new TextEncoder();

function validOffset(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function createTextPatch(before: string, after: string): TextPatch {
  let start = 0;
  const sharedLimit = Math.min(before.length, after.length);
  while (start < sharedLimit && before[start] === after[start]) start += 1;

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (beforeEnd > start && afterEnd > start && before[beforeEnd - 1] === after[afterEnd - 1]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    start,
    deleteCount: beforeEnd - start,
    insert: after.slice(start, afterEnd),
  };
}

export function applyTextPatch(source: string, patch: TextPatch) {
  if (!validOffset(patch.start) || !validOffset(patch.deleteCount) || typeof patch.insert !== "string") {
    throw new Error("文本补丁格式不正确");
  }
  if (patch.start > source.length || patch.start + patch.deleteCount > source.length) {
    throw new Error("文本补丁越界");
  }
  return source.slice(0, patch.start) + patch.insert + source.slice(patch.start + patch.deleteCount);
}

export function textPatchSavesBytes(patch: TextPatch, completeText: string) {
  const patchBytes = encoder.encode(JSON.stringify(patch)).byteLength;
  const completeBytes = encoder.encode(JSON.stringify(completeText)).byteLength;
  return patchBytes + 32 < completeBytes;
}

export function normalizeVersionedTextPatch(value: unknown): VersionedTextPatch {
  if (!value || typeof value !== "object") throw new Error("文章正文补丁格式不正确");
  const candidate = value as Record<string, unknown>;
  if (!validOffset(candidate.start) || !validOffset(candidate.deleteCount) || typeof candidate.insert !== "string") {
    throw new Error("文章正文补丁格式不正确");
  }
  if (encoder.encode(candidate.insert).byteLength > 3 * 1024 * 1024) throw new Error("文章正文补丁过大");
  if (typeof candidate.baseUpdatedAt !== "string" || !candidate.baseUpdatedAt || candidate.baseUpdatedAt.length > 80) {
    throw new Error("文章正文补丁基准版本不正确");
  }
  return {
    start: candidate.start,
    deleteCount: candidate.deleteCount,
    insert: candidate.insert,
    baseUpdatedAt: candidate.baseUpdatedAt,
  };
}
