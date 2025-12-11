import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/payload", () => ({
  ensureUserFromRequest: vi.fn(),
}));
vi.mock("@/server/billing/plans", () => ({
  ensureDefaultPlans: vi.fn(),
}));
vi.mock("@/server/billing/service", () => ({
  listPlans: vi.fn(),
  getActiveSubscriptionForWallet: vi.fn(),
}));
vi.mock("@/server/billing/entitlements", () => ({
  resolveWalletContext: vi.fn(),
}));
vi.mock("@/server/capsules/domain/common", () => ({
  requireCapsuleOwnership: vi.fn(),
}));

import { GET as plansGet } from "@/app/api/billing/plans/route";
import { GET as walletGet } from "@/app/api/billing/wallet/route";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { ensureDefaultPlans } from "@/server/billing/plans";
import {
  listPlans,
  getActiveSubscriptionForWallet,
  type BillingPlan,
  type SubscriptionRecord,
} from "@/server/billing/service";
import { resolveWalletContext } from "@/server/billing/entitlements";

describe("billing api routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(ensureUserFromRequest).mockResolvedValue("user-1" as Awaited<ReturnType<typeof ensureUserFromRequest>>);
  });

  it("returns plan ids, features, and allowances", async () => {
    const personalPlan: BillingPlan = {
      id: "plan_personal",
      code: "user_creator",
      scope: "user",
      name: "Creator",
      description: "Creator plan",
      priceCents: 1500,
      currency: "usd",
      billingInterval: "monthly",
      includedCompute: 300_000,
      includedStorageBytes: 1024 * 1024 * 1024 * 50,
      priorityTier: null,
      features: { feature_tier: "creator" },
      active: true,
      stripePriceId: "price_creator",
    };
    const capsulePlan: BillingPlan = {
      id: "plan_capsule",
      code: "capsule_default",
      scope: "capsule",
      name: "Capsule",
      description: null,
      priceCents: 5000,
      currency: "usd",
      billingInterval: "monthly",
      includedCompute: 1_000_000,
      includedStorageBytes: 10_000,
      priorityTier: null,
      features: { feature_tier: "default" },
      active: true,
      stripePriceId: "price_capsule",
    };

    vi.mocked(ensureDefaultPlans).mockResolvedValue(undefined);
    vi.mocked(listPlans).mockImplementation(async (scope: "user" | "capsule") =>
      scope === "user" ? [personalPlan] : [capsulePlan],
    );

    const res = await plansGet(new Request("http://localhost/api/billing/plans"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { personal: Array<Record<string, unknown>>; capsule: Array<Record<string, unknown>> };
    expect(body.personal[0]?.id).toBe("plan_personal");
    expect(body.personal[0]?.features).toEqual({ feature_tier: "creator" });
    expect(body.capsule[0]?.includedCompute).toBe(1_000_000);
  });

  it("returns wallet and subscription details", async () => {
    vi.mocked(resolveWalletContext).mockResolvedValue({
      wallet: { id: "wallet-1", ownerType: "user", ownerId: "user-1", displayName: "Test User", createdAt: "", updatedAt: "" },
      balance: {
        walletId: "wallet-1",
        computeGranted: 1000,
        computeUsed: 200,
        storageGranted: 10_000,
        storageUsed: 500,
        featureTier: "creator",
        modelTier: "standard",
        periodStart: "2025-01-01T00:00:00.000Z",
        periodEnd: "2025-02-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
      },
      bypass: false,
    });
    const subscription: SubscriptionRecord = {
      id: "sub-1",
      walletId: "wallet-1",
      planId: "plan_personal",
      status: "active",
      currentPeriodEnd: "2025-02-01T00:00:00.000Z",
      cancelAtPeriodEnd: false,
      stripeSubscriptionId: null,
      stripeCustomerId: null,
      metadata: {},
      createdAt: "",
      updatedAt: "",
    };
    vi.mocked(getActiveSubscriptionForWallet).mockResolvedValue(subscription);

    const res = await walletGet(new Request("http://localhost/api/billing/wallet"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { wallet: { id: string }; balance: { computeGranted: number }; subscription: { planId: string | null } | null };
    expect(body.wallet.id).toBe("wallet-1");
    expect(body.balance.computeGranted).toBe(1000);
    expect(body.subscription?.planId).toBe("plan_personal");
  });
});
