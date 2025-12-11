export type BillingPlanSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  billingInterval: "monthly" | "yearly";
  includedCompute: number;
  includedStorageBytes: number;
  stripePriceId: string | null;
  features: Record<string, unknown>;
};

export type PlanDisplay = {
  plan: BillingPlanSummary;
  priceLabel: string;
  tagline: string;
  allowances: string[];
  featureTier: string | null;
  recommended: boolean;
  badge: string | null;
};

const PLAN_COPY: Record<
  string,
  { tagline: string; badge?: string | null; recommended?: boolean | null }
> = {
  user_free: {
    tagline: "Experiment with Capsules and light monthly usage.",
    badge: "Included",
  },
  user_creator: {
    tagline: "For weekly play, publishing, and growing channels.",
    badge: "Recommended",
    recommended: true,
  },
  user_pro: {
    tagline: "Serious leagues and automated content workflows.",
  },
  user_studio: {
    tagline: "Studios and teams using Capsules every day.",
    badge: "Teams",
  },
  personal_default: {
    tagline: "Personal subscription placeholder tier.",
  },
  capsule_default: {
    tagline: "Upgrade a capsule with dedicated compute and storage.",
  },
};

function titleCase(value: string): string {
  if (!value) return value;
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function currencyFormatter(currency: string, amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    const rounded = gb >= 10 ? Math.round(gb) : Number(gb.toFixed(1));
    return `${rounded} GB`;
  }
  const mb = bytes / (1024 * 1024);
  const roundedMb = mb >= 10 ? Math.round(mb) : Number(mb.toFixed(1));
  return `${roundedMb} MB`;
}

export function formatComputeUnits(units: number): string {
  if (!Number.isFinite(units) || units <= 0) return "0 units";
  return `${new Intl.NumberFormat().format(Math.floor(units))} units`;
}

export function resolveFeatureTier(plan: BillingPlanSummary): string | null {
  const featureTier =
    typeof plan.features?.["feature_tier"] === "string"
      ? (plan.features["feature_tier"] as string)
      : typeof plan.features?.["featureTier"] === "string"
        ? (plan.features["featureTier"] as string)
        : null;
  return featureTier ? featureTier.toLowerCase() : null;
}

export function planPriceLabel(plan: BillingPlanSummary): string {
  if (plan.priceCents === null) return "Contact sales";
  if (plan.priceCents === 0) return "Free";
  const amount = plan.priceCents / 100;
  const suffix = plan.billingInterval === "yearly" ? "/yr" : "/mo";
  return `${currencyFormatter(plan.currency, amount)}${suffix}`;
}

function resolvePlanCopy(plan: BillingPlanSummary): {
  tagline: string;
  badge: string | null;
  recommended: boolean;
} {
  const copy = PLAN_COPY[plan.code] ?? null;
  const fallbackTagline =
    plan.description && plan.description.trim().length
      ? plan.description.trim()
      : "Flexible Capsules credits for AI, ladders, and storage.";
  return {
    tagline: copy?.tagline ?? fallbackTagline,
    badge: copy?.badge ?? null,
    recommended: Boolean(copy?.recommended),
  };
}

export function buildPlanDisplay(plan: BillingPlanSummary): PlanDisplay {
  const featureTier = resolveFeatureTier(plan);
  const copy = resolvePlanCopy(plan);
  const allowances = [
    `${formatComputeUnits(plan.includedCompute)} per month`,
    `${formatStorageBytes(plan.includedStorageBytes)} storage included`,
  ];
  if (featureTier) {
    allowances.push(`${titleCase(featureTier)} feature tier unlocked`);
  }
  return {
    plan,
    priceLabel: planPriceLabel(plan),
    tagline: copy.tagline,
    allowances,
    featureTier,
    recommended: copy.recommended,
    badge: copy.badge ?? null,
  };
}

export function sortPlansForDisplay(plans: BillingPlanSummary[]): PlanDisplay[] {
  return plans
    .map((plan) => buildPlanDisplay(plan))
    .sort((a, b) => {
      const priceA = a.plan.priceCents ?? Number.MAX_SAFE_INTEGER;
      const priceB = b.plan.priceCents ?? Number.MAX_SAFE_INTEGER;
      if (priceA !== priceB) return priceA - priceB;
      return a.plan.name.localeCompare(b.plan.name);
    });
}
