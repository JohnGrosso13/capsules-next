import "server-only";

import { getStripeConfig } from "./config";
import { getPlanByCode, listPlans, upsertPlan } from "./service";
import type { BillingPlan, WalletOwnerType } from "./service";

const BYTES_IN_GB = 1024 * 1024 * 1024;

const USER_PLAN_PRESETS = {
  free: { compute: 50_000, storage: 5 * BYTES_IN_GB, featureTier: "free" },
  creator: { compute: 300_000, storage: 50 * BYTES_IN_GB, featureTier: "creator" },
  pro: { compute: 1_500_000, storage: 200 * BYTES_IN_GB, featureTier: "pro" },
  studio: { compute: 5_000_000, storage: 1_000 * BYTES_IN_GB, featureTier: "studio" },
} as const;

const DEFAULT_CAPSULE_COMPUTE = 1_000_000;
const DEFAULT_CAPSULE_STORAGE = 40 * BYTES_IN_GB;

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
      code: "user_free",
      scope: "user",
      name: "Free",
      description: "Try Capsules with light monthly usage.",
      priceCents: 0,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.free.compute,
      includedStorageBytes: USER_PLAN_PRESETS.free.storage,
      stripePriceId: null,
    },
    {
      code: "user_creator",
      scope: "user",
      name: "Creator",
      description: "For regular players and creators.",
      priceCents: 1500,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.creator.compute,
      includedStorageBytes: USER_PLAN_PRESETS.creator.storage,
      stripePriceId: stripe.priceCreator,
    },
    {
      code: "user_pro",
      scope: "user",
      name: "Pro",
      description: "Run serious leagues and content workflows.",
      priceCents: 3900,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.pro.compute,
      includedStorageBytes: USER_PLAN_PRESETS.pro.storage,
      stripePriceId: stripe.pricePro,
    },
    {
      code: "user_studio",
      scope: "user",
      name: "Studio",
      description: "For studios, teams, and heavy daily use.",
      priceCents: 9900,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.studio.compute,
      includedStorageBytes: USER_PLAN_PRESETS.studio.storage,
      stripePriceId: stripe.priceStudio,
    },
    {
      code: "personal_default",
      scope: "user",
      name: "Personal",
      description: "Personal subscription placeholder tier",
      priceCents: null,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.creator.compute,
      includedStorageBytes: USER_PLAN_PRESETS.creator.storage,
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
    const featureTier =
      template.scope === "user"
        ? template.code.startsWith("user_")
          ? template.code.replace("user_", "")
          : "default"
        : "default";

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
      features: { tier: template.code, feature_tier: featureTier, model_tier: "standard" },
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
