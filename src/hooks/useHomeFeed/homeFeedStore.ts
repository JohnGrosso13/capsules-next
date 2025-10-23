import { broadcastFriendsGraphRefresh } from "@/hooks/useFriendsGraph";
import {
  deletePost as deletePostRequest,
  fetchHomeFeed,
  togglePostLike,
  togglePostMemory,
  updatePostFriendship,
  type FeedFetchOptions,
} from "@/services/feed/client";

import type { HomeFeedAttachment, HomeFeedPost } from "./types";
import { buildFriendTarget, normalizePosts, resolvePostMediaUrl } from "./utils";

type HomeFeedStoreState = {
  posts: HomeFeedPost[];
  cursor: string | null;
  likePending: Record<string, boolean>;
  memoryPending: Record<string, boolean>;
  friendActionPending: string | null;
  friendMessage: string | null;
  activeFriendTarget: string | null;
  isRefreshing: boolean;
  hasFetched: boolean;
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
  deletePost: (postId: string) => Promise<void>;
  setActiveFriendTarget: (identifier: string | null) => void;
  clearFriendMessage: () => void;
  resetPendingStates: () => void;
};

type HomeFeedStoreApi = {
  getState: () => HomeFeedStoreState;
  subscribe: (listener: HomeFeedStoreListener) => () => void;
  actions: HomeFeedStoreActions;
};

type HomeFeedClient = {
  fetch: typeof fetchHomeFeed;
  toggleLike: typeof togglePostLike;
  toggleMemory: typeof togglePostMemory;
  updateFriend: typeof updatePostFriendship;
  deletePost: typeof deletePostRequest;
};

type HomeFeedStoreDependencies = {
  client?: Partial<HomeFeedClient>;
  fallbackPosts?: HomeFeedPost[];
  events?: {
    broadcastFriendsGraphRefresh?: () => void;
  };
};

function cloneAttachment(value: HomeFeedAttachment): HomeFeedAttachment {
  const variants = value.variants ? { ...value.variants } : null;
  const meta = value.meta ? { ...value.meta } : null;
  return { ...value, variants, meta };
}

function clonePosts(posts: HomeFeedPost[]): HomeFeedPost[] {
  return posts.map((post) => ({
    ...post,
    attachments: Array.isArray(post.attachments) ? post.attachments.map(cloneAttachment) : [],
  }));
}

const defaultFallbackPosts: HomeFeedPost[] = [
  {
    id: "sample-feed",
    dbId: "sample-feed",
    user_name: "Capsules AI",
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
  fetch: fetchHomeFeed,
  toggleLike: togglePostLike,
  toggleMemory: togglePostMemory,
  updateFriend: updatePostFriendship,
  deletePost: deletePostRequest,
};

const defaultEvents = {
  broadcastFriendsGraphRefresh,
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
    ? clonePosts(deps.fallbackPosts)
    : clonePosts(defaultFallbackPosts);

  let state: HomeFeedStoreState = {
    posts: clonePosts(fallbackPosts),
    cursor: null,
    likePending: {},
    memoryPending: {},
    friendActionPending: null,
    friendMessage: null,
    activeFriendTarget: null,
    isRefreshing: false,
    hasFetched: false,
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

  async function refresh(options: FeedFetchOptions = {}): Promise<void> {
    const token = ++refreshGeneration;
    setState({ isRefreshing: true });

    try {
      const requestOptions: FeedFetchOptions = {
        ...(options.limit !== undefined ? { limit: options.limit } : {}),
        ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
        ...(options.capsuleId !== undefined ? { capsuleId: options.capsuleId } : {}),
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      };
      const result = await client.fetch(requestOptions);
      if (token !== refreshGeneration) {
        return;
      }
      const normalized = normalizePosts(result.posts);
      const nextPosts = normalized.length ? normalized : clonePosts(fallbackPosts);
      const deletedSet =
        Array.isArray(result.deleted) && result.deleted.length ? new Set(result.deleted) : null;
      const filteredPosts = deletedSet
        ? nextPosts.filter((post) => {
            const postId = typeof post.id === "string" ? post.id : String(post.id ?? "");
            const dbId = typeof post.dbId === "string" ? post.dbId : null;
            const matchesPostId = postId && deletedSet.has(postId);
            const matchesDbId = dbId && deletedSet.has(dbId);
            return !matchesPostId && !matchesDbId;
          })
        : nextPosts;
      setState({
        posts: filteredPosts,
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
    const current = state.posts.find((post) => post.id === postId);
    if (!current) {
      return;
    }

    const previousLiked = Boolean(current.viewerLiked ?? current.viewer_liked);
    const baseLikes = typeof current.likes === "number" ? current.likes : 0;
    const nextLiked = !previousLiked;
    const optimisticLikes = Math.max(0, nextLiked ? baseLikes + 1 : baseLikes - 1);
    const requestId = getRequestId(current);

    setState((prev) => ({
      likePending: markPending(prev.likePending, postId),
      posts: prev.posts.map((post) =>
        post.id === postId
          ? { ...post, viewerLiked: nextLiked, viewer_liked: nextLiked, likes: optimisticLikes }
          : post,
      ),
    }));

    try {
      const response = await client.toggleLike({
        postId: requestId,
        action: nextLiked ? "like" : "unlike",
      });
      const confirmedLikes = typeof response.likes === "number" ? response.likes : optimisticLikes;
      const liked = typeof response.viewerLiked === "boolean" ? response.viewerLiked : nextLiked;
      setState((prev) => ({
        posts: prev.posts.map((post) =>
          post.id === postId
            ? { ...post, viewerLiked: liked, viewer_liked: liked, likes: confirmedLikes }
            : post,
        ),
      }));
    } catch (error) {
      console.error("Like toggle failed", error);
      setState((prev) => ({
        posts: prev.posts.map((post) =>
          post.id === postId
            ? { ...post, viewerLiked: previousLiked, viewer_liked: previousLiked, likes: baseLikes }
            : post,
        ),
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
    const current = state.posts.find((post) => post.id === postId);
    if (!current) {
      throw new Error("Post not found");
    }

    const previousRemembered = Boolean(current.viewerRemembered ?? current.viewer_remembered);
    const nextRemembered = typeof desired === "boolean" ? desired : !previousRemembered;
    if (nextRemembered === previousRemembered) {
      return previousRemembered;
    }

    const requestId = getRequestId(current);
    const mediaUrl = resolvePostMediaUrl(current);

    setState((prev) => ({
      memoryPending: markPending(prev.memoryPending, postId),
      posts: prev.posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              viewerRemembered: nextRemembered,
              viewer_remembered: nextRemembered,
            }
          : post,
      ),
    }));

    try {
      const response = await client.toggleMemory({
        postId: requestId,
        action: nextRemembered ? "remember" : "forget",
        payload: nextRemembered
          ? {
              mediaUrl,
              content: typeof current.content === "string" ? current.content : null,
              userName: current.user_name ?? null,
            }
          : null,
      });
      const confirmed =
        typeof response.remembered === "boolean" ? response.remembered : nextRemembered;
      setState((prev) => ({
        posts: prev.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                viewerRemembered: confirmed,
                viewer_remembered: confirmed,
              }
            : post,
        ),
      }));
      return confirmed;
    } catch (error) {
      console.error("Memory toggle failed", error);
      setState((prev) => ({
        posts: prev.posts.map((post) =>
          post.id === postId
            ? {
                ...post,
                viewerRemembered: previousRemembered,
                viewer_remembered: previousRemembered,
              }
            : post,
        ),
      }));
      throw error;
    } finally {
      setState((prev) => ({ memoryPending: clearPending(prev.memoryPending, postId) }));
    }
  }

  async function performFriendAction(
    postId: string,
    identifier: string,
    action: "request" | "remove",
  ): Promise<void> {
    const current = state.posts.find((post) => post.id === postId);
    if (!current) {
      return;
    }
    const target = buildFriendTarget(current);
    if (!target) {
      const message =
        action === "request"
          ? "That profile isn't ready for requests yet."
          : "That profile isn't ready for removal yet.";
      setState({ friendMessage: message });
      return;
    }

    setState({ friendActionPending: identifier });

    try {
      const result = await client.updateFriend({ action, target });
      const fallbackMessage =
        action === "request"
          ? `Friend request sent to ${current.user_name || "this member"}.`
          : `${current.user_name || "Friend"} removed.`;
      const message =
        typeof result.message === "string" && result.message.trim().length > 0
          ? result.message
          : fallbackMessage;
      setState({ friendMessage: message, activeFriendTarget: null });
      events.broadcastFriendsGraphRefresh();
    } catch (error) {
      console.error("Post friend action error", error);
      const fallbackMessage =
        action === "request"
          ? "Couldn't send that friend request."
          : "Couldn't remove that friend.";
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;
      setState({ friendMessage: message });
    } finally {
      setState({ friendActionPending: null });
    }
  }

  async function deletePost(postId: string): Promise<void> {
    const current = state.posts.find((post) => post.id === postId);
    const requestId = current ? getRequestId(current) : postId;
    setState((prev) => ({ posts: prev.posts.filter((post) => post.id !== postId) }));
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
      deletePost,
      setActiveFriendTarget,
      clearFriendMessage,
      resetPendingStates,
    },
  };
}

export const homeFeedStore = createHomeFeedStore();

export type HomeFeedStore = ReturnType<typeof createHomeFeedStore>;
export const homeFeedFallbackPosts = clonePosts(defaultFallbackPosts);

// Exposed only for tests that mock this module.
export function __setMockState(_: Partial<HomeFeedStoreState>): void {
  throw new Error("__setMockState is only available in tests.");
}
