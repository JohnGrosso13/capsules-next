import {
  buildFallbackFeedPosts,
  normalizeFeedPosts,
  type FeedPost,
} from "@/domain/feed";
import { normalizeMediaUrl } from "@/lib/media";

import type { NormalizedAttachment } from "./media";

type FeedRow = Record<string, unknown>;

function resolveTimestamp(row: FeedRow): string {
  const createdAt = row["created_at"];
  const updatedAt = row["updated_at"];
  if (typeof createdAt === "string" && createdAt.trim().length) return createdAt;
  if (typeof updatedAt === "string" && updatedAt.trim().length) return updatedAt;
  return new Date().toISOString();
}

export type NormalizedPost = FeedPost & {
  kind: string;
  mediaPrompt: string | null;
  capsuleId: string | null;
  tags?: string[];
  hotScore?: number;
  rankScore?: number;
  source: string;
  ts: string;
  attachments?: NormalizedAttachment[];
};

export function normalizePost(row: FeedRow): NormalizedPost {
  const [feedPost = {} as FeedPost] = normalizeFeedPosts([row]);

  const mediaPrompt =
    typeof row["media_prompt"] === "string"
      ? (row["media_prompt"] as string)
      : typeof row["mediaPrompt"] === "string"
        ? (row["mediaPrompt"] as string)
        : null;

  const capsuleId =
    typeof row["capsule_id"] === "string"
      ? (row["capsule_id"] as string)
      : typeof row["capsuleId"] === "string"
        ? (row["capsuleId"] as string)
        : null;

  const tags = Array.isArray(row["tags"]) ? (row["tags"] as string[]) : undefined;
  const hotScore = typeof row["hot_score"] === "number" ? (row["hot_score"] as number) : undefined;
  const rankScore =
    typeof row["rank_score"] === "number" ? (row["rank_score"] as number) : undefined;

  const sourceRaw = row["source"];
  const source =
    typeof sourceRaw === "string" && sourceRaw.trim().length ? sourceRaw.trim() : "web";

  const normalized: NormalizedPost = {
    ...feedPost,
    kind: typeof row["kind"] === "string" ? (row["kind"] as string) : "text",
    mediaPrompt,
    capsuleId,
    tags,
    hotScore,
    rankScore,
    source,
    ts: resolveTimestamp(row),
  };

  if (normalized.mediaUrl) {
    normalized.mediaUrl = normalizeMediaUrl(normalized.mediaUrl) ?? normalized.mediaUrl;
  }

  return normalized;
}

export function buildFallbackPosts(): NormalizedPost[] {
  const seeds = buildFallbackFeedPosts();
  const now = Date.now();

  return seeds.map((post, index) => ({
    ...post,
    kind: "text",
    mediaPrompt: null,
    capsuleId: null,
    tags: ["demo"],
    hotScore: 0,
    rankScore: 0,
    source: "demo",
    ts: post.created_at ?? new Date(now - index * 90_000).toISOString(),
    attachments: post.attachments ?? [],
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
