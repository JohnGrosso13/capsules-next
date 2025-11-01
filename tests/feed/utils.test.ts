import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/random", () => ({
  safeRandomUUID: () => "mock-generated-id",
}));

import type { HomeFeedAttachment, HomeFeedPost } from "@/hooks/useHomeFeed";
import {
  buildFriendTarget,
  formatFeedCount,
  normalizePosts,
  resolvePostMediaUrl,
} from "@/hooks/useHomeFeed/utils";
import {
  buildPostMediaCollections,
  describeAttachmentSet,
} from "@/components/home-feed/utils";

afterEach(() => {
  vi.clearAllMocks();
});

describe("home feed utils", () => {
  test("formatFeedCount formats large numbers with suffixes", () => {
    expect(formatFeedCount(0)).toBe("0");
    expect(formatFeedCount(999)).toBe("999");
    expect(formatFeedCount(1234)).toBe("1.2K");
    expect(formatFeedCount(1_500_000)).toBe("1.5M");
  });

  test("resolvePostMediaUrl prefers post media when renderable, otherwise inspects attachments", () => {
    const withMediaUrl = resolvePostMediaUrl({
      mediaUrl: " https://cdn.example.com/photo.jpg ",
      attachments: [],
    });
    expect(withMediaUrl).toBe("https://cdn.example.com/photo.jpg");

    const fromAttachment = resolvePostMediaUrl({
      mediaUrl: null,
      attachments: [
        {
          id: "att-doc",
          name: "Document.pdf",
          mimeType: "application/pdf",
          url: "https://cdn.example.com/file.pdf",
          thumbnailUrl: null,
          storageKey: null,
        },
        {
          id: "att-video",
          name: "Video.mp4",
          mimeType: "video/mp4",
          url: "https://cdn.example.com/video.mp4",
          thumbnailUrl: null,
          storageKey: null,
          variants: {
            original: " https://cdn.example.com/video-original.mp4 ",
          },
        },
      ],
    });
    expect(fromAttachment).toBe("https://cdn.example.com/video.mp4");
  });

  test("buildFriendTarget returns null when identifiers missing, otherwise includes metadata", () => {
    expect(
      buildFriendTarget({
        id: "post-1",
        user_name: "Taylor",
        user_avatar: "https://cdn.example.com/avatar.png",
      }),
    ).toBeNull();

    expect(
      buildFriendTarget({
        id: "post-2",
        owner_user_id: "123",
        owner_user_key: "taylor",
        user_name: "Taylor",
        user_avatar: "https://cdn.example.com/avatar.png",
      }),
    ).toEqual({
      userId: "123",
      userKey: "taylor",
      name: "Taylor",
      avatar: "https://cdn.example.com/avatar.png",
    });
  });

  test("describeAttachmentSet summarises attachments and produces hints", () => {
    const { summary, hints } = describeAttachmentSet(
      [
        {
          id: "att-1",
          url: "https://cdn.example.com/file.png",
          mimeType: "image/png",
          name: "Vacation.png",
          meta: { description: "Beach photo" },
        },
        {
          id: "att-2",
          url: "https://cdn.example.com/video.mp4",
          mimeType: "video/mp4",
          name: "Clip.mp4",
        },
      ] as unknown as HomeFeedAttachment[],
      null,
    );
    expect(summary).toBe("Shared 1 image and 1 video.");
    expect(hints).toContain("Beach photo");
  });

  test("buildPostMediaCollections groups gallery and file attachments", () => {
    const post = {
      id: "post-media",
      dbId: "post-media",
      user_name: "Taylor",
      user_avatar: null,
      content: "Hello world",
      created_at: "2025-01-02T03:04:05Z",
      likes: 0,
      comments: 0,
      shares: 0,
      viewerLiked: false,
      attachments: [
        {
          id: "img-1",
          url: "https://cdn.example.com/photo.jpg",
          mimeType: "image/jpeg",
          thumbnailUrl: "https://cdn.example.com/photo-thumb.jpg",
          meta: { width: 1200, height: 800 },
        },
        {
          id: "doc-1",
          url: "https://cdn.example.com/document.pdf",
          mimeType: "application/pdf",
          name: "Document.pdf",
        },
      ],
    } as unknown as HomeFeedPost;

    const { media, galleryItems, fileAttachments } = buildPostMediaCollections({
      post,
      initialMedia: null,
      cloudflareEnabled: false,
      currentOrigin: "https://capsules.example",
    });

    expect(media).toBe("https://cdn.example.com/photo-thumb.jpg");
    expect(galleryItems).toHaveLength(1);
    expect(galleryItems[0]?.kind).toBe("image");
    expect(fileAttachments).toHaveLength(1);
    expect(fileAttachments[0]?.name).toBe("Document.pdf");
  });

  test("normalizePosts coerces identifiers, metrics, and attachments", () => {
    const normalizedPosts = normalizePosts([
      {
        media_url: " https://cdn.example.com/photo.jpg ",
        created_at: "2025-01-02T03:04:05Z",
        owner_user_id: 42,
        owner_user_key: "creator",
        likes_count: 5,
        comments: 2,
        viewer_liked: true,
        attachments: [
          {
            url: " https://cdn.example.com/file.png ",
            mime_type: "image/png",
            thumbnail_url: " https://cdn.example.com/thumb.png ",
          },
          {
            url: "https://cdn.example.com/file.png",
            mime_type: "image/png",
          },
        ],
      },
    ]);

    expect(normalizedPosts).toHaveLength(1);
    const normalized = normalizedPosts[0];
    expect(normalized).toBeDefined();
    if (!normalized) return;
    expect(normalized.id).toBe("42");
    expect(normalized.mediaUrl).toBe("https://cdn.example.com/photo.jpg");
    expect(normalized.created_at).toBe("2025-01-02T03:04:05Z");
    expect(normalized.owner_user_id).toBe("42");
    expect(normalized.owner_user_key).toBe("creator");
    expect(normalized.likes).toBe(5);
    expect(normalized.comments).toBe(2);
    expect(normalized.viewer_liked).toBe(true);
    expect(normalized.attachments).toHaveLength(1);
    const attachment = normalized.attachments?.[0];
    expect(attachment).toBeDefined();
    if (!attachment) return;
    expect(attachment).toMatchObject({
      url: "https://cdn.example.com/file.png",
      mimeType: "image/png",
      name: null,
      thumbnailUrl: "https://cdn.example.com/thumb.png",
      variants: null,
    });
  });
});
