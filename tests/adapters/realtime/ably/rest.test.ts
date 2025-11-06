import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAblyTokenRequest,
  publishAblyMessage,
  resetAblyRestConfig,
} from "@/adapters/realtime/ably/rest";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetAblyRestConfig();
});

afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe("Ably REST Adapter", () => {
  it("skips publishing when ABLY_API_KEY is missing", async () => {
    delete process.env.ABLY_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const result = await publishAblyMessage("test-channel", "event", { hello: "world" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it("publishes messages with basic auth header", async () => {
    process.env.ABLY_API_KEY = "test-key:super-secret";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 }),
    );

    const result = await publishAblyMessage("chat:room", "chat.message", { message: "hi" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://rest.ably.io/channels/chat%3Aroom/messages");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      "Content-Type": "application/json",
    });
    const body = JSON.parse((init?.body as string) ?? "[]");
    expect(body).toEqual([{ name: "chat.message", data: { message: "hi" } }]);
    expect(result).toBe(true);
  });

  it("uses environment specific host when ABLY_ENVIRONMENT is set", async () => {
    process.env.ABLY_API_KEY = "env-key:secret";
    process.env.ABLY_ENVIRONMENT = "sandbox";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const result = await publishAblyMessage("room", "ping", null);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://rest-sandbox.ably.io/channels/room/messages");
    expect(result).toBe(true);
  });

  it("returns token request payload", async () => {
    process.env.ABLY_API_KEY = "token-key:secret";
    const responsePayload = {
      token: "ablyTokenString",
      keyName: "token-key",
      capability: JSON.stringify({ "channel:*": ["publish"] }),
      issued: Date.now(),
      expires: Date.now() + 60_000,
      clientId: "user-123",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(responsePayload), { status: 200 }),
    );

    const result = await createAblyTokenRequest({
      clientId: "user-123",
      ttl: 60000,
      capability: JSON.stringify({ "channel:*": ["publish"] }),
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe("https://rest.ably.io/keys/token-key/requestToken");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      "Content-Type": "application/json",
    });
    const parsed = JSON.parse((init?.body as string) ?? "{}");
    expect(parsed).toMatchObject({
      clientId: "user-123",
      ttl: 60000,
      capability: JSON.stringify({ "channel:*": ["publish"] }),
      keyName: "token-key",
    });
    expect(typeof parsed.timestamp).toBe("number");
    expect(typeof parsed.nonce).toBe("string");
    expect(result).toEqual({ token: responsePayload, environment: null });
  });

  it("returns null when token request fails", async () => {
    process.env.ABLY_API_KEY = "token-key:secret";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("nope", { status: 500 }));

    const publishResult = await publishAblyMessage("room", "ping", null);
    expect(publishResult).toBe(false);

    const tokenResult = await createAblyTokenRequest({
      clientId: "user-123",
      ttl: 60000,
      capability: "{}",
    });

    expect(tokenResult).toBeNull();
    expect(fetchSpy).toHaveBeenCalled();
  });
});
