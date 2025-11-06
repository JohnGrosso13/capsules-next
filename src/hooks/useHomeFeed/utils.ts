import { normalizePosts as domainNormalizePosts, resolveFeedPostMediaUrl } from "@/domain/feed";

import type { HomeFeedPost } from "./types";

export type FriendTarget = Record<string, unknown> | null;

export function formatFeedCount(value?: number | null): string {
  const count =
    typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

export function buildFriendTarget(post: HomeFeedPost): FriendTarget {
  const userId =
    post.owner_user_id ?? post.ownerUserId ?? post.author_user_id ?? post.authorUserId ?? null;
  const userKey =
    post.owner_user_key ?? post.ownerUserKey ?? post.author_user_key ?? post.authorUserKey ?? null;
  if (!userId && !userKey) return null;
  const target: Record<string, unknown> = {};
  if (userId) target.userId = userId;
  if (userKey) target.userKey = userKey;
  if (post.user_name ?? post.userName) {
    target.name = (post.user_name ?? post.userName) as string;
  }
  if (post.user_avatar ?? post.userAvatar) {
    target.avatar = (post.user_avatar ?? post.userAvatar) as string;
  }
  return target;
}

export function resolvePostMediaUrl(post: Pick<HomeFeedPost, "mediaUrl" | "attachments">): string | null {
  return resolveFeedPostMediaUrl(post);
}

export function normalizePosts(rawPosts: unknown[]): HomeFeedPost[] {
  return domainNormalizePosts(rawPosts) as HomeFeedPost[];
}
