import { describe, expect, it, vi, beforeEach } from "vitest";

import * as rateLimitModule from "@/server/rate-limit";
import * as rateLimitConfig from "@/config/rate-limit";
import { resolveClientIp } from "@/server/http/ip";

const successResult: rateLimitModule.RateLimitResult = {
  success: true,
  remaining: 1,
  limit: 5,
  reset: 123,
};

const failureResult: rateLimitModule.RateLimitResult = {
  success: false,
  remaining: 0,
  limit: 5,
  reset: 456,
};

const definition = (name: string): rateLimitModule.RateLimitDefinition => ({
  name,
  limit: 5,
  window: "1 m",
});

describe("checkRateLimits", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the first failing result and stops further checks", async () => {
    const limitMock = vi
      .fn()
      .mockResolvedValueOnce(successResult)
      .mockResolvedValueOnce(failureResult)
      .mockResolvedValue(successResult);
    vi.spyOn(rateLimitConfig, "getRateLimitAdapter").mockReturnValue({
      vendor: "test",
      limit: limitMock,
    });

    const result = await rateLimitModule.checkRateLimits([
      { definition: definition("a"), identifier: "user-1" },
      { definition: definition("b"), identifier: "user-2" },
      { definition: definition("c"), identifier: "user-3" },
    ]);

    expect(result).toEqual(failureResult);
    expect(limitMock).toHaveBeenCalledTimes(2);
    expect(limitMock).toHaveBeenNthCalledWith(1, definition("a"), "user-1");
    expect(limitMock).toHaveBeenNthCalledWith(2, definition("b"), "user-2");
  });

  it("skips empty identifiers and returns null when all succeed", async () => {
    const limitMock = vi.fn().mockResolvedValue(successResult);
    vi.spyOn(rateLimitConfig, "getRateLimitAdapter").mockReturnValue({
      vendor: "test",
      limit: limitMock,
    });

    const result = await rateLimitModule.checkRateLimits([
      { definition: definition("empty"), identifier: "" },
      { definition: definition("spaces"), identifier: "   " },
      { definition: definition("valid"), identifier: "user-3" },
    ]);

    expect(result).toBeNull();
    expect(limitMock).toHaveBeenCalledTimes(1);
    expect(limitMock).toHaveBeenCalledWith(definition("valid"), "user-3");
  });
});

describe("resolveClientIp", () => {
  it("prefers cf-connecting-ip and returns the first value", () => {
    const req = new Request("https://example.com", {
      headers: {
        "cf-connecting-ip": " 1.1.1.1 , 2.2.2.2 ",
        "x-forwarded-for": "9.9.9.9",
      },
    });
    expect(resolveClientIp(req)).toBe("1.1.1.1");
  });

  it("falls back to x-forwarded-for then x-real-ip", () => {
    const forwardedReq = new Request("https://example.com", {
      headers: { "x-forwarded-for": "8.8.8.8, 7.7.7.7" },
    });
    expect(resolveClientIp(forwardedReq)).toBe("8.8.8.8");

    const realIpReq = new Request("https://example.com", {
      headers: { "x-real-ip": "5.5.5.5" },
    });
    expect(resolveClientIp(realIpReq)).toBe("5.5.5.5");
  });

  it("returns null when no IP headers are present", () => {
    const req = new Request("https://example.com");
    expect(resolveClientIp(req)).toBeNull();
  });
});
