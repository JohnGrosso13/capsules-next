import { describe, expect, it } from "vitest";

import { formatExactTime, formatTimeAgo } from "./time";
import { buildFriendTarget, formatFeedCount, normalizePosts, resolvePostMediaUrl } from "./utils";

import type { HomeFeedAttachment, HomeFeedPost } from "./types";

describe("formatFeedCount", () => {
  it("formats thousands and millions with suffixes", () => {
    expect(formatFeedCount(0)).toBe("0");
    expect(formatFeedCount(1250)).toBe("1.3K");
    expect(formatFeedCount(1_000_000)).toBe("1M");
  });

  it("handles invalid inputs by returning zero", () => {
    expect(formatFeedCount(undefined)).toBe("0");
    expect(formatFeedCount(null)).toBe("0");
    expect(formatFeedCount(Number.NaN)).toBe("0");
  });
});

describe("buildFriendTarget", () => {
  it("returns null when no owner information is present", () => {
    const post = { id: "1" } as HomeFeedPost;
    expect(buildFriendTarget(post)).toBeNull();
  });

  it("collects identifiers and metadata when available", () => {
    const post = {
      id: "1",
      owner_user_id: "user-1",
      owner_user_key: "key-1",
      user_name: "Casey",
      user_avatar: "https://cdn.test/avatar.png",
    } as HomeFeedPost;

    expect(buildFriendTarget(post)).toEqual({
      userId: "user-1",
      userKey: "key-1",
      name: "Casey",
      avatar: "https://cdn.test/avatar.png",
    });
  });
});

describe("resolvePostMediaUrl", () => {
  it("prefers the post media when available", () => {
    const post = {
      mediaUrl: " https://cdn.test/post.png ",
    } as HomeFeedPost;

    expect(resolvePostMediaUrl(post)).toBe("https://cdn.test/post.png");
  });

  it("ignores non-media post urls", () => {
    const post = {
      mediaUrl: "https://cdn.test/archive.odt",
    } as HomeFeedPost;

    expect(resolvePostMediaUrl(post)).toBeNull();
  });

  it("falls back to attachment variants", () => {
    const attachments: HomeFeedAttachment[] = [
      {
        id: "att-1",
        url: "https://cdn.test/original.png",
        mimeType: "image/png",
        name: null,
        thumbnailUrl: null,
        storageKey: null,
        variants: {
          original: "https://cdn.test/original.png",
          feed: "https://cdn.test/feed.png",
          thumb: "https://cdn.test/thumb.png",
          full: null,
        },
      },
    ];

    const post = {
      mediaUrl: null,
      attachments,
    } as HomeFeedPost;

    expect(resolvePostMediaUrl(post)).toBe("https://cdn.test/feed.png");
  });

  it("skips unsupported attachment types", () => {
    const attachments: HomeFeedAttachment[] = [
      {
        id: "att-file",
        url: "https://cdn.test/document.odt",
        mimeType: "application/vnd.oasis.opendocument.text",
        name: "Document",
        thumbnailUrl: null,
        storageKey: null,
        variants: null,
      },
      {
        id: "att-video",
        url: "https://cdn.test/clip.mp4",
        mimeType: "video/mp4",
        name: "Clip",
        thumbnailUrl: "https://cdn.test/clip-thumb.jpg",
        storageKey: null,
        variants: {
          original: "https://cdn.test/clip.mp4",
          feed: null,
          thumb: "https://cdn.test/clip-thumb.jpg",
          full: null,
        },
      },
    ];

    const post = {
      mediaUrl: null,
      attachments,
    } as HomeFeedPost;

    expect(resolvePostMediaUrl(post)).toBe("https://cdn.test/clip.mp4");
  });
});

describe("normalizePosts", () => {
  it("normalizes raw records and fills media from attachments", () => {
    const raw = [
      {
        id: "raw-1",
        owner_user_id: "owner-1",
        user_name: "Nova",
        attachments: [
          {
            id: "a1",
            url: "https://cdn.test/original.png",
            mimeType: "image/png",
            variants: {
              original: "https://cdn.test/original.png",
              feed: "https://cdn.test/feed.png",
              thumb: "https://cdn.test/thumb.png",
              full: null,
            },
          },
        ],
      },
    ];

    const post = normalizePosts(raw)[0]!;
    expect(post.mediaUrl).toBe("https://cdn.test/feed.png");
    expect(post.attachments?.[0]?.id).toBeDefined();
    expect(post.owner_user_id).toBe("owner-1");
    expect(post.author_user_id).toBe("owner-1");
    expect(post.authorUserId).toBe("owner-1");
  });

  it("coerces numeric identifiers and mirrors them into author fields", () => {
    const raw = [
      {
        id: 42,
        owner_user_id: 12345,
        owner_user_key: 67890,
      },
    ];

    const post = normalizePosts(raw)[0]!;
    expect(post.id).toBe("42");
    expect(post.owner_user_id).toBe("12345");
    expect(post.ownerUserId).toBe("12345");
    expect(post.author_user_id).toBe("12345");
    expect(post.authorUserId).toBe("12345");
    expect(post.owner_user_key).toBe("67890");
    expect(post.ownerKey).toBe("67890");
    expect(post.author_user_key).toBe("67890");
    expect(post.authorUserKey).toBe("67890");
  });

  it("uses author identifiers when owner fields are absent", () => {
    const raw = [
      {
        author_user_id: "author-007",
        author_user_key: "key-007",
      },
    ];

    const post = normalizePosts(raw)[0]!;
    expect(post.owner_user_id).toBe("author-007");
    expect(post.ownerUserId).toBe("author-007");
    expect(post.author_user_id).toBe("author-007");
    expect(post.authorUserId).toBe("author-007");
    expect(post.owner_user_key).toBe("key-007");
    expect(post.ownerKey).toBe("key-007");
    expect(post.author_user_key).toBe("key-007");
    expect(post.authorUserKey).toBe("key-007");
  });

  it("parses poll metadata when available", () => {
    const raw = [
      {
        id: "poll-1",
        poll: {
          question: "Which launch should we prioritize?",
          options: ["Mobile app", "Desktop app", "Chrome extension"],
          counts: [12, 8, 5],
          userVote: 1,
        },
      },
    ];

    const post = normalizePosts(raw)[0]!;
    expect(post.poll).toEqual({
      question: "Which launch should we prioritize?",
      options: ["Mobile app", "Desktop app", "Chrome extension"],
      counts: [12, 8, 5],
      totalVotes: 25,
      userVote: 1,
    });
  });

  it("decodes poll structure embedded in mediaPrompt", () => {
    const pollPayload = {
      question: "Choose your fighter",
      options: ["Nova", "Vesper"],
      counts: [4, 6],
    };
    const raw = [
      {
        id: "poll-2",
        media_prompt: `__POLL__${JSON.stringify(pollPayload)}`,
      },
    ];

    const post = normalizePosts(raw)[0]!;
    expect(post.poll).toEqual({
      question: "Choose your fighter",
      options: ["Nova", "Vesper"],
      counts: [4, 6],
      totalVotes: 10,
      userVote: null,
    });
  });
});

describe("time helpers", () => {
  it("produces human readable relative strings", () => {
    const now = Date.now();
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const tenMinutesOutcome = formatTimeAgo(tenMinutesAgo);
    expect(tenMinutesOutcome).toContain("10 minute");

    const future = new Date(now + 5_000).toISOString();
    expect(formatTimeAgo(future)).toContain("second");
  });

  it("formats a stable exact time string or returns fallback", () => {
    expect(formatExactTime(null)).toBe("");
    expect(formatExactTime("not-a-date")).toBe("Invalid Date");

    const iso = new Date().toISOString();
    const formatted = formatExactTime(iso);
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });
});
