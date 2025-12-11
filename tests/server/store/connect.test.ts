import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/billing/config", () => ({
  getStripeConfig: vi.fn(),
}));

vi.mock("@/server/billing/stripe", () => ({
  getStripeClient: vi.fn(),
}));

vi.mock("@/server/store/repository", () => ({
  getConnectAccountForCapsule: vi.fn(),
  upsertConnectAccount: vi.fn(),
}));

import { getStripeConfig } from "@/server/billing/config";
import { getStripeClient } from "@/server/billing/stripe";
import { resolveConnectCharge } from "@/server/store/connect";
import { getConnectAccountForCapsule, upsertConnectAccount } from "@/server/store/repository";

const baseConfig = {
  secretKey: "sk_test",
  webhookSecret: null,
  storeWebhookSecret: null,
  pricePersonal: null,
  priceCapsule: null,
  priceCreator: null,
  pricePro: null,
  priceStudio: null,
  connectEnabled: true,
  connectRequireAccount: false,
  platformFeeBasisPoints: 1000,
};

describe("store connect helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getStripeConfig).mockReturnValue(baseConfig as never);
    vi.mocked(getStripeClient).mockReturnValue({
      accounts: { retrieve: vi.fn() },
    } as never);
    vi.mocked(upsertConnectAccount).mockImplementation(async (payload) => ({
      id: "sca-1",
      capsuleId: payload.capsuleId,
      stripeAccountId: payload.stripeAccountId,
      chargesEnabled: Boolean(payload.chargesEnabled),
      payoutsEnabled: Boolean(payload.payoutsEnabled),
      detailsSubmitted: Boolean(payload.detailsSubmitted),
      requirements: payload.requirements ?? {},
      metadata: payload.metadata ?? {},
      createdAt: "",
      updatedAt: "",
    }));
  });

  it("uses destination charges when connect account is onboarded", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "acct_123",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      requirements: {},
      metadata: {},
      email: null,
      type: "express",
    });
    vi.mocked(getStripeClient).mockReturnValue({ accounts: { retrieve } } as never);
    vi.mocked(getConnectAccountForCapsule).mockResolvedValue({
      id: "sca-1",
      capsuleId: "cap-1",
      stripeAccountId: "acct_123",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      requirements: {},
      metadata: {},
      createdAt: "",
      updatedAt: "",
    });
    vi.mocked(getStripeConfig).mockReturnValue({ ...baseConfig, connectRequireAccount: true } as never);

    const result = await resolveConnectCharge("cap-1", 5000);
    expect(result.useConnect).toBe(true);
    expect(result.destinationAccountId).toBe("acct_123");
    expect(result.applicationFeeAmount).toBe(500);
    expect(retrieve).toHaveBeenCalledWith("acct_123");
    expect(upsertConnectAccount).toHaveBeenCalledWith(
      expect.objectContaining({ capsuleId: "cap-1", stripeAccountId: "acct_123" }),
    );
  });

  it("falls back to platform payments when no connect account is stored", async () => {
    vi.mocked(getConnectAccountForCapsule).mockResolvedValue(null);
    vi.mocked(getStripeConfig).mockReturnValue({ ...baseConfig, connectRequireAccount: false } as never);

    const result = await resolveConnectCharge("cap-2", 4200);
    expect(result.useConnect).toBe(false);
    expect(result.destinationAccountId).toBeNull();
    expect(result.applicationFeeAmount).toBe(0);
    expect(result.blockedReason).toBeUndefined();
    expect(getStripeClient).not.toHaveBeenCalled();
  });

  it("blocks checkout when connect is required but missing", async () => {
    vi.mocked(getConnectAccountForCapsule).mockResolvedValue(null);
    vi.mocked(getStripeConfig).mockReturnValue({ ...baseConfig, connectRequireAccount: true } as never);

    const result = await resolveConnectCharge("cap-3", 3000);
    expect(result.useConnect).toBe(false);
    expect(result.blockedReason?.code).toBe("seller_connect_missing");
  });
});
