import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cloudflare/images", () => ({
  buildCloudflareImageUrl: vi.fn(() => null),
  buildImageVariants: vi.fn(() => ({ original: "https://example.com/image.jpg" })),
  pickBestDisplayVariant: vi.fn(() => null),
}));

vi.mock("@/lib/cloudflare/runtime", () => ({
  buildLocalImageVariants: vi.fn(() => ({ original: "https://example.com/image.jpg" })),
  shouldUseCloudflareImagesForOrigin: vi.fn(() => false),
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

vi.mock("@/lib/uploads/metadata", () => ({
  mergeUploadMetadata: vi.fn((a, b) => ({ ...(a ?? {}), ...(b ?? {}) })),
}));

vi.mock("@/lib/random", () => ({
  safeRandomUUID: vi.fn(() => "uuid-1"),
}));

vi.mock("@/server/memories/uploads", () => ({
  listUploadSessionsByIds: vi.fn(async () => []),
}));

vi.mock("@/server/memories/service", () => ({
  sanitizeMemoryMeta: vi.fn((value) => value),
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

vi.mock("@/server/posts/repository", () => ({
  listPostsView: vi.fn(async () => []),
  listViewerLikedPostIds: vi.fn(async () => []),
  listViewerRememberedPostIds: vi.fn(async () => []),
  listAttachmentsForPosts: vi.fn(async () => []),
  listPollVoteAggregates: vi.fn(async () => []),
  listViewerPollVotes: vi.fn(async () => []),
}));

import { queryPosts } from "./posts-query";
import { listPostsView } from "@/server/posts/repository";
import { shouldReturnFallback } from "@/server/posts/normalizers";

describe("queryPosts", () => {
  const listPostsViewMock = vi.mocked(listPostsView);
  const shouldReturnFallbackMock = vi.mocked(shouldReturnFallback);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("throws PostsQueryError when query is invalid", async () => {
    await expect(queryPosts({ viewerId: null, query: { limit: "-5" } })).rejects.toMatchObject({
      code: "invalid_query",
      status: 400,
    });
  });

  it("throws PostsQueryError when repository query fails", async () => {
    const error = new Error("boom");
    listPostsViewMock.mockRejectedValueOnce(error);

    await expect(
      queryPosts({
        viewerId: "viewer-1",
        query: { limit: 10 },
      }),
    ).rejects.toMatchObject({
      code: "posts_fetch_failed",
      status: 500,
    });
  });

  it("returns fallback posts when repository is unreachable but fallback allowed", async () => {
    const error = new Error("offline");
    listPostsViewMock.mockRejectedValueOnce(error);
    shouldReturnFallbackMock.mockReturnValueOnce(true);

    const result = await queryPosts({
      viewerId: null,
      query: { limit: 5 },
    });

    expect(result).toEqual({
      posts: [],
      deleted: [],
      cursor: null,
    });
  });
});
