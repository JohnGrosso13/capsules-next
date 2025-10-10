import { normalizeMediaUrl } from "@/lib/media";

import type { NormalizedAttachment } from "./media";

export function normalizePost(row: Record<string, unknown>) {
  const dbId =
    typeof row.id === "string" || typeof row.id === "number" ? String(row.id) : undefined;

  return {
    id: (row.client_id ?? row.id) as string,
    dbId,
    kind: (row.kind as string) ?? "text",
    content: (row.content as string) ?? "",
    mediaUrl:
      normalizeMediaUrl(row["media_url"]) ??
      normalizeMediaUrl((row as Record<string, unknown>)["mediaUrl"]) ??
      null,
    mediaPrompt: ((row.media_prompt as string) ?? null) as string | null,
    userName: ((row.user_name as string) ?? null) as string | null,
    userAvatar: ((row.user_avatar as string) ?? null) as string | null,
    capsuleId: ((row.capsule_id as string) ?? null) as string | null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : undefined,
    likes: typeof row.likes_count === "number" ? row.likes_count : 0,
    comments: typeof row.comments_count === "number" ? row.comments_count : undefined,
    hotScore: typeof row.hot_score === "number" ? row.hot_score : undefined,
    rankScore: typeof row.rank_score === "number" ? row.rank_score : undefined,
    ts: String(
      (row.created_at as string) ?? (row.updated_at as string) ?? new Date().toISOString(),
    ),
    source: String((row.source as string) ?? "web"),
    ownerUserId: ((row.author_user_id as string) ?? null) as string | null,
    viewerLiked:
      typeof row["viewer_liked"] === "boolean" ? (row["viewer_liked"] as boolean) : false,
    viewerRemembered:
      typeof row["viewer_remembered"] === "boolean"
        ? (row["viewer_remembered"] as boolean)
        : false,
  };
}

export type NormalizedPost = ReturnType<typeof normalizePost> & {
  attachments?: NormalizedAttachment[];
};

const FALLBACK_POST_SEEDS: Array<Omit<NormalizedPost, "ts">> = [
  {
    id: "demo-welcome",
    dbId: "demo-welcome",
    kind: "text",
    content:
      "Welcome to Capsules! Connect your Supabase project to see real posts here. This demo post is only shown locally when the data source is offline.",
    mediaUrl: null,
    mediaPrompt: null,
    userName: "Capsules Demo Bot",
    userAvatar: null,
    capsuleId: null,
    tags: ["demo"],
    likes: 12,
    comments: 2,
    hotScore: 0,
    rankScore: 0,
    source: "demo",
    ownerUserId: null,
    viewerLiked: false,
    viewerRemembered: false,
    attachments: [],
  },
  {
    id: "demo-prompt-ideas",
    dbId: "demo-prompt-ideas",
    kind: "text",
    content:
      "Tip: Use the Generate button to draft a welcome message or poll. Once Supabase is configured you'll see the real-time feed here.",
    mediaUrl: null,
    mediaPrompt: null,
    userName: "Capsules Tips",
    userAvatar: null,
    capsuleId: null,
    tags: ["demo", "tips"],
    likes: 4,
    comments: 0,
    hotScore: 0,
    rankScore: 0,
    source: "demo",
    ownerUserId: null,
    viewerLiked: false,
    viewerRemembered: false,
    attachments: [],
  },
];

export function buildFallbackPosts(): NormalizedPost[] {
  const now = Date.now();
  return FALLBACK_POST_SEEDS.map((seed, index) => ({
    ...seed,
    ts: new Date(now - index * 90_000).toISOString(),
  }));
}

export function extractErrorMessage(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message ?? error.toString();
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
    const nested = (error as { error?: { message?: unknown } }).error?.message;
    if (typeof nested === "string") return nested;
  }
  return "";
}

export function shouldReturnFallback(error: unknown): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const message = extractErrorMessage(error).toLowerCase();
  if (!message) return false;
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("econnrefused") ||
    message.includes("timed out") ||
    message.includes("network")
  );
}
