import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/payload", () => ({
  ensureUserFromRequest: vi.fn(),
}));
vi.mock("@/server/capsules/domain/common", () => ({
  requireCapsule: vi.fn(),
}));
vi.mock("@/server/billing/entitlements", () => ({
  resolveWalletContext: vi.fn(),
  chargeUsage: vi.fn(),
  EntitlementError: class EntitlementError extends Error {
    constructor(
      public code: string,
      message: string,
      public status = 402,
      public details?: Record<string, unknown>,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/server/billing/service", () => ({
  recordFundingIfMissing: vi.fn(),
}));
vi.mock("@/server/billing/platform", () => ({
  creditPlatformCut: vi.fn(),
}));

import { POST as passPost } from "@/app/api/capsules/pass/route";
import { POST as powerPost } from "@/app/api/capsules/power/route";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { requireCapsule } from "@/server/capsules/domain/common";
import { resolveWalletContext, chargeUsage, EntitlementError } from "@/server/billing/entitlements";
import { recordFundingIfMissing } from "@/server/billing/service";
import { creditPlatformCut } from "@/server/billing/platform";

const mockWalletContext = (id: string) => ({
  wallet: { id, ownerType: "user" as const, ownerId: id, displayName: null, createdAt: "", updatedAt: "" },
  balance: {
    walletId: id,
    computeGranted: 10_000,
    computeUsed: 0,
    storageGranted: 0,
    storageUsed: 0,
    featureTier: null,
    modelTier: null,
    periodStart: null,
    periodEnd: null,
    updatedAt: "",
  },
  bypass: false,
});

describe("capsule pass & power routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ensureUserFromRequest).mockResolvedValue("user-1" as Awaited<ReturnType<typeof ensureUserFromRequest>>);
    vi.mocked(requireCapsule).mockResolvedValue({
      ownerId: "123e4567-e89b-12d3-a456-426614174999",
      capsule: { id: "123e4567-e89b-12d3-a456-426614174000", name: "Test Capsule" },
    } as Awaited<ReturnType<typeof requireCapsule>>);
    vi.mocked(resolveWalletContext).mockImplementation(async ({ ownerId }) =>
      mockWalletContext(`wallet-${ownerId}`),
    );
    vi.mocked(chargeUsage).mockResolvedValue(mockWalletContext("wallet-user-1").balance);
    vi.mocked(recordFundingIfMissing).mockResolvedValue(true);
    vi.mocked(creditPlatformCut).mockResolvedValue(true);
  });

  it("successfully processes a Capsule Pass and credits founder + platform", async () => {
    const res = await passPost(
      new Request("http://localhost/api/capsules/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capsuleId: "123e4567-e89b-12d3-a456-426614174000", amountUsd: 5 }),
      }),
    );
    const body = (await res.json()) as { founderCredits: number; platformCutCredits: number; grossCredits: number; error?: string; message?: string };
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.grossCredits).toBeGreaterThan(0);
    expect(body.founderCredits).toBe(Math.floor(body.grossCredits * 0.8));
    expect(body.platformCutCredits).toBe(body.grossCredits - body.founderCredits);
    expect(recordFundingIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-123e4567-e89b-12d3-a456-426614174999",
        amount: body.founderCredits,
        sourceType: "capsule_pass",
      }),
    );
    expect(creditPlatformCut).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: body.platformCutCredits,
        sourceType: "capsule_pass_platform",
      }),
    );
  });

  it("returns entitlement error when buyer lacks credits", async () => {
    vi.mocked(chargeUsage).mockRejectedValueOnce(new EntitlementError("insufficient_compute", "Not enough credits", 402));
    const res = await passPost(
      new Request("http://localhost/api/capsules/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capsuleId: "123e4567-e89b-12d3-a456-426614174000", amountUsd: 5 }),
      }),
    );
    const body = (await res.json()) as { error?: string; message?: string };
    expect(res.status, JSON.stringify(body)).toBe(402);
  });

  it("processes Capsule Power top-up and credits capsule + platform", async () => {
    const res = await powerPost(
      new Request("http://localhost/api/capsules/power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capsuleId: "123e4567-e89b-12d3-a456-426614174001", amountUsd: 10 }),
      }),
    );
    const body = (await res.json()) as { capsuleCredits: number; platformCutCredits: number; grossCredits: number; error?: string; message?: string };
    expect(res.status, JSON.stringify(body)).toBe(200);
    expect(body.capsuleCredits).toBe(Math.floor(body.grossCredits * 0.8));
    expect(body.platformCutCredits).toBe(body.grossCredits - body.capsuleCredits);
    expect(recordFundingIfMissing).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-123e4567-e89b-12d3-a456-426614174001",
        amount: body.capsuleCredits,
        sourceType: "capsule_power",
      }),
    );
    expect(creditPlatformCut).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: body.platformCutCredits,
        sourceType: "capsule_power_platform",
      }),
    );
  });
});
