export type ComposerDraft = {
  kind: string;
  title?: string | null;
  content: string;
  mediaUrl: string | null;
  mediaPrompt: string | null;
  mediaThumbnailUrl?: string | null;
  mediaPlaybackUrl?: string | null;
  mediaDurationSeconds?: number | null;
  muxPlaybackId?: string | null;
  muxAssetId?: string | null;
  videoRunId?: string | null;
  videoRunStatus?: "pending" | "running" | "succeeded" | "failed" | null;
  videoRunError?: string | null;
  memoryId?: string | null;
  poll?: { question: string; options: string[]; thumbnails?: (string | null)[] | null } | null;
  suggestions?: string[];
};

export function ensurePollStructure(input: ComposerDraft | null): {
  question: string;
  options: string[];
  thumbnails: (string | null)[];
} {
  if (!input) return { question: "", options: ["", ""], thumbnails: [null, null] };
  const raw =
    input.poll && typeof input.poll === "object"
      ? { ...input.poll }
      : { question: "", options: [] as string[], thumbnails: [] as (string | null)[] };
  const question = typeof raw.question === "string" ? raw.question : "";
  let options = Array.isArray(raw.options) ? raw.options.map((value) => String(value ?? "")) : [];
  if (options.length < 2) {
    options = [...options, "", ""].slice(0, Math.max(2, options.length + 2));
  }
  const thumbnailsSource =
    Array.isArray((raw as { thumbnails?: unknown }).thumbnails) &&
    (raw as { thumbnails: unknown[] }).thumbnails.length
      ? (raw as { thumbnails: unknown[] }).thumbnails
      : [];
  const thumbnails: (string | null)[] = options.map((_, index) => {
    const rawThumb = thumbnailsSource[index];
    if (typeof rawThumb === "string" && rawThumb.trim().length) return rawThumb.trim();
    return null;
  });
  return { question, options, thumbnails };
}

export function isComposerDraftReady(draft: ComposerDraft | null): boolean {
  if (!draft) return false;
  const kind = (draft.kind ?? "text").toLowerCase();
  const pollStructure = draft.poll ? ensurePollStructure(draft) : null;
  const pollReady =
    pollStructure !== null &&
    (pollStructure.question.trim().length > 0 ||
      pollStructure.options.some((option) => option.trim().length > 0));

  if (kind === "poll") {
    return pollReady;
  }
  if (kind === "image" || kind === "video") {
    const mediaReady = Boolean(draft.mediaUrl && draft.mediaUrl.trim().length > 0);
    return mediaReady || pollReady;
  }
  const contentReady = draft.content.trim().length > 0;
  return contentReady || pollReady;
}
