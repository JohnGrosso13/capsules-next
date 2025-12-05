// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeFeedItem, HomeFeedPost } from "./types";

vi.mock("@/services/auth/client", () => ({
  useCurrentUser: () => ({ user: { id: "user-1" } }),
}));

const listeners = new Set<() => void>();

const refreshMock = vi.fn().mockResolvedValue(undefined);
const toggleLikeMock = vi.fn().mockResolvedValue(undefined);
const toggleMemoryMock = vi.fn().mockResolvedValue(true);
const requestFriendMock = vi.fn().mockResolvedValue(undefined);
const removeFriendMock = vi.fn().mockResolvedValue(undefined);
const deletePostMock = vi.fn().mockResolvedValue(undefined);
const setActiveFriendTargetMock = vi.fn((value: string | null) => {
  mockState = { ...mockState, activeFriendTarget: value };
  notify();
});
const clearFriendMessageMock = vi.fn(() => {
  mockState = { ...mockState, friendMessage: null };
  notify();
});
const resetPendingStatesMock = vi.fn();
const appendPostsMock = vi.fn();
const setLoadingMoreMock = vi.fn();
const hydrateMock = vi.fn();

vi.mock("@/server/actions/home-feed", () => ({
  loadHomeFeedPageAction: vi.fn().mockResolvedValue({ posts: [], cursor: null }),
}));

let mockState: {
  items: HomeFeedItem[];
  posts?: HomeFeedPost[];
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

function notify() {
  listeners.forEach((listener) => listener());
}

function setMockState(partial: Partial<typeof mockState>) {
  mockState = { ...mockState, ...partial };
  notify();
}

vi.mock("./homeFeedStore", () => ({
  homeFeedStore: {
    getState: () => mockState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions: {
      refresh: (options?: { signal?: AbortSignal; limit?: number }) => refreshMock(options),
      toggleLike: (postId: string) => toggleLikeMock(postId),
      toggleMemory: (postId: string, options: { desired?: boolean; canRemember: boolean }) =>
        toggleMemoryMock(postId, options),
      requestFriend: (postId: string, identifier: string) => requestFriendMock(postId, identifier),
      removeFriend: (postId: string, identifier: string) => removeFriendMock(postId, identifier),
      deletePost: (postId: string) => deletePostMock(postId),
      setActiveFriendTarget: (value: string | null) => setActiveFriendTargetMock(value),
      clearFriendMessage: () => clearFriendMessageMock(),
      resetPendingStates: () => resetPendingStatesMock(),
      appendPosts: (posts: HomeFeedPost[], cursor: string | null) =>
        appendPostsMock(posts, cursor),
      setLoadingMore: (value: boolean) => setLoadingMoreMock(value),
      hydrate: (snapshot: unknown) => hydrateMock(snapshot),
    },
  },
  homeFeedFallbackPosts: [],
  __setMockState: setMockState,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { useHomeFeed } = await import("../useHomeFeed");
const { __setMockState } = await import("./homeFeedStore");

const basePost: HomeFeedPost = {
  id: "alpha",
  dbId: "db-alpha",
  user_name: "Alpha",
  content: "Hello",
  mediaUrl: null,
  created_at: "2023-01-02T00:00:00.000Z",
  likes: 1,
  comments: 0,
  shares: 0,
  viewerLiked: false,
  viewerRemembered: false,
  attachments: [],
};

const baseItem: HomeFeedItem = {
  id: basePost.id,
  type: "post",
  post: basePost,
  score: null,
  slotInterval: null,
  pinnedAt: null,
  payload: null,
};

let root: Root;
let container: HTMLElement;
let latest: ReturnType<typeof useHomeFeed>;

function TestComponent() {
  latest = useHomeFeed();
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  listeners.clear();
  refreshMock.mockClear();
  toggleLikeMock.mockClear();
  toggleMemoryMock.mockClear();
  requestFriendMock.mockClear();
  removeFriendMock.mockClear();
  deletePostMock.mockClear();
  setActiveFriendTargetMock.mockClear();
  clearFriendMessageMock.mockClear();
  resetPendingStatesMock.mockClear();
  appendPostsMock.mockClear();
  setLoadingMoreMock.mockClear();
  hydrateMock.mockClear();
  mockState = {
    items: [baseItem],
    posts: [basePost],
    cursor: null,
    likePending: { alpha: true },
    memoryPending: {},
    friendActionPending: null,
    friendMessage: null,
    activeFriendTarget: null,
    isRefreshing: false,
    hasFetched: false,
    isLoadingMore: false,
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

describe("useHomeFeed", () => {
  it("exposes store state and triggers initial refresh", async () => {
    await act(async () => {
      root.render(<TestComponent />);
    });

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refreshMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 15, signal: expect.any(AbortSignal) }),
    );
    expect(latest.posts[0]?.id).toBe("alpha");
    expect(latest.items[0]?.id).toBe("alpha");
    expect(latest.likePending).toEqual({ alpha: true });
    expect(latest.canRemember).toBe(true);
    expect(typeof latest.refreshPosts).toBe("function");
    expect(typeof latest.handleToggleLike).toBe("function");
    expect(typeof latest.loadMore).toBe("function");
  });

  it("forwards actions to the store and clears friend message on timeout", async () => {
    await act(async () => {
      root.render(<TestComponent />);
    });

    await act(async () => {
      await latest.refreshPosts();
    });
    expect(refreshMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await latest.handleToggleLike("alpha");
    });
    expect(toggleLikeMock).toHaveBeenCalledWith("alpha");

    let memoryResult: boolean | undefined;
    await act(async () => {
      memoryResult = await latest.handleToggleMemory(basePost);
    });
    expect(memoryResult).toBe(true);
    expect(toggleMemoryMock).toHaveBeenCalledWith("alpha", {
      desired: undefined,
      canRemember: true,
    });

    await act(async () => {
      await latest.handleFriendRequest(basePost, "menu-1");
      await latest.handleFriendRemove(basePost, "menu-1");
      await latest.handleDelete("alpha");
    });
    expect(requestFriendMock).toHaveBeenCalledWith("alpha", "menu-1");
    expect(removeFriendMock).toHaveBeenCalledWith("alpha", "menu-1");
    expect(deletePostMock).toHaveBeenCalledWith("alpha");

    await act(async () => {
      latest.setActiveFriendTarget((prev) => (prev ? null : "menu-2"));
    });
    expect(setActiveFriendTargetMock).toHaveBeenCalledWith("menu-2");

    act(() => {
      __setMockState({ friendMessage: "Hello" });
    });

    expect(latest.friendMessage).toBe("Hello");
    act(() => {
      vi.runAllTimers();
    });
    expect(clearFriendMessageMock).toHaveBeenCalled();
  });
});
