import "server-only";

import { getStripeConfig } from "./config";
import { getPlanByCode, listPlans, upsertPlan } from "./service";
import type { BillingPlan, WalletOwnerType } from "./service";

const DEFAULT_USER_COMPUTE = 500_000;
const DEFAULT_USER_STORAGE = 15 * 1024 * 1024 * 1024; // 15 GB
const DEFAULT_CAPSULE_COMPUTE = 1_000_000;
const DEFAULT_CAPSULE_STORAGE = 40 * 1024 * 1024 * 1024; // 40 GB

type PlanTemplate = {
  code: string;
  scope: WalletOwnerType;
  name: string;
  description: string;
  priceCents: number | null;
  billingInterval: "monthly" | "yearly";
  includedCompute: number;
  includedStorageBytes: number;
  stripePriceId: string | null;
};

function buildPlanTemplates(): PlanTemplate[] {
  const stripe = getStripeConfig();
  return [
    {
      code: "personal_default",
      scope: "user",
      name: "Personal",
      description: "Personal subscription placeholder tier",
      priceCents: null,
      billingInterval: "monthly",
      includedCompute: DEFAULT_USER_COMPUTE,
      includedStorageBytes: DEFAULT_USER_STORAGE,
      stripePriceId: stripe.pricePersonal,
    },
    {
      code: "capsule_default",
      scope: "capsule",
      name: "Capsule",
      description: "Capsule upgrade placeholder tier",
      priceCents: null,
      billingInterval: "monthly",
      includedCompute: DEFAULT_CAPSULE_COMPUTE,
      includedStorageBytes: DEFAULT_CAPSULE_STORAGE,
      stripePriceId: stripe.priceCapsule,
    },
  ];
}

export async function ensureDefaultPlans(): Promise<void> {
  const templates = buildPlanTemplates();
  for (const template of templates) {
    await upsertPlan({
      code: template.code,
      scope: template.scope,
      name: template.name,
      description: template.description,
      priceCents: template.priceCents,
      billingInterval: template.billingInterval,
      includedCompute: template.includedCompute,
      includedStorageBytes: template.includedStorageBytes,
      stripePriceId: template.stripePriceId,
      active: true,
      features: { tier: template.code, feature_tier: "default", model_tier: "standard" },
    });
  }
}

export async function resolvePlanForScope(
  scope: WalletOwnerType,
  code?: string | null,
): Promise<BillingPlan | null> {
  await ensureDefaultPlans();
  if (code) {
    const byCode = await getPlanByCode(code);
    if (byCode) return byCode;
  }
  const plans = await listPlans(scope);
  return plans[0] ?? null;
}
