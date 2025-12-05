"use client";

import * as React from "react";

import { useCurrentUser } from "@/services/auth/client";
import type { FeedFetchOptions, FeedFetchResult } from "@/domain/feed";
import { fetchHomeFeedSliceAction, loadHomeFeedPageAction } from "@/server/actions/home-feed";

import type { HomeFeedItem, HomeFeedPost } from "./useHomeFeed/types";
import {
  createHomeFeedStore,
  homeFeedStore,
  type HomeFeedHydrationSnapshot,
  type HomeFeedStore,
} from "./useHomeFeed/homeFeedStore";
import { formatExactTime, formatTimeAgo } from "./useHomeFeed/time";
import { formatFeedCount } from "./useHomeFeed/utils";

export { formatFeedCount } from "./useHomeFeed/utils";
export type { HomeFeedAttachment, HomeFeedPost, HomeFeedItem } from "./useHomeFeed/types";

const FEED_LIMIT = 15;
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
      appendPosts: (posts: HomeFeedPost[], cursor: string | null, inserts?: unknown) =>
        appendPosts(posts, cursor, inserts as FeedFetchResult["inserts"]),
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
      appendPosts: (posts: HomeFeedPost[], cursor: string | null, inserts?: FeedFetchResult["inserts"]) => void;
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
  const postItems = React.useMemo(
    () => state.items.filter((item): item is Extract<HomeFeedItem, { type: "post" }> => item.type === "post"),
    [state.items],
  );
  const posts = React.useMemo(() => postItems.map((item) => item.post), [postItems]);
  const loadMoreInFlightRef = React.useRef<string | null>(null);
  const hydratedRef = React.useRef<string | null>(null);
  const initialRefreshHandledRef = React.useRef(false);
  const lastVisibilityRefreshRef = React.useRef<number>(0);

  React.useEffect(() => {
    initialRefreshHandledRef.current = false;
  }, [refreshKey]);

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
    if (initialRefreshHandledRef.current) return undefined;
    initialRefreshHandledRef.current = true;
    const controller = new AbortController();
    const timer =
      skipInitialRefresh && typeof window !== "undefined"
        ? window.setTimeout(() => {
            void actions.refreshPosts(controller.signal);
          }, 80)
        : null;
    if (!timer) {
      void actions.refreshPosts(controller.signal);
    }
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
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
    if (!refreshEnabled) return undefined;
    const handleVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") {
        return;
      }
      const now = Date.now();
      if (now - lastVisibilityRefreshRef.current < 15_000) return;
      lastVisibilityRefreshRef.current = now;
      void actions.refreshPosts();
    };
    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
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
    if (loadMoreInFlightRef.current === state.cursor) return;
    loadMoreInFlightRef.current = state.cursor;
    actions.setLoadingMore(true);
    startLoadMore(async () => {
      try {
        const page = await loadHomeFeedPageAction(state.cursor);
        actions.appendPosts(page.posts, page.cursor ?? null, page.inserts ?? null);
      } catch (error) {
        console.error("Home feed pagination failed", error);
      } finally {
        loadMoreInFlightRef.current = null;
        actions.setLoadingMore(false);
      }
    });
  }, [actions, refreshEnabled, state.cursor, state.isLoadingMore]);

  return {
    posts,
    items: state.items,
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
  const skipInitialRefresh =
    typeof options?.skipInitialRefresh === "boolean" ? options.skipInitialRefresh : false;

  return useFeed(homeFeedStore, {
    refreshEnabled: options?.refreshEnabled ?? true,
    initialData,
    hydrationKey,
    skipInitialRefresh,
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
