import "server-only";

import { isAdminRequest } from "@/server/auth/payload";
import type { BillingPlan, WalletBalance, WalletOwnerType, WalletRecord } from "./service";
import {
  applyBalanceDelta,
  ensureBalance,
  ensureWallet,
  recordFundingIfMissing,
  recordTransaction,
} from "./service";

const DEFAULT_DEV_COMPUTE_GRANT = 1_000_000;
const DEFAULT_DEV_STORAGE_GRANT = 50 * 1024 * 1024 * 1024; // 50 GB

function envFlagEnabled(name: string): boolean {
  const raw =
    typeof process !== "undefined" && process.env && typeof process.env[name] === "string"
      ? (process.env[name] as string)
      : "";
  const normalized = raw.trim().toLowerCase();
  if (!normalized.length) return false;
  return ["1", "true", "yes", "on"].includes(normalized);
}

export class EntitlementError extends Error {
  constructor(
    public code: "insufficient_compute" | "insufficient_storage" | "billing_disabled",
    message: string,
    public status: number = 402,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type WalletContext = {
  wallet: WalletRecord;
  balance: WalletBalance;
  bypass: boolean;
};

const FEATURE_TIER_RANK: Record<string, number> = {
  starter: 1,
  free: 1,
  plus: 2,
  creator: 2,
  default: 2,
  pro: 3,
  captain: 3,
  studio: 4,
  legend: 4,
  ultra: 5,
};

function tierRank(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.trim().toLowerCase();
  return FEATURE_TIER_RANK[normalized] ?? 0;
}

export async function shouldBypassBilling(
  req: Request | null | undefined,
  supabaseUserId: string | null | undefined,
): Promise<boolean> {
  if (envFlagEnabled("BILLING_BYPASS_ALL")) return true;

  const devFlagDefined =
    typeof process !== "undefined" &&
    process.env &&
    Object.prototype.hasOwnProperty.call(process.env, "BILLING_DEV_BYPASS");
  if (devFlagDefined ? envFlagEnabled("BILLING_DEV_BYPASS") : process.env.NODE_ENV !== "production") {
    return true;
  }

  if (supabaseUserId && req) {
    try {
      const admin = await isAdminRequest(req, {}, supabaseUserId);
      if (admin) return true;
    } catch (error) {
      console.warn("billing.bypass_admin_check_failed", error);
    }
  }

  return false;
}

async function applyDevCreditsIfNeeded(
  ctx: WalletContext,
  options: { grantCompute?: boolean; grantStorage?: boolean } = {},
): Promise<WalletContext> {
  if (!ctx.bypass) return ctx;

  const grantCompute = options.grantCompute ?? true;
  const grantStorage = options.grantStorage ?? true;

  let nextBalance = ctx.balance;
  let updated = false;

  if (grantCompute && nextBalance.computeGranted < DEFAULT_DEV_COMPUTE_GRANT) {
    const delta = DEFAULT_DEV_COMPUTE_GRANT - nextBalance.computeGranted;
    await recordTransaction({
      walletId: ctx.wallet.id,
      type: "bonus",
      metric: "compute",
      amount: delta,
      description: "Development credit",
      sourceType: "dev_bypass",
    });
    nextBalance = await applyBalanceDelta({
      walletId: ctx.wallet.id,
      computeGrantDelta: delta,
    });
    updated = true;
  }

  if (grantStorage && nextBalance.storageGranted < DEFAULT_DEV_STORAGE_GRANT) {
    const delta = DEFAULT_DEV_STORAGE_GRANT - nextBalance.storageGranted;
    await recordTransaction({
      walletId: ctx.wallet.id,
      type: "bonus",
      metric: "storage",
      amount: delta,
      description: "Development credit",
      sourceType: "dev_bypass",
    });
    nextBalance = await applyBalanceDelta({
      walletId: ctx.wallet.id,
      storageGrantDelta: delta,
    });
    updated = true;
  }

  if (!updated) return ctx;
  return { ...ctx, balance: nextBalance };
}

export async function resolveWalletContext(params: {
  ownerType: WalletOwnerType;
  ownerId: string;
  displayName?: string | null;
  supabaseUserId?: string | null;
  req?: Request | null;
  ensureDevCredits?: boolean;
}): Promise<WalletContext> {
  const bypass = await shouldBypassBilling(params.req, params.supabaseUserId ?? null);
  const wallet = await ensureWallet({
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    displayName: params.displayName ?? null,
  });
  const balance = await ensureBalance(wallet.id);
  const context: WalletContext = { wallet, balance, bypass };
  if (params.ensureDevCredits) {
    return applyDevCreditsIfNeeded(context);
  }
  return context;
}

export async function chargeUsage(params: {
  wallet: WalletRecord;
  balance?: WalletBalance;
  metric: "compute" | "storage";
  amount: number;
  reason?: string | null;
  bypass?: boolean;
}): Promise<WalletBalance> {
  const amount = Math.max(0, Math.floor(params.amount));
  const currentBalance = params.balance ?? (await ensureBalance(params.wallet.id));
  if (params.bypass) {
    return currentBalance;
  }
  if (!amount) return currentBalance;

  const available =
    params.metric === "compute"
      ? currentBalance.computeGranted - currentBalance.computeUsed
      : currentBalance.storageGranted - currentBalance.storageUsed;

  if (available < amount) {
    throw new EntitlementError(
      params.metric === "compute" ? "insufficient_compute" : "insufficient_storage",
      params.metric === "compute"
        ? "Not enough compute credits remain for this action."
        : "Not enough storage remains for this action.",
      402,
      {
        metric: params.metric,
        requiredAmount: amount,
        available,
      },
    );
  }

  const balancePatch: {
    walletId: string;
    computeUsedDelta?: number;
    storageUsedDelta?: number;
  } = { walletId: params.wallet.id };
  if (params.metric === "compute") balancePatch.computeUsedDelta = amount;
  if (params.metric === "storage") balancePatch.storageUsedDelta = amount;

  const nextBalance = await applyBalanceDelta(balancePatch);

  await recordTransaction({
    walletId: params.wallet.id,
    type: "usage",
    metric: params.metric,
    amount: -amount,
    description: params.reason ?? "Usage",
    sourceType: "usage",
    metadata: params.reason ? { reason: params.reason } : {},
  });

  return nextBalance;
}

export function ensureFeatureAccess(options: {
  balance: WalletBalance;
  bypass?: boolean;
  requiredTier?: string | null;
  featureName?: string;
}): void {
  if (options.bypass) return;
  const required = options.requiredTier ?? "starter";
  const currentTierRank = tierRank(options.balance.featureTier);
  const requiredRank = tierRank(required);

  // If a tier isn't set but allowances exist, treat it as sufficient for now.
  if (!options.balance.featureTier && options.balance.computeGranted > 0) {
    return;
  }

  if (currentTierRank < requiredRank) {
    throw new EntitlementError(
      "billing_disabled",
      `Upgrade required to access ${options.featureName ?? "this feature"}.`,
      402,
      { requiredTier: required, currentTier: options.balance.featureTier ?? null },
    );
  }
}

function computePeriodEnd(startIso: string, interval: "monthly" | "yearly"): string {
  const start = new Date(startIso);
  const end = new Date(start);
  if (interval === "yearly") {
    end.setFullYear(start.getFullYear() + 1);
  } else {
    end.setMonth(start.getMonth() + 1);
  }
  return end.toISOString();
}

export async function grantPlanAllowances(params: {
  walletId: string;
  plan: BillingPlan;
  sourceType: string;
  sourceId?: string | null;
  reason?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<WalletBalance> {
  const nowIso = new Date().toISOString();
  const periodStart = params.periodStart ?? nowIso;
  const periodEnd = params.periodEnd ?? computePeriodEnd(periodStart, params.plan.billingInterval);

  const computeGrant = Math.max(0, Math.floor(params.plan.includedCompute ?? 0));
  const storageGrant = Math.max(0, Math.floor(params.plan.includedStorageBytes ?? 0));
  const featureTier =
    params.plan.features && typeof params.plan.features["feature_tier"] === "string"
      ? (params.plan.features["feature_tier"] as string)
      : null;
  const modelTier =
    params.plan.features && typeof params.plan.features["model_tier"] === "string"
      ? (params.plan.features["model_tier"] as string)
      : null;

  let balance = await ensureBalance(params.walletId);

  if (computeGrant) {
    await recordFundingIfMissing({
      walletId: params.walletId,
      metric: "compute",
      amount: computeGrant,
      description: params.reason ?? "Subscription credit",
      sourceType: `${params.sourceType}:compute`,
      sourceId: params.sourceId ?? params.plan.id,
      metadata: { planId: params.plan.id, planCode: params.plan.code },
      computeGrantDelta: computeGrant,
      featureTier,
      modelTier,
      periodStart,
      periodEnd,
    });
  }

  if (storageGrant) {
    await recordFundingIfMissing({
      walletId: params.walletId,
      metric: "storage",
      amount: storageGrant,
      description: params.reason ?? "Subscription credit",
      sourceType: `${params.sourceType}:storage`,
      sourceId: params.sourceId ?? params.plan.id,
      metadata: { planId: params.plan.id, planCode: params.plan.code },
      storageGrantDelta: storageGrant,
      featureTier,
      modelTier,
      periodStart,
      periodEnd,
    });
  }

  balance = await applyBalanceDelta({
    walletId: params.walletId,
    periodStart,
    periodEnd,
    featureTier,
    modelTier,
  });

  return balance;
}
