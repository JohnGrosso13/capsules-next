"use server";

import {
  buildFallbackFeedPosts,
  normalizePosts,
  type FeedFetchOptions,
  type FeedFetchResult,
  type FeedPost,
  type FeedPage,
  type FeedSnapshot,
} from "@/domain/feed";
import { PostsQueryError, queryPosts } from "@/server/posts/services/posts-query";
import type { PostsQueryInput } from "@/server/posts/types";
import { ensureUserSession, resolveRequestOrigin } from "@/server/actions/session";

const FEED_LIMIT = 30;

function computeHydrationKey(posts: FeedPost[], cursor: string | null): string {
  if (cursor) return `cursor:${cursor}`;
  if (posts.length > 0) {
    const [first] = posts;
    if (first) {
      return `posts:${first.id}-${posts.length}`;
    }
  }
  return "posts:empty";
}

export async function loadHomeFeedAction(): Promise<FeedSnapshot> {
  const { supabaseUserId } = await ensureUserSession();
  const origin = await resolveRequestOrigin();

  const request: PostsQueryInput = {
    viewerId: supabaseUserId,
    origin,
    query: {
      limit: FEED_LIMIT,
    },
  };

  try {
    const result = await queryPosts(request);
    const rawPosts = result.posts ?? [];
    const cursor = result.cursor ?? null;
    const posts = normalizePosts(rawPosts);
    return {
      posts,
      cursor,
      hydrationKey: computeHydrationKey(posts, cursor),
    };
  } catch (error) {
    if (error instanceof PostsQueryError) {
      console.error("loadHomeFeedAction: posts query error", {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    } else {
      console.error("loadHomeFeedAction: posts query failed", error);
    }
    const fallbackPosts = buildFallbackFeedPosts();
    const posts = normalizePosts(fallbackPosts);
    return {
      posts,
      cursor: null,
      hydrationKey: computeHydrationKey(posts, null),
    };
  }
}

export async function loadHomeFeedPageAction(cursor: string | null): Promise<FeedPage> {
  const { supabaseUserId } = await ensureUserSession();
  const origin = await resolveRequestOrigin();

  const request: PostsQueryInput = {
    viewerId: supabaseUserId,
    origin,
    query: {
      limit: FEED_LIMIT,
      before: cursor ?? null,
    },
  };

  try {
    const result = await queryPosts(request);
    const posts = normalizePosts(result.posts ?? []);
    return {
      posts,
      cursor: result.cursor ?? null,
    };
  } catch (error) {
    if (error instanceof PostsQueryError) {
      console.error("loadHomeFeedPageAction: posts query error", {
        status: error.status,
        code: error.code,
      });
    } else {
      console.error("loadHomeFeedPageAction: posts query failed", error);
    }
    return { posts: [], cursor: null };
  }
}

export async function fetchHomeFeedSliceAction(
  options: FeedFetchOptions = {},
): Promise<FeedFetchResult> {
  const { supabaseUserId } = await ensureUserSession();
  const origin = await resolveRequestOrigin();

  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.trunc(options.limit))
      : FEED_LIMIT;

  const request: PostsQueryInput = {
    viewerId: supabaseUserId,
    origin,
    query: {
      limit,
      capsuleId: options.capsuleId ?? null,
      before: options.cursor ?? null,
    },
  };

  try {
    const result = await queryPosts(request);
    return {
      posts: result.posts ?? [],
      cursor: result.cursor ?? null,
      deleted: result.deleted ?? [],
    };
  } catch (error) {
    if (error instanceof PostsQueryError) {
      console.error("fetchHomeFeedSliceAction: posts query error", {
        status: error.status,
        code: error.code,
        message: error.message,
      });
    } else {
      console.error("fetchHomeFeedSliceAction failed", error);
    }
    throw error;
  }
}
