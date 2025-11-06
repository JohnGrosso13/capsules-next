import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/posts", () => ({
  createPostRecord: vi.fn(),
}));

vi.mock("@/lib/env/server", () => ({
  serverEnv: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_BUCKET: "capsule-assets",
    R2_ACCOUNT_ID: "test-account",
    R2_ACCESS_KEY_ID: "test-access",
    R2_SECRET_ACCESS_KEY: "test-secret",
    R2_BUCKET: "capsule-uploads",
    CLOUDFLARE_IMAGE_RESIZE_BASE_URL: null,
    SITE_URL: "https://example.com",
    R2_PUBLIC_BASE_URL: "",
  },
}));

vi.mock("@/server/memories/uploads", () => ({
  listUploadSessionsByIds: vi.fn(async () => []),
}));

vi.mock("@/server/posts/repository", () => ({
  listPostsView: vi.fn(async () => []),
  listViewerLikedPostIds: vi.fn(async () => []),
  listViewerRememberedPostIds: vi.fn(async () => []),
  listAttachmentsForPosts: vi.fn(async () => []),
}));

vi.mock("@/server/posts/media", () => ({
  ensureAccessibleMediaUrl: vi.fn(async (value) => value),
  extractUploadSessionId: vi.fn(() => null),
  guessMimeFromUrl: vi.fn(() => null),
  isLikelyImage: vi.fn(() => false),
  normalizeContentType: vi.fn(() => null),
  readContentType: vi.fn(() => null),
}));

vi.mock("@/server/posts/normalizers", () => ({
  buildFallbackPosts: vi.fn(() => []),
  normalizePost: vi.fn((row: Record<string, unknown>) => ({
    id: String(row.id ?? "post"),
    dbId: String(row.id ?? "post"),
    kind: "post",
    content: "",
    mediaUrl: null,
    mediaPrompt: null,
    userName: null,
    userAvatar: null,
    capsuleId: null,
    likes: 0,
    ts: "2024-01-01T00:00:00.000Z",
    source: "test",
    ownerUserId: null,
    attachments: [],
    viewerLiked: false,
    viewerRemembered: false,
  })),
  shouldReturnFallback: vi.fn(() => false),
}));

vi.mock("@/lib/cloudflare/images", () => ({
  buildImageVariants: vi.fn(() => ({ original: "https://example.com/image.jpg" })),
  pickBestDisplayVariant: vi.fn(() => null),
}));

import { createPostSlim, getPostsSlim } from "./api";
import { createPostRecord } from "@/lib/supabase/posts";

describe("posts slim handlers", () => {
  describe("getPostsSlim", () => {
    it("returns validation error when query is invalid", async () => {
      const result = await getPostsSlim({ viewerId: null, query: { limit: "-5" } });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.body.error).toBe("invalid_query");
      }
    });
  });

  describe("createPostSlim", () => {
    const createPostRecordMock = vi.mocked(createPostRecord);

    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("returns success when record is created", async () => {
      createPostRecordMock.mockResolvedValue("post-123");

      const result = await createPostSlim({ post: {}, ownerId: "owner-1" });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.body).toEqual({ success: true, id: "post-123" });
      }
      expect(createPostRecordMock).toHaveBeenCalledWith({}, "owner-1");
    });

    it("returns error when persistence fails", async () => {
      const error = new Error("boom");
      createPostRecordMock.mockRejectedValue(error);

      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let result;
      try {
        result = await createPostSlim({ post: {}, ownerId: "owner-2" });
      } finally {
        errorSpy.mockRestore();
      }

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(500);
        expect(result.body.error).toBe("post_save_failed");
        expect(result.body.message).toBe("Failed to save post");
      }
    });
  });
});
