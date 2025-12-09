import { beforeAll, describe, expect, it } from "vitest";

import {
  createAblyTokenRequest,
  publishAblyMessage,
  resetAblyRestConfig,
} from "@/adapters/realtime/ably/rest";
import { loadEnvFromFile } from "../../utils/env";

loadEnvFromFile(".env.local");

const hasCredentials = Boolean(process.env.ABLY_API_KEY && process.env.ABLY_API_KEY.includes(":"));

(hasCredentials ? describe : describe.skip)("Ably REST integration", () => {
  beforeAll(() => {
    resetAblyRestConfig();
  });

  it("creates a token request", async () => {
    const capabilities = JSON.stringify({ "smoke:ably": ["publish"] });
    const token = await createAblyTokenRequest({
      clientId: `smoke-${Date.now()}`,
      ttl: 60_000,
      capability: capabilities,
    });

    expect(token).not.toBeNull();
    expect(token?.token).toBeTruthy();
  });

  it(
    "publishes a message",
    async () => {
      const channel = `smoke:ably:${Date.now()}`;
      const ok = await publishAblyMessage(channel, "smoke-test", { ts: Date.now() });
      expect(ok).toBe(true);
    },
    15_000,
  );
});
