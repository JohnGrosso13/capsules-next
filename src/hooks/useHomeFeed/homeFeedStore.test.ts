import { describe, expect, it, vi } from "vitest";

import { createHomeFeedStore } from "./homeFeedStore";
import type { HomeFeedPost } from "./types";

describe("homeFeedStore", () => {
  function makePost(overrides: Partial<HomeFeedPost> = {}): HomeFeedPost {
    return {
      id: "post-1",
      dbId: "db-post-1",
      user_name: "Test User",
      content: "Hello",
      mediaUrl: null,
      created_at: "2023-01-01T00:00:00.000Z",
      likes: 2,
      comments: 0,
      shares: 0,
      viewerLiked: false,
      viewerRemembered: false,
      owner_user_id: "owner-1",
      owner_user_key: "owner-key-1",
      attachments: [],
      ...overrides,
    };
  }

  it("refresh populates normalized posts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      posts: [
        {
          id: "abc",
          user_name: "Alice",
          likes: 5,
        },
      ],
      cursor: "cursor-1",
      deleted: [],
    });

    const store = createHomeFeedStore({
      client: { fetch: fetchMock },
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    await store.actions.refresh();

    const state = store.getState();
    expect(state.hasFetched).toBe(true);
    expect(state.isRefreshing).toBe(false);
    expect(state.cursor).toBe("cursor-1");
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]?.id).toBe("abc");
  });

  it("refresh filters out deleted identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      posts: [
        {
          id: "keep",
          user_name: "Keeper",
        },
        {
          id: "remove-me",
          user_name: "Remove",
        },
      ],
      cursor: null,
      deleted: ["remove-me"],
    });

    const store = createHomeFeedStore({
      client: { fetch: fetchMock },
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    await store.actions.refresh();

    const state = store.getState();
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]?.id).toBe("keep");
  });

  it("refresh falls back to default posts when empty", async () => {
    const fallback = [makePost({ id: "fallback" })];
    const fetchMock = vi.fn().mockResolvedValue({ posts: [], cursor: null, deleted: [] });

    const store = createHomeFeedStore({
      client: { fetch: fetchMock },
      fallbackPosts: fallback,
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    await store.actions.refresh();

    const state = store.getState();
    expect(state.posts).toHaveLength(1);
    expect(state.posts[0]?.id).toBe("fallback");
  });

  it("toggleLike updates state and calls client", async () => {
    const toggleLikeMock = vi.fn().mockResolvedValue({ likes: 7, viewerLiked: true });
    const store = createHomeFeedStore({
      client: { toggleLike: toggleLikeMock },
      fallbackPosts: [makePost({ id: "p1", dbId: "remote-1", likes: 1 })],
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    await store.actions.toggleLike("p1");

    expect(toggleLikeMock).toHaveBeenCalledWith({ postId: "remote-1", action: "like" });
    const state = store.getState();
    const post = state.posts[0];
    expect(post?.viewerLiked).toBe(true);
    expect(post?.likes).toBe(7);
    expect(state.likePending).toEqual({});
  });

  it("toggleLike reverts on failure", async () => {
    const toggleLikeMock = vi.fn().mockRejectedValue(new Error("nope"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createHomeFeedStore({
      client: { toggleLike: toggleLikeMock },
      fallbackPosts: [makePost({ id: "p2", likes: 4, viewerLiked: false })],
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    try {
      await store.actions.toggleLike("p2");
    } finally {
      errorSpy.mockRestore();
    }

    const state = store.getState();
    const post = state.posts[0];
    expect(post?.viewerLiked).toBe(false);
    expect(post?.likes).toBe(4);
    expect(state.likePending).toEqual({});
  });

  it("toggleMemory enforces authentication", async () => {
    const store = createHomeFeedStore({
      fallbackPosts: [makePost({ id: "p3" })],
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    await expect(store.actions.toggleMemory("p3", { canRemember: false })).rejects.toThrowError(
      "Authentication required",
    );
  });

  it("toggleMemory updates remembered state", async () => {
    const toggleMemoryMock = vi.fn().mockResolvedValue({ remembered: true });
    const store = createHomeFeedStore({
      client: { toggleMemory: toggleMemoryMock },
      fallbackPosts: [makePost({ id: "p4", viewerRemembered: false })],
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    const result = await store.actions.toggleMemory("p4", { canRemember: true });

    expect(result).toBe(true);
    expect(toggleMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({ postId: "db-post-1", action: "remember" }),
    );
    const post = store.getState().posts[0];
    expect(post?.viewerRemembered).toBe(true);
    expect(post?.viewer_remembered).toBe(true);
  });

  it("requestFriend sets message and triggers broadcast", async () => {
    const broadcastMock = vi.fn();
    const updateFriendMock = vi.fn().mockResolvedValue({ message: "ok" });
    const store = createHomeFeedStore({
      client: { updateFriend: updateFriendMock },
      fallbackPosts: [
        makePost({
          id: "p5",
          user_name: "Friend",
          owner_user_id: "friend-1",
          owner_user_key: "friend-key",
        }),
      ],
      events: { broadcastFriendsGraphRefresh: broadcastMock },
    });

    await store.actions.requestFriend("p5", "friend");

    expect(updateFriendMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "request" }),
    );
    const state = store.getState();
    expect(state.friendMessage).toBe("ok");
    expect(state.activeFriendTarget).toBeNull();
    expect(broadcastMock).toHaveBeenCalled();
  });

  it("deletePost removes post and calls client with request id", async () => {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const store = createHomeFeedStore({
      client: { deletePost: deleteMock },
      fallbackPosts: [makePost({ id: "p6", dbId: "remote-6" })],
      events: { broadcastFriendsGraphRefresh: vi.fn() },
    });

    await store.actions.deletePost("p6");

    expect(deleteMock).toHaveBeenCalledWith({ postId: "remote-6" });
    expect(store.getState().posts).toHaveLength(0);
  });
});
