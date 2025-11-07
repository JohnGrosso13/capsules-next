import type {
  SummaryAttachmentInput,
  SummaryLengthHint,
  SummaryRequestMeta,
  SummaryTarget,
} from "@/types/summary";

export type SummarySignaturePayload = {
  target: SummaryTarget;
  capsuleId?: string | null;
  hint?: SummaryLengthHint | null;
  limit?: number | null;
  segments?: string[] | null;
  attachments?: SummaryAttachmentInput[] | null;
  meta?: SummaryRequestMeta | null;
};

type NormalizedAttachment = {
  id: string;
  name: string | null;
  url: string | null;
  mimeType: string | null;
  text: string | null;
  excerpt: string | null;
  thumbnailUrl: string | null;
};

type NormalizedMeta = {
  title: string | null;
  author: string | null;
  audience: string | null;
  capsuleId: string | null;
  timeframe: string | null;
};

type NormalizedPayload = {
  target: SummaryTarget;
  capsuleId: string | null;
  hint: SummaryLengthHint | null;
  limit: number | null;
  segments: string[];
  attachments: NormalizedAttachment[];
  meta: NormalizedMeta | null;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeSegments(segments?: string[] | null): string[] {
  if (!Array.isArray(segments) || !segments.length) return [];
  return segments.map((segment) =>
    typeof segment === "string" ? segment : "",
  );
}

function normalizeAttachments(attachments?: SummaryAttachmentInput[] | null): NormalizedAttachment[] {
  if (!Array.isArray(attachments) || !attachments.length) return [];
  return attachments.map((attachment) => ({
    id: typeof attachment.id === "string" ? attachment.id : "",
    name: normalizeString(attachment.name),
    url: normalizeString(attachment.url),
    mimeType: normalizeString(attachment.mimeType),
    text: normalizeString(attachment.text),
    excerpt: normalizeString(attachment.excerpt),
    thumbnailUrl: normalizeString(attachment.thumbnailUrl),
  }));
}

function normalizeMeta(meta?: SummaryRequestMeta | null): NormalizedMeta | null {
  if (!meta || typeof meta !== "object") return null;
  return {
    title: normalizeString(meta.title),
    author: normalizeString(meta.author),
    audience: normalizeString(meta.audience),
    capsuleId: normalizeString(meta.capsuleId),
    timeframe: normalizeString(meta.timeframe),
  };
}

function normalizePayload(payload: SummarySignaturePayload): NormalizedPayload {
  return {
    target: payload.target,
    capsuleId: normalizeString(payload.capsuleId) ?? null,
    hint: payload.hint ?? null,
    limit: typeof payload.limit === "number" && Number.isFinite(payload.limit) ? payload.limit : null,
    segments: normalizeSegments(payload.segments ?? null),
    attachments: normalizeAttachments(payload.attachments ?? null),
    meta: normalizeMeta(payload.meta ?? null),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function hashString(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0; // force int32
  }
  const unsigned = hash >>> 0;
  return `v1_${unsigned.toString(16)}_${value.length.toString(16)}`;
}

export function buildSummarySignature(payload: SummarySignaturePayload): string {
  const normalized = normalizePayload(payload);
  const serialized = stableStringify(normalized);
  return hashString(serialized);
}
