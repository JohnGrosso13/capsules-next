"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";
import type { FeedFetchOptions } from "@/domain/feed";
import { fetchHomeFeedSliceAction, loadHomeFeedPageAction } from "@/server/actions/home-feed";

import type { HomeFeedPost } from "./useHomeFeed/types";
import {
  createHomeFeedStore,
  homeFeedStore,
  type HomeFeedHydrationSnapshot,
  type HomeFeedStore,
} from "./useHomeFeed/homeFeedStore";
import { formatExactTime, formatTimeAgo } from "./useHomeFeed/time";
import { formatFeedCount } from "./useHomeFeed/utils";

export { formatFeedCount } from "./useHomeFeed/utils";
export type { HomeFeedAttachment, HomeFeedPost } from "./useHomeFeed/types";

const FEED_LIMIT = 30;
const MESSAGE_TIMEOUT_MS = 4_000;

type FeedSnapshot = ReturnType<HomeFeedStore["getState"]>;

function useFeedData(store: HomeFeedStore): FeedSnapshot {
  const subscribe = React.useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getState = React.useCallback(() => store.getState(), [store]);
  return React.useSyncExternalStore(subscribe, getState, getState);
}

function useFeedActions(store: HomeFeedStore, canRemember: boolean) {
  const {
    refresh,
    toggleLike,
    toggleMemory,
    requestFriend,
    removeFriend,
    followUser,
    unfollowUser,
    deletePost,
    setActiveFriendTarget,
    clearFriendMessage,
    appendPosts,
    setLoadingMore,
    hydrate,
  } = store.actions;
  const getState = store.getState;

  return React.useMemo(() => {
    const refreshPosts = (signal?: AbortSignal) => {
      const options: FeedFetchOptions = { limit: FEED_LIMIT };
      if (signal) options.signal = signal;
      return refresh(options);
    };
    const handleToggleLike = (postId: string) => toggleLike(postId);
    const handleToggleMemory = (post: HomeFeedPost, desired?: boolean) => {
      const options: { canRemember: boolean; desired?: boolean } = { canRemember };
      if (typeof desired === "boolean") options.desired = desired;
      return toggleMemory(post.id, options);
    };
    const handleFriendRequest = (post: HomeFeedPost, identifier: string) =>
      requestFriend(post.id, identifier);
    const handleFriendRemove = (post: HomeFeedPost, identifier: string) =>
      removeFriend(post.id, identifier);
    const handleFollowUser = (post: HomeFeedPost, identifier: string) =>
      followUser(post.id, identifier);
    const handleUnfollowUser = (post: HomeFeedPost, identifier: string) =>
      unfollowUser(post.id, identifier);
    const handleDelete = (postId: string) => deletePost(postId);
    const setActiveFriendTargetSafe = (next: React.SetStateAction<string | null>) => {
      const current = getState().activeFriendTarget;
      const value =
        typeof next === "function"
          ? (next as (prev: string | null) => string | null)(current)
          : next;
      setActiveFriendTarget(value);
    };

    return {
      refreshPosts,
      handleToggleLike,
      handleToggleMemory,
      handleFriendRequest,
      handleFriendRemove,
      handleFollowUser,
      handleUnfollowUser,
      handleDelete,
      setActiveFriendTarget: setActiveFriendTargetSafe,
      clearFriendMessage,
      appendPosts: (posts: HomeFeedPost[], cursor: string | null) =>
        appendPosts(posts, cursor),
      setLoadingMore: (value: boolean) => setLoadingMore(value),
      hydrate,
    } satisfies {
      refreshPosts: (signal?: AbortSignal) => Promise<void>;
      handleToggleLike: (postId: string) => Promise<void>;
      handleToggleMemory: (post: HomeFeedPost, desired?: boolean) => Promise<boolean>;
      handleFriendRequest: (post: HomeFeedPost, identifier: string) => Promise<void>;
      handleFriendRemove: (post: HomeFeedPost, identifier: string) => Promise<void>;
      handleFollowUser: (post: HomeFeedPost, identifier: string) => Promise<void>;
      handleUnfollowUser: (post: HomeFeedPost, identifier: string) => Promise<void>;
      handleDelete: (postId: string) => Promise<void>;
      setActiveFriendTarget: (next: React.SetStateAction<string | null>) => void;
      clearFriendMessage: () => void;
      appendPosts: (posts: HomeFeedPost[], cursor: string | null) => void;
      setLoadingMore: (value: boolean) => void;
      hydrate: (snapshot: HomeFeedHydrationSnapshot) => void;
    };
  }, [
    canRemember,
    deletePost,
    getState,
    hydrate,
    refresh,
    removeFriend,
    followUser,
    unfollowUser,
    requestFriend,
    setActiveFriendTarget,
    toggleLike,
    toggleMemory,
    clearFriendMessage,
    appendPosts,
    setLoadingMore,
  ]);
}

type InitialFeedData = {
  posts: HomeFeedPost[];
  cursor?: string | null;
  hasFetched?: boolean;
  friendMessage?: string | null;
};

type UseFeedOptions = {
  refreshKey?: unknown;
  refreshEnabled?: boolean;
  initialData?: InitialFeedData | null;
  hydrationKey?: string | null;
  skipInitialRefresh?: boolean;
};

function useFeed(store: HomeFeedStore, options: UseFeedOptions = {}) {
  const {
    refreshKey,
    refreshEnabled = true,
    initialData = null,
    hydrationKey = null,
    skipInitialRefresh = false,
  } = options;
  const { user } = useCurrentUser();
  const canRemember = Boolean(user);

  const state = useFeedData(store);
  const actions = useFeedActions(store, canRemember);
  const [isLoadMorePending, startLoadMore] = React.useTransition();
  const hydratedRef = React.useRef<string | null>(null);
  const initialRefreshHandledRef = React.useRef(false);

  React.useEffect(() => {
    if (!initialData) return;
    const key = hydrationKey ?? "__default__";
    if (hydratedRef.current === key) return;
    actions.hydrate({
      posts: initialData.posts,
      cursor: initialData.cursor ?? null,
      hasFetched: initialData.hasFetched ?? true,
      friendMessage: initialData.friendMessage ?? null,
    });
    hydratedRef.current = key;
  }, [actions, initialData, hydrationKey]);

  React.useEffect(() => {
    if (!refreshEnabled) return undefined;
    if (skipInitialRefresh && !initialRefreshHandledRef.current) {
      initialRefreshHandledRef.current = true;
      return undefined;
    }
    initialRefreshHandledRef.current = true;
    const controller = new AbortController();
    void actions.refreshPosts(controller.signal);
    return () => controller.abort();
  }, [actions, refreshEnabled, refreshKey, skipInitialRefresh]);

  React.useEffect(() => {
    if (!refreshEnabled) return undefined;
    const handleRefresh = () => {
      void actions.refreshPosts();
    };
    window.addEventListener("posts:refresh", handleRefresh);
    return () => {
      window.removeEventListener("posts:refresh", handleRefresh);
    };
  }, [actions, refreshEnabled]);

  React.useEffect(() => {
    if (!state.friendMessage) {
      return undefined;
    }
    const timer = window.setTimeout(() => actions.clearFriendMessage(), MESSAGE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [state.friendMessage, actions]);

  const loadMore = React.useCallback(() => {
    if (!refreshEnabled) return;
    if (!state.cursor) return;
    if (state.isLoadingMore) return;
    actions.setLoadingMore(true);
    startLoadMore(async () => {
      try {
        const page = await loadHomeFeedPageAction(state.cursor);
        actions.appendPosts(page.posts, page.cursor ?? null);
      } catch (error) {
        console.error("Home feed pagination failed", error);
      } finally {
        actions.setLoadingMore(false);
      }
    });
  }, [actions, refreshEnabled, state.cursor, state.isLoadingMore]);

  return {
    posts: state.posts,
    likePending: state.likePending,
    memoryPending: state.memoryPending,
    friendMessage: state.friendMessage,
    activeFriendTarget: state.activeFriendTarget,
    friendActionPending: state.friendActionPending,
    refreshPosts: actions.refreshPosts,
    handleToggleLike: actions.handleToggleLike,
    handleToggleMemory: actions.handleToggleMemory,
    handleFriendRequest: actions.handleFriendRequest,
    handleFriendRemove: actions.handleFriendRemove,
    handleFollowUser: actions.handleFollowUser,
    handleUnfollowUser: actions.handleUnfollowUser,
    handleDelete: actions.handleDelete,
    setActiveFriendTarget: actions.setActiveFriendTarget,
    formatCount: formatFeedCount,
    timeAgo: formatTimeAgo,
    exactTime: formatExactTime,
    canRemember,
    hasFetched: state.hasFetched,
    isRefreshing: state.isRefreshing,
    loadMore,
    isLoadingMore: state.isLoadingMore || isLoadMorePending,
    hasMore: Boolean(state.cursor),
  };
}

type UseHomeFeedOptions = {
  initialPosts?: HomeFeedPost[];
  initialCursor?: string | null;
  hydrationKey?: string | null;
  skipInitialRefresh?: boolean;
  refreshEnabled?: boolean;
};

export function useHomeFeed(options?: UseHomeFeedOptions) {
  const hasInitialData =
    Array.isArray(options?.initialPosts) || options?.initialCursor !== undefined;

  const initialData = hasInitialData
    ? {
        posts: options?.initialPosts ?? [],
        cursor: options?.initialCursor ?? null,
        hasFetched: true,
      }
    : null;

  const hydrationKey =
    options?.hydrationKey ??
    (hasInitialData
      ? `init:${options?.initialCursor ?? "none"}:${options?.initialPosts?.length ?? 0}:${
          options?.initialPosts?.[0]?.id ?? "empty"
        }`
      : null);

  return useFeed(homeFeedStore, {
    refreshEnabled: options?.refreshEnabled ?? true,
    initialData,
    hydrationKey,
    skipInitialRefresh: options?.skipInitialRefresh ?? hasInitialData,
  });
}

export function useCapsuleFeed(capsuleId: string | null | undefined) {
  const trimmedCapsuleId = React.useMemo(() => {
    if (typeof capsuleId !== "string") return null;
    const value = capsuleId.trim();
    return value.length ? value : null;
  }, [capsuleId]);

  const capsuleStore = React.useMemo(
    () =>
      createHomeFeedStore({
        fallbackPosts: [],
        client: {
          fetch: async (options) => {
            if (!trimmedCapsuleId) {
              return { posts: [], cursor: null, deleted: [] };
            }
            const { signal: _signal, ...rest } = options ?? {};
            return fetchHomeFeedSliceAction({ ...rest, capsuleId: trimmedCapsuleId });
          },
        },
      }),
    [trimmedCapsuleId],
  );

  return useFeed(capsuleStore, {
    refreshKey: trimmedCapsuleId ?? "__no_capsule__",
    refreshEnabled: Boolean(trimmedCapsuleId),
  });
}
