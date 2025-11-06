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
import { getPostsSlim } from "@/server/posts/api";
import type { SlimResponse } from "@/server/posts/api";
import type { PostsQueryInput } from "@/server/posts/api";
import { ensureUserSession, resolveRequestOrigin } from "@/server/actions/session";

const FEED_LIMIT = 30;

type HomeFeedSlimBody = {
  posts: unknown[];
  deleted: string[];
  cursor?: string | null | undefined;
};

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

  let response: SlimResponse<HomeFeedSlimBody>;

  try {
    response = await getPostsSlim(request);
  } catch (error) {
    console.error("loadHomeFeedAction: getPostsSlim failed", error);
    const fallbackPosts = buildFallbackFeedPosts();
    const posts = normalizePosts(fallbackPosts);
    return {
      posts,
      cursor: null,
      hydrationKey: computeHydrationKey(posts, null),
    };
  }

  if (!response.ok) {
    console.error("loadHomeFeedAction: getPostsSlim returned error", {
      status: response.status,
      error: response.body.error,
      message: response.body.message,
    });
    const fallbackPosts = buildFallbackFeedPosts();
    const posts = normalizePosts(fallbackPosts);
    return {
      posts,
      cursor: null,
      hydrationKey: computeHydrationKey(posts, null),
    };
  }

  const rawPosts = response.body.posts ?? [];
  const cursor = response.body.cursor ?? null;
  const posts = normalizePosts(rawPosts);

  return {
    posts,
    cursor,
    hydrationKey: computeHydrationKey(posts, cursor),
  };
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
    const response = await getPostsSlim(request);
    if (!response.ok) {
      console.error("loadHomeFeedPageAction: getPostsSlim returned error", {
        status: response.status,
        error: response.body.error,
      });
      return { posts: [], cursor: null };
    }
    const posts = normalizePosts(response.body.posts ?? []);
    return {
      posts,
      cursor: response.body.cursor ?? null,
    };
  } catch (error) {
    console.error("loadHomeFeedPageAction: getPostsSlim failed", error);
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
    const response = await getPostsSlim(request);
    if (!response.ok) {
      throw new Error(response.body.message ?? "Failed to fetch feed");
    }
    return {
      posts: response.body.posts ?? [],
      cursor: response.body.cursor ?? null,
      deleted: response.body.deleted ?? [],
    };
  } catch (error) {
    console.error("fetchHomeFeedSliceAction failed", error);
    throw error;
  }
}
