import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deletePost,
  fetchHomeFeed,
  togglePostLike,
  togglePostMemory,
  updatePostFriendship,
} from "./client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchHomeFeed", () => {
  it("returns posts array and cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ posts: [1, 2, 3], cursor: "next" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchHomeFeed({ limit: 5, cursor: "abc" });

    expect(fetchMock).toHaveBeenCalledWith("/api/posts?limit=5&cursor=abc", { signal: undefined });
    expect(result.posts).toEqual([1, 2, 3]);
    expect(result.cursor).toBe("next");
  });

  it("throws with message from payload when response not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message: "feed failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHomeFeed()).rejects.toThrowError("feed failed");
  });
});

describe("togglePostLike", () => {
  it("returns parsed like response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ likes: 42, viewer_liked: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await togglePostLike({ postId: "abc", action: "like" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/posts/abc/like",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ action: "like" });
    expect(result).toEqual({ likes: 42, viewerLiked: true });
  });

  it("throws when the server rejects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ error: "nope" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(togglePostLike({ postId: "abc", action: "unlike" })).rejects.toThrowError("nope");
  });
});

describe("togglePostMemory", () => {
  it("returns remembered flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ remembered: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await togglePostMemory({ postId: "p1", action: "remember", payload: { foo: "bar" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/posts/p1/memory",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ action: "remember", payload: { foo: "bar" } });
    expect(result.remembered).toBe(true);
  });

  it("throws on memory error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ message: "memory boom" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(togglePostMemory({ postId: "p1", action: "forget" })).rejects.toThrowError("memory boom");
  });
});

describe("updatePostFriendship", () => {
  it("returns message from payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ message: "done" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const target = { userId: "u1" };
    const result = await updatePostFriendship({ action: "request", target });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/friends/update",
      expect.objectContaining({ method: "POST" }),
    );
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(options.body))).toEqual({ action: "request", target });
    expect(result).toEqual({ message: "done", data: { message: "done" } });
  });

  it("throws when friendship action fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: "no friend" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(updatePostFriendship({ action: "remove", target: null })).rejects.toThrowError("no friend");
  });
});

describe("deletePost", () => {
  it("does nothing on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: vi.fn() });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deletePost({ postId: "z" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/posts/z",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws when delete fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: "delete failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deletePost({ postId: "z" })).rejects.toThrowError("delete failed");
  });
});
