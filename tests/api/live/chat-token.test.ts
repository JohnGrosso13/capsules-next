import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";

import { GET as liveChatTokenGet } from "@/app/api/live/chat/token/route";

let mockUserId: string | null = "user-1";
let mockAuthPayload: unknown = {
  provider: "ably",
  token: { token: "abc123", keyName: "test.key", capability: "{}", timestamp: Date.now(), nonce: "n" },
  environment: "sandbox",
};

vi.mock("@/lib/auth/payload", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/payload")>();
  return {
    ...actual,
    ensureUserFromRequest: vi.fn(async () => mockUserId),
  };
});

vi.mock("@/services/realtime/live-chat", () => ({
  createCapsuleLiveChatAuth: vi.fn(async () => mockAuthPayload),
}));

const buildRequest = (capsuleId: string) =>
  new Request(`https://example.com/api/live/chat/token?capsuleId=${encodeURIComponent(capsuleId)}`);

describe("live chat token API", () => {
  beforeEach(() => {
    mockUserId = "user-1";
    mockAuthPayload = {
      provider: "ably",
      token: { token: "abc123", keyName: "test.key", capability: "{}", timestamp: Date.now(), nonce: "n" },
      environment: "sandbox",
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("rejects unauthenticated requests", async () => {
    mockUserId = null;
    const response = await liveChatTokenGet(buildRequest(crypto.randomUUID()));
    expect(response.status).toBe(401);
  });

  it("validates capsuleId", async () => {
    const response = await liveChatTokenGet(buildRequest("not-a-uuid"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.message || body.error || "").toContain("capsuleId");
  });

  it("returns 503 when realtime is disabled", async () => {
    const { createCapsuleLiveChatAuth } = await import("@/services/realtime/live-chat");
    (createCapsuleLiveChatAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const response = await liveChatTokenGet(buildRequest(crypto.randomUUID()));
    expect(response.status).toBe(503);
  });

  it("returns token payload for authenticated users", async () => {
    const capsuleId = crypto.randomUUID();
    const response = await liveChatTokenGet(buildRequest(capsuleId));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { provider: string; token: unknown; environment?: string | null };
    expect(body.provider).toBe("ably");
    expect(body.token).toMatchObject({ token: expect.any(String) });
    expect(body.environment).toBe("sandbox");
  });
});
