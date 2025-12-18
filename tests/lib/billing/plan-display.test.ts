import { describe, expect, it } from "vitest";

import {
  buildPlanDisplay,
  formatComputeUnits,
  formatStorageBytes,
  sortPlansForDisplay,
  type BillingPlanSummary,
} from "@/lib/billing/plan-display";

const basePlan: BillingPlanSummary = {
  id: "plan_creator",
  code: "user_creator",
  name: "Plus",
  description: "Plus tier",
  priceCents: 1200,
  currency: "usd",
  billingInterval: "monthly",
  includedCompute: 250_000,
  includedStorageBytes: 150 * 1024 * 1024 * 1024,
  stripePriceId: "price_creator",
  features: { feature_tier: "plus" },
};

describe("plan display helpers", () => {
  it("uses curated allowances and feature tier for marketing plans", () => {
    const display = buildPlanDisplay(basePlan);
    expect(display.priceLabel.toLowerCase()).toContain("12");
    expect(display.allowances.some((line) => line.toLowerCase().includes("expanded credits"))).toBe(
      true,
    );
    expect(
      display.allowances.some((line) =>
        line.includes("Capsule upgrades are community-funded with Capsule Power"),
      ),
    ).toBe(true);
    expect(display.featureTier).toBe("plus");
  });

  it("formats compute and storage helpers", () => {
    expect(formatComputeUnits(1200)).toBe("1,200 units");
    expect(formatStorageBytes(2 * 1024 * 1024 * 1024)).toBe("2 GB");
  });

  it("sorts plans by price then name", () => {
    const plans: BillingPlanSummary[] = [
      { ...basePlan, id: "plan_free", code: "user_free", name: "Free", priceCents: 0 },
      basePlan,
      { ...basePlan, id: "plan_pro", code: "user_pro", name: "Pro", priceCents: 2400 },
    ];
    const sorted = sortPlansForDisplay(plans);
    expect(sorted[0]?.plan.code).toBe("user_free");
    expect(sorted[1]?.plan.code).toBe("user_creator");
    expect(sorted[2]?.plan.code).toBe("user_pro");
  });
});
