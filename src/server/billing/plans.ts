import "server-only";

import { getStripeConfig } from "./config";
import { getPlanByCode, listPlans, upsertPlan } from "./service";
import type { BillingPlan, WalletOwnerType } from "./service";

const BYTES_IN_GB = 1024 * 1024 * 1024;

// Compute grants are scaled from the marketing credit counts to match our internal usage pricing
// while keeping raw numbers hidden from end users.
const USER_PLAN_PRESETS = {
  starter: { compute: 30_000, storage: 10 * BYTES_IN_GB, featureTier: "starter" },
  plus: { compute: 250_000, storage: 150 * BYTES_IN_GB, featureTier: "plus" },
  pro: { compute: 750_000, storage: 600 * BYTES_IN_GB, featureTier: "pro" },
  studio: {
    compute: 1_800_000,
    storage: 2_000 * BYTES_IN_GB,
    featureTier: "legend",
    powerDrop: 300_000,
  },
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
  featureTier?: string | null;
  modelTier?: string | null;
  features?: Record<string, unknown>;
};

function buildPlanTemplates(): PlanTemplate[] {
  const stripe = getStripeConfig();
  return [
    {
      code: "user_free",
      scope: "user",
      name: "Starter",
      description: "Join Capsules, vibe, and try the AI before subscribing.",
      priceCents: 0,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.starter.compute,
      includedStorageBytes: USER_PLAN_PRESETS.starter.storage,
      stripePriceId: null,
      featureTier: USER_PLAN_PRESETS.starter.featureTier,
      modelTier: "standard",
      features: {
        capsuleOwnershipLimit: 1,
        imageQuality: ["low"],
        goLive: false,
        includesVideoGen: false,
      },
    },
    {
      code: "user_creator",
      scope: "user",
      name: "Plus",
      description: "Everything you need to run a real Capsule.",
      priceCents: 1200,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.plus.compute,
      includedStorageBytes: USER_PLAN_PRESETS.plus.storage,
      stripePriceId: stripe.priceCreator,
      featureTier: USER_PLAN_PRESETS.plus.featureTier,
      modelTier: "standard",
      features: {
        capsuleOwnershipLimit: 2,
        imageQuality: ["low", "medium"],
        goLive: true,
        exports: ["pdf", "ppt"],
        includesVideoGen: true,
      },
    },
    {
      code: "user_pro",
      scope: "user",
      name: "Pro",
      description: "For captains and teams that want weekly output.",
      priceCents: 2400,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.pro.compute,
      includedStorageBytes: USER_PLAN_PRESETS.pro.storage,
      stripePriceId: stripe.pricePro,
      featureTier: USER_PLAN_PRESETS.pro.featureTier,
      modelTier: "advanced",
      features: {
        capsuleOwnershipLimit: 3,
        imageQuality: ["low", "medium", "high"],
        goLive: true,
        streamStudio: true,
        moderationAssist: true,
        includesVideoGen: true,
        autoRecaps: true,
        clipSuggestions: true,
      },
    },
    {
      code: "user_studio",
      scope: "user",
      name: "Studio (Legend)",
      description: "A production pipeline that ships content for you.",
      priceCents: 4900,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.studio.compute,
      includedStorageBytes: USER_PLAN_PRESETS.studio.storage,
      stripePriceId: stripe.priceStudio,
      featureTier: USER_PLAN_PRESETS.studio.featureTier,
      modelTier: "premium",
      features: {
        capsuleOwnershipLimit: 4,
        imageQuality: ["low", "medium", "high"],
        goLive: true,
        streamStudio: true,
        powerDrop: USER_PLAN_PRESETS.studio.powerDrop,
        bulkExports: true,
        wikiAdvanced: true,
        includesVideoGen: true,
        creationPriority: true,
      },
    },
    {
      code: "personal_default",
      scope: "user",
      name: "Personal",
      description: "Personal subscription placeholder tier",
      priceCents: null,
      billingInterval: "monthly",
      includedCompute: USER_PLAN_PRESETS.plus.compute,
      includedStorageBytes: USER_PLAN_PRESETS.plus.storage,
      stripePriceId: stripe.pricePersonal,
      featureTier: USER_PLAN_PRESETS.plus.featureTier,
      modelTier: "standard",
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
      template.featureTier ??
      (template.scope === "user"
        ? template.code.startsWith("user_")
          ? template.code.replace("user_", "")
          : "default"
        : "default");

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
      features: {
        tier: template.code,
        feature_tier: featureTier,
        model_tier: template.modelTier ?? "standard",
        ...(template.features ?? {}),
      },
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
