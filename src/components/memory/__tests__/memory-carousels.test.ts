import { describe, expect, it } from "vitest";

import { buildPolls } from "../polls-carousel";
import { buildSavedPosts } from "../post-memories-carousel";
import { resolveInitialTab } from "../uploads-gallery";
import { computeDisplayUploads } from "../process-uploads";
import { CapsuleAssetsCarousel } from "../asset-carousel";
import type { MemoryUploadItem } from "../uploads-types";

describe("Memory carousels helpers", () => {
  it("buildPolls maps poll metadata with options and totals", () => {
    const items: MemoryUploadItem[] = [
      {
        id: "poll-1",
        title: "Weekly poll",
        description: "Best snack?",
        meta: {
          poll_question: "Best snack?",
          poll_options: ["Chips", "Cookies", "Fruit"],
          poll_counts: [5, 3, 2],
          poll_total_votes: 10,
          poll_updated_at: null,
        },
      },
    ];

    const polls = buildPolls(items);
    expect(polls).toHaveLength(1);
    const poll = polls[0]!;
    expect(poll.question).toBe("Best snack?");
    expect(poll.summary).toBe("Best snack?");
    expect(poll.totalVotes).toBe(10);
    expect(poll.options.map((opt) => opt.label)).toEqual(["Chips", "Cookies", "Fruit"]);
    expect(poll.options.map((opt) => opt.votes)).toEqual([5, 3, 2]);
  });

  it("buildSavedPosts maps post metadata and author/excerpt", () => {
    const items: MemoryUploadItem[] = [
      {
        id: "post-1",
        title: null,
        description: "Saved a cool post",
        meta: {
          post_author_name: "Casey",
          post_excerpt: "This is the excerpt",
        },
      },
    ];

    const posts = buildSavedPosts(items);
    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    expect(post.title).toBe("Saved Casey's post");
    expect(post.author).toBe("Casey");
    expect(post.excerpt).toBe("This is the excerpt");
  });

  it("resolveInitialTab falls back to default for unknown values", () => {
    expect(resolveInitialTab(undefined)).toBe("uploads");
    expect(resolveInitialTab("ai-images")).toBe("ai-images");
    expect(resolveInitialTab("unknown-tab")).toBe("uploads");
  });

  it("computeDisplayUploads prefers poster_url metadata as thumbnail when present", () => {
    const items: MemoryUploadItem[] = [
      {
        id: "video-1",
        media_url: "https://cdn.example.com/video.mp4",
        media_type: "video/mp4",
        meta: {
          poster_url: "https://cdn.example.com/video-poster.jpg",
        },
      },
    ];

    const result = computeDisplayUploads(items, {
      origin: null,
      cloudflareEnabled: false,
    });

    expect(result).toHaveLength(1);
    const processed = result[0]!;
    expect(processed.id).toBe("video-1");
    expect(processed.fullUrl).toBe("https://cdn.example.com/video.mp4");
    expect(processed.displayUrl).toBe("https://cdn.example.com/video-poster.jpg");
  });

  it("CapsuleAssetsCarousel uses all memory kinds (kind=null) so asset uploads are not filtered out", () => {
    const element = CapsuleAssetsCarousel();

    // CapsuleAssetsCarousel renders a MemoryAssetCarousel element as its root.
    // We assert that it passes kind={null}, which maps to the 'all kinds' bucket.
    expect(element).toBeDefined();
    expect((element as { props?: { kind?: string | null } }).props?.kind ?? null).toBeNull();
  });
});
