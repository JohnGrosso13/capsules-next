import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adapters/ai/runway/server", () => {
  const postRunwayJson = vi.fn(async () => ({
    ok: true,
    status: 200,
    data: {
      id: "gen-1",
      status: "succeeded",
      assets: {
        video: "https://assets.runway/video.mp4",
        thumbnail: "https://assets.runway/thumb.jpg",
      },
    },
    parsedBody: null,
    rawBody: "",
    response: new Response("{}", { status: 200 }),
  }));
  const fetchRunway = vi.fn(async () => {
    const payload = {
      id: "gen-1",
      status: "succeeded",
      assets: {
        video: "https://assets.runway/video.mp4",
        thumbnail: "https://assets.runway/thumb.jpg",
      },
    };
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  return {
    hasRunwayApiKey: () => true,
    postRunwayJson,
    fetchRunway,
  };
});

vi.mock("@/lib/supabase/storage", () => ({
  uploadBufferToStorage: vi.fn(async (_bytes: Uint8Array, contentType: string, bucket: string) => ({
    url: `https://r2/${bucket}/file`,
    key: `${bucket}-key`,
    contentType,
  })),
}));

vi.mock("@/adapters/storage/r2/provider", () => ({
  getR2SignedObjectUrl: vi.fn(async (key: string) => `https://signed.example.com/${key}`),
  getR2StorageProvider: vi.fn(() => ({
    uploadObject: vi.fn(),
    getObject: vi.fn(),
    deleteObject: vi.fn(),
  })),
}));

vi.mock("@/adapters/mux/server", () => ({
  muxVideoClient: () => ({
    assets: {
      create: vi.fn(async () => ({
        id: "mux-asset-1",
        status: "ready",
        playback_ids: [{ id: "playback-1" }],
      })),
      retrieve: vi.fn(async () => ({
        id: "mux-asset-1",
        status: "ready",
        playback_ids: [{ id: "playback-1" }],
      })),
    },
  }),
  buildMuxPlaybackUrl: (_id: string | undefined, opts?: { extension?: string }) =>
    `https://mux.local/${opts?.extension ?? "m3u8"}`,
}));

vi.mock("@/server/ai/video-runs", () => ({
  createAiVideoRun: vi.fn(async (input: Record<string, unknown>) => ({
    id: "run-1",
    ownerUserId: input.ownerUserId ?? null,
    capsuleId: input.capsuleId ?? null,
    mode: input.mode ?? "edit",
    sourceUrl: input.sourceUrl ?? null,
    userPrompt: input.userPrompt ?? "",
    resolvedPrompt: input.resolvedPrompt ?? "",
    provider: input.provider ?? "runway",
    model: input.model ?? "gen-4-aleph",
    status: "pending",
    errorCode: null,
    errorMessage: null,
    errorMeta: null,
    options: input.options ?? {},
    responseMetadata: null,
    videoUrl: null,
    thumbnailUrl: null,
    muxAssetId: null,
    muxPlaybackId: null,
    muxPosterUrl: null,
    durationSeconds: null,
    sizeBytes: null,
    retryCount: 0,
    attempts: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
  })),
  updateAiVideoRun: vi.fn(async () => null),
}));

describe("runway edit pipeline (mocked)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Mock asset downloads for video/thumbnail URLs.
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const href = typeof url === "string" ? url : url.toString();
      const body = new Uint8Array([1, 2, 3, 4]);
      const contentType = href.endsWith(".jpg") ? "image/jpeg" : "video/mp4";
      return new Response(body, { status: 200, headers: { "content-type": contentType } });
    }) as unknown as typeof fetch;
  });

  it("edits a video via Runway and persists playback", async () => {
    process.env.RUNWAY_API_KEY = "test-key";
    const { editVideoWithInstruction } = await import("@/lib/ai/video");

    const result = await editVideoWithInstruction("https://source/video.mp4", "make it moody", {
      ownerUserId: "user-1",
      capsuleId: "cap-1",
      mode: "edit",
      sourceUrl: null,
      options: {},
    });

    expect(result.provider).toBe("runway");
    expect(result.runStatus).toBe("succeeded");
    expect(result.playbackUrl).toContain("mux.local");
    expect(result.thumbnailUrl).toBeTruthy();
    expect(result.posterUrl).toBeTruthy();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });
});
