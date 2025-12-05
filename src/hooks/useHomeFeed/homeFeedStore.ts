import { friendsActions } from "@/lib/friends/store";
import type { FeedFetchOptions, FeedFetchResult, FeedInsert } from "@/domain/feed";
import { fetchHomeFeedSliceAction } from "@/server/actions/home-feed";
import { toggleFeedLikeAction, toggleFeedMemoryAction } from "@/server/actions/feed-mutations";
import {
  deletePost as deletePostRequest,
  updatePostFriendship,
} from "@/services/feed/client";
import type { HomeFeedAttachment, HomeFeedItem, HomeFeedPost } from "./types";
import { buildFriendTarget, normalizePosts, resolvePostMediaUrl } from "./utils";

type HomeFeedStoreState = {
  items: HomeFeedItem[];
  cursor: string | null;
  likePending: Record<string, boolean>;
  memoryPending: Record<string, boolean>;
  friendActionPending: string | null;
  friendMessage: string | null;
  activeFriendTarget: string | null;
  isRefreshing: boolean;
  hasFetched: boolean;
  isLoadingMore: boolean;
};

type HomeFeedStoreListener = () => void;

type ToggleMemoryOptions = {
  desired?: boolean;
  canRemember: boolean;
};

type HomeFeedStoreActions = {
  refresh: (options?: FeedFetchOptions) => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  toggleMemory: (postId: string, options: ToggleMemoryOptions) => Promise<boolean>;
  requestFriend: (postId: string, identifier: string) => Promise<void>;
  removeFriend: (postId: string, identifier: string) => Promise<void>;
  followUser: (postId: string, identifier: string) => Promise<void>;
  unfollowUser: (postId: string, identifier: string) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
  setActiveFriendTarget: (identifier: string | null) => void;
  clearFriendMessage: () => void;
  resetPendingStates: () => void;
  hydrate: (snapshot: HomeFeedHydrationSnapshot) => void;
  setLoadingMore: (value: boolean) => void;
  appendPosts: (posts: HomeFeedPost[], cursor: string | null, inserts?: FeedInsert[] | null) => void;
};

type HomeFeedStoreApi = {
  getState: () => HomeFeedStoreState;
  subscribe: (listener: HomeFeedStoreListener) => () => void;
  actions: HomeFeedStoreActions;
};

type HomeFeedClient = {
  fetch: (options?: FeedFetchOptions) => Promise<FeedFetchResult>;
  toggleLike: (input: { postId: string; like: boolean }) => Promise<{
    likes: number | null;
    viewerLiked: boolean | null;
  }>;
  toggleMemory: (input: {
    postId: string;
    remember: boolean;
    payload?: Record<string, unknown> | null;
  }) => Promise<{ remembered: boolean | null }>;
  updateFriend: typeof updatePostFriendship;
  deletePost: typeof deletePostRequest;
};

type HomeFeedStoreDependencies = {
  client?: Partial<HomeFeedClient>;
  fallbackPosts?: HomeFeedPost[];
  events?: {
    refreshFriends?: () => void;
  };
};

export type HomeFeedHydrationSnapshot = {
  posts?: HomeFeedPost[];
  items?: HomeFeedItem[];
  cursor?: string | null;
  hasFetched?: boolean;
  friendMessage?: string | null;
};

function cloneAttachment(value: HomeFeedAttachment): HomeFeedAttachment {
  const variants = value.variants ? { ...value.variants } : null;
  const meta = value.meta ? { ...value.meta } : null;
  return { ...value, variants, meta };
}

function clonePost(post: HomeFeedPost): HomeFeedPost {
  return {
    ...post,
    attachments: Array.isArray(post.attachments) ? post.attachments.map(cloneAttachment) : [],
  };
}

function itemKey(item: HomeFeedItem): string {
  return `${item.type}::${item.id}`;
}

function makePostItem(post: HomeFeedPost, score?: number | null): HomeFeedItem {
  const cloned = clonePost(post);
  return {
    id: typeof cloned.id === "string" ? cloned.id : String(cloned.id ?? ""),
    type: "post",
    post: cloned,
    score: typeof score === "number" ? score : null,
    slotInterval: null,
    pinnedAt: null,
    payload: null,
  };
}

function makeInsertItem(insert: FeedInsert): HomeFeedItem {
  const base = {
    id: insert.id,
    type: insert.type,
    score: insert.score ?? null,
    slotInterval: insert.slotInterval ?? null,
    pinnedAt: insert.pinnedAt ?? null,
    payload: insert.payload ?? null,
  } as HomeFeedItem;

  if (insert.type === "post") {
    const postPayload = (insert.payload?.post as HomeFeedPost | undefined) ?? null;
    if (postPayload) {
      return makePostItem(postPayload, insert.score ?? null);
    }
    return { ...base, type: "post", post: { id: insert.id } as HomeFeedPost };
  }

  return base;
}

function mergeItems(base: HomeFeedItem[], additions: HomeFeedItem[]): HomeFeedItem[] {
  const merged = [...base];
  const indexByKey = new Map<string, number>();
  merged.forEach((item, index) => indexByKey.set(itemKey(item), index));
  additions.forEach((item) => {
    const key = itemKey(item);
    if (indexByKey.has(key)) {
      const idx = indexByKey.get(key);
      if (typeof idx === "number") {
        merged[idx] = item;
      }
    } else {
      indexByKey.set(key, merged.length);
      merged.push(item);
    }
  });
  return merged;
}

const defaultFallbackPosts: HomeFeedPost[] = [
  {
    id: "sample-feed",
    dbId: "sample-feed",
    user_name: "Assistant",
    content: "Ask your Capsule AI to design posts, polls, and shopping drops for your community.",
    mediaUrl: null,
    created_at: null,
    likes: 128,
    comments: 14,
    shares: 6,
    viewerLiked: false,
    attachments: [],
  },
];

const defaultClient: HomeFeedClient = {
  fetch: (options) => fetchHomeFeedSliceAction(options ?? {}),
  toggleLike: async ({ postId, like }) => {
    const result = await toggleFeedLikeAction({ postId, like });
    return {
      likes: result.likes,
      viewerLiked: result.viewerLiked,
    };
  },
  toggleMemory: async ({ postId, remember, payload = null }) => {
    const result = await toggleFeedMemoryAction({ postId, remember, payload });
    return {
      remembered: result.remembered,
    };
  },
  updateFriend: updatePostFriendship,
  deletePost: deletePostRequest,
};

const defaultEvents = {
  refreshFriends: () => {
    void friendsActions.refresh({ background: true });
  },
};

function getRequestId(post: HomeFeedPost): string {
  if (typeof post.dbId === "string" && post.dbId.trim().length > 0) {
    return post.dbId;
  }
  return post.id;
}

function markPending(map: Record<string, boolean>, key: string): Record<string, boolean> {
  return { ...map, [key]: true };
}

function clearPending(map: Record<string, boolean>, key: string): Record<string, boolean> {
  const next = { ...map };
  delete next[key];
  return next;
}

export function createHomeFeedStore(deps: HomeFeedStoreDependencies = {}): HomeFeedStoreApi {
  const client: HomeFeedClient = {
    ...defaultClient,
    ...deps.client,
  };

  const events = {
    ...defaultEvents,
    ...deps.events,
  };

  const fallbackPosts = deps.fallbackPosts
    ? deps.fallbackPosts.map(clonePost)
    : defaultFallbackPosts.map(clonePost);
  const fallbackItems = fallbackPosts.map((post) => makePostItem(post));

  let state: HomeFeedStoreState = {
    items: fallbackItems,
    cursor: null,
    likePending: {},
    memoryPending: {},
    friendActionPending: null,
    friendMessage: null,
    activeFriendTarget: null,
    isRefreshing: false,
    hasFetched: false,
    isLoadingMore: false,
  };

  const listeners = new Set<HomeFeedStoreListener>();
  let refreshGeneration = 0;

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function setState(
    update:
      | Partial<HomeFeedStoreState>
      | ((prev: HomeFeedStoreState) => Partial<HomeFeedStoreState>),
  ) {
    const patch = typeof update === "function" ? update(state) : update;
    if (!patch || Object.keys(patch).length === 0) {
      return;
    }
    state = { ...state, ...patch };
    notify();
  }

  function resetPendingStates() {
    setState({
      likePending: {},
      memoryPending: {},
      friendActionPending: null,
    });
  }

  function hydrate(snapshot: HomeFeedHydrationSnapshot) {
    let items: HomeFeedItem[] | null = null;
    if (Array.isArray(snapshot.items)) {
      items = snapshot.items.map((entry) => {
        if (entry.type === "post" && entry.post) {
          return makePostItem(clonePost(entry.post), entry.score ?? null);
        }
        return { ...entry };
      });
    } else if (Array.isArray(snapshot.posts)) {
      const normalizedPosts = snapshot.posts.length > 0 ? snapshot.posts.map(clonePost) : fallbackPosts;
      items = normalizedPosts.map((post) => makePostItem(post));
    }
    if (!items) return;
    setState({
      items,
      cursor: snapshot.cursor ?? null,
      hasFetched: snapshot.hasFetched ?? true,
      friendMessage: snapshot.friendMessage ?? null,
      likePending: {},
      memoryPending: {},
      friendActionPending: null,
      activeFriendTarget: null,
      isRefreshing: false,
      isLoadingMore: false,
    });
  }

  function setLoadingMore(value: boolean) {
    setState({ isLoadingMore: value });
  }

  function appendPosts(
    posts: HomeFeedPost[],
    cursor: string | null,
    inserts: FeedInsert[] | null = null,
  ) {
    if (!Array.isArray(posts) || posts.length === 0) {
      setState({ cursor: cursor ?? null, isLoadingMore: false });
      return;
    }
    const additions: HomeFeedItem[] = [
      ...posts.map((post) => makePostItem(post)),
      ...(Array.isArray(inserts) ? inserts.map(makeInsertItem) : []),
    ];
    setState((prev) => {
      const merged = mergeItems(prev.items, additions);
      return {
        items: merged,
        cursor: cursor ?? null,
        hasFetched: true,
        isLoadingMore: false,
      };
    });
  }

  async function refresh(options: FeedFetchOptions = {}): Promise<void> {
    const token = ++refreshGeneration;
    setState({ isRefreshing: true });

    try {
      const requestOptions: FeedFetchOptions = {
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
        ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
        ...(options.capsuleId !== undefined ? { capsuleId: options.capsuleId } : {}),
      };
      const result = await client.fetch(requestOptions);
      if (token !== refreshGeneration) {
        return;
      }
      const normalized = normalizePosts(result.posts);
      const inserts = Array.isArray(result.inserts) ? result.inserts : [];
      const basePosts = normalized.length ? normalized : fallbackPosts;
      const baseItems: HomeFeedItem[] = [
        ...basePosts.map((post) => makePostItem(post)),
        ...inserts.map(makeInsertItem),
      ];
      const deletedSet =
        Array.isArray(result.deleted) && result.deleted.length ? new Set(result.deleted) : null;
      const filteredItems = deletedSet
        ? baseItems.filter((item) => {
            if (item.type !== "post") return true;
            const postId = typeof item.post.id === "string" ? item.post.id : String(item.post.id ?? "");
            const dbId = typeof item.post.dbId === "string" ? item.post.dbId : null;
            const matchesPostId = postId && deletedSet.has(postId);
            const matchesDbId = dbId && deletedSet.has(dbId);
            return !matchesPostId && !matchesDbId;
          })
        : baseItems;
      setState({
        items: filteredItems.length ? filteredItems : fallbackItems,
        cursor: result.cursor ?? null,
        hasFetched: true,
        isRefreshing: false,
      });
      resetPendingStates();
    } catch (error) {
      if (token !== refreshGeneration) {
        return;
      }
      const aborted =
        options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
      if (!aborted) {
        console.error("Posts refresh failed", error);
      }
      setState({ isRefreshing: false });
    }
  }

  async function toggleLike(postId: string): Promise<void> {
    const currentIndex = state.items.findIndex(
      (item) => item.type === "post" && item.post.id === postId,
    );
    const current = currentIndex === -1 ? null : (state.items[currentIndex] as HomeFeedItem);
    if (!current || current.type !== "post") {
      return;
    }

    const previousLiked = Boolean(current.post.viewerLiked ?? current.post.viewer_liked);
    const baseLikes = typeof current.post.likes === "number" ? current.post.likes : 0;
    const nextLiked = !previousLiked;
    const optimisticLikes = Math.max(0, nextLiked ? baseLikes + 1 : baseLikes - 1);
    const requestId = getRequestId(current.post);

    setState((prev) => ({
      likePending: markPending(prev.likePending, postId),
      items: prev.items.map((item) => {
        if (item.type !== "post" || item.post.id !== postId) return item;
        const nextPost = {
          ...item.post,
          viewerLiked: nextLiked,
          viewer_liked: nextLiked,
          likes: optimisticLikes,
        };
        return makePostItem(nextPost, item.score ?? null);
      }),
    }));

    try {
      const response = await client.toggleLike({
        postId: requestId,
        like: nextLiked,
      });
      const confirmedLikes = typeof response.likes === "number" ? response.likes : optimisticLikes;
      const liked = typeof response.viewerLiked === "boolean" ? response.viewerLiked : nextLiked;
      setState((prev) => ({
        items: prev.items.map((item) => {
          if (item.type !== "post" || item.post.id !== postId) return item;
          const nextPost = {
            ...item.post,
            viewerLiked: liked,
            viewer_liked: liked,
            likes: confirmedLikes,
          };
          return makePostItem(nextPost, item.score ?? null);
        }),
      }));
    } catch (error) {
      console.error("Like toggle failed", error);
      setState((prev) => ({
        items: prev.items.map((item) => {
          if (item.type !== "post" || item.post.id !== postId) return item;
          const nextPost = {
            ...item.post,
            viewerLiked: previousLiked,
            viewer_liked: previousLiked,
            likes: baseLikes,
          };
          return makePostItem(nextPost, item.score ?? null);
        }),
      }));
    } finally {
      setState((prev) => ({ likePending: clearPending(prev.likePending, postId) }));
    }
  }

  async function toggleMemory(postId: string, options: ToggleMemoryOptions): Promise<boolean> {
    const { desired, canRemember } = options;
    if (!canRemember) {
      throw new Error("Authentication required");
    }
    const current = state.items.find(
      (item) => item.type === "post" && item.post.id === postId,
    ) as HomeFeedItem | undefined;
    if (!current || current.type !== "post") {
      throw new Error("Post not found");
    }

    const previousRemembered = Boolean(
      current.post.viewerRemembered ?? current.post.viewer_remembered,
    );
    const nextRemembered = typeof desired === "boolean" ? desired : !previousRemembered;
    if (nextRemembered === previousRemembered) {
      return previousRemembered;
    }

    const requestId = getRequestId(current.post);
    const mediaUrl = resolvePostMediaUrl(current.post);

    setState((prev) => ({
      memoryPending: markPending(prev.memoryPending, postId),
      items: prev.items.map((item) => {
        if (item.type !== "post" || item.post.id !== postId) return item;
        const nextPost = {
          ...item.post,
          viewerRemembered: nextRemembered,
          viewer_remembered: nextRemembered,
        };
        return makePostItem(nextPost, item.score ?? null);
      }),
    }));

    try {
      const payload: Record<string, unknown> | null = nextRemembered
        ? {
            mediaUrl,
            content: typeof current.post.content === "string" ? current.post.content : null,
            userName: current.post.user_name ?? null,
          }
        : null;
      const response = await client.toggleMemory({
        postId: requestId,
        remember: nextRemembered,
        payload,
      });
      const confirmed =
        typeof response.remembered === "boolean" ? response.remembered : nextRemembered;
      setState((prev) => ({
        items: prev.items.map((item) => {
          if (item.type !== "post" || item.post.id !== postId) return item;
          const nextPost = {
            ...item.post,
            viewerRemembered: confirmed,
            viewer_remembered: confirmed,
          };
          return makePostItem(nextPost, item.score ?? null);
        }),
      }));
      return confirmed;
    } catch (error) {
      console.error("Memory toggle failed", error);
      setState((prev) => ({
        items: prev.items.map((item) => {
          if (item.type !== "post" || item.post.id !== postId) return item;
          const nextPost = {
            ...item.post,
            viewerRemembered: previousRemembered,
            viewer_remembered: previousRemembered,
          };
          return makePostItem(nextPost, item.score ?? null);
        }),
      }));
      throw error;
    } finally {
      setState((prev) => ({ memoryPending: clearPending(prev.memoryPending, postId) }));
    }
  }

  async function performFriendAction(
    postId: string,
    identifier: string,
    action: "request" | "remove" | "follow" | "unfollow",
  ): Promise<void> {
    const current = state.items.find(
      (item) => item.type === "post" && item.post.id === postId,
    ) as HomeFeedItem | undefined;
    if (!current || current.type !== "post") {
      return;
    }
    const target = buildFriendTarget(current.post);
    if (!target) {
      const message =
        action === "request"
          ? "That profile isn't ready for requests yet."
          : action === "remove"
            ? "That profile isn't ready for removal yet."
            : action === "follow"
              ? "That profile isn't ready for follows yet."
              : "That profile isn't ready for unfollows yet.";
      setState({ friendMessage: message });
      return;
    }

    setState({ friendActionPending: identifier });

    try {
      const result = await client.updateFriend({ action, target });
      const fallbackMessage =
        action === "request"
          ? `Friend request sent to ${current.post.user_name || "this member"}.`
          : action === "remove"
            ? `${current.post.user_name || "Friend"} removed.`
            : action === "follow"
              ? `Now following ${current.post.user_name || "this member"}.`
              : `Unfollowed ${current.post.user_name || "this member"}.`;
      const message =
        typeof result.message === "string" && result.message.trim().length > 0
          ? result.message
          : fallbackMessage;
      setState({ friendMessage: message, activeFriendTarget: null });
      if (events.refreshFriends) {
        try {
          events.refreshFriends();
        } catch (error) {
          console.error("Friends refresh callback failed", error);
        }
      }
    } catch (error) {
      console.error("Post friend action error", error);
      const fallbackMessage =
        action === "request"
          ? "Couldn't send that friend request."
          : action === "remove"
            ? "Couldn't remove that friend."
            : action === "follow"
              ? "Couldn't follow that member."
              : "Couldn't unfollow that member.";
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;
      setState({ friendMessage: message });
    } finally {
      setState({ friendActionPending: null });
    }
  }

  async function deletePost(postId: string): Promise<void> {
    const current = state.items.find(
      (item) => item.type === "post" && item.post.id === postId,
    ) as HomeFeedItem | undefined;
    const requestId = current && current.type === "post" ? getRequestId(current.post) : postId;
    setState((prev) => ({
      items: prev.items.filter((item) => !(item.type === "post" && item.post.id === postId)),
    }));
    try {
      await client.deletePost({ postId: requestId });
    } catch (error) {
      console.error("Post delete failed", error);
    }
  }

  function setActiveFriendTarget(identifier: string | null) {
    setState({ activeFriendTarget: identifier });
  }

  function clearFriendMessage() {
    setState({ friendMessage: null });
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions: {
      refresh,
      toggleLike,
      toggleMemory,
      requestFriend: (postId, identifier) => performFriendAction(postId, identifier, "request"),
      removeFriend: (postId, identifier) => performFriendAction(postId, identifier, "remove"),
      followUser: (postId, identifier) => performFriendAction(postId, identifier, "follow"),
      unfollowUser: (postId, identifier) => performFriendAction(postId, identifier, "unfollow"),
      deletePost,
      setActiveFriendTarget,
      clearFriendMessage,
      resetPendingStates,
      hydrate,
      setLoadingMore,
      appendPosts,
    },
  };
}

export const homeFeedStore = createHomeFeedStore();

export type HomeFeedStore = ReturnType<typeof createHomeFeedStore>;
export const homeFeedFallbackPosts = defaultFallbackPosts.map(clonePost);

// Exposed only for tests that mock this module.
export function __setMockState(_: Partial<HomeFeedStoreState>): void {
  throw new Error("__setMockState is only available in tests.");
}
