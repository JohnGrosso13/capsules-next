import "server-only";

import { getDatabaseAdminClient } from "@/config/database";
import { getPlatformWalletOwnerId } from "@/server/billing/platform";
import { getWalletWithBalance, type WalletBalance } from "@/server/billing/service";

export type EconomyOverview = {
  storeGrossCents: number;
  storePlatformFeeCents: number;
  storePaidPayoutCents: number;
  userSubscriptionCounts: Record<string, number>;
  capsuleSubscriptionCounts: Record<string, number>;
  capsulePassFundingCredits: number;
  capsulePassPlatformCredits: number;
  capsulePowerFundingCredits: number;
  capsulePowerPlatformCredits: number;
  platformWallet: {
    computeGranted: number;
    computeUsed: number;
  } | null;
};

type StoreAggRow = {
  total_gross: number | null;
  total_fee: number | null;
};

type StorePayoutAggRow = {
  total_paid: number | null;
};

type PassAggRow = {
  total_founder: number | null;
  total_platform: number | null;
};

type PlanRow = {
  id: string;
  code: string;
  scope: string;
};

type SubRow = {
  plan_id: string | null;
  status: string;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function fetchEconomyOverview(): Promise<EconomyOverview> {
  const db = getDatabaseAdminClient();

  const [storeAggResult, payoutAggResult, passAggResult, powerAggResult, plansResult, subsResult, platformWallet] =
    await Promise.all([
      db
        .from("store_orders")
        .select<StoreAggRow>("sum(total_cents) as total_gross, sum(fee_cents) as total_fee")
        .eq("payment_status", "succeeded")
        .fetch(),
      db
        .from("store_payouts")
        .select<StorePayoutAggRow>("sum(amount_cents) as total_paid")
        .eq("status", "paid")
        .fetch(),
      db
        .from("wallet_transactions")
        .select<PassAggRow>(
          "sum(case when source_type = 'capsule_pass' then amount else 0 end) as total_founder, " +
            "sum(case when source_type = 'capsule_pass_platform' then amount else 0 end) as total_platform",
        )
        .eq("metric", "compute")
        .eq("type", "funding")
        .fetch(),
      db
        .from("wallet_transactions")
        .select<PassAggRow>(
          "sum(case when source_type = 'capsule_power' then amount else 0 end) as total_founder, " +
            "sum(case when source_type = 'capsule_power_platform' then amount else 0 end) as total_platform",
        )
        .eq("metric", "compute")
        .eq("type", "funding")
        .fetch(),
      db.from("billing_plans").select<PlanRow>("id, code, scope").fetch(),
      db
        .from("subscriptions")
        .select<SubRow>("plan_id, status")
        .in("status", ["trialing", "active", "past_due"])
        .fetch(),
      fetchPlatformWalletSnapshot(),
    ]);

  const storeRow = (storeAggResult.data ?? [])[0] ?? { total_gross: 0, total_fee: 0 };
  const payoutRow = (payoutAggResult.data ?? [])[0] ?? { total_paid: 0 };
  const passRow = (passAggResult.data ?? [])[0] ?? { total_founder: 0, total_platform: 0 };
  const powerRow = (powerAggResult.data ?? [])[0] ?? { total_founder: 0, total_platform: 0 };

  const plans = (plansResult.data ?? []) as PlanRow[];
  const subs = (subsResult.data ?? []) as SubRow[];

  const userSubscriptionCounts: Record<string, number> = {};
  const capsuleSubscriptionCounts: Record<string, number> = {};

  const plansById = new Map<string, PlanRow>();
  for (const plan of plans) {
    plansById.set(plan.id, plan);
  }

  for (const sub of subs) {
    if (!sub.plan_id) continue;
    const plan = plansById.get(sub.plan_id);
    if (!plan) continue;
    const bucket = plan.scope === "capsule" ? capsuleSubscriptionCounts : userSubscriptionCounts;
    bucket[plan.code] = (bucket[plan.code] ?? 0) + 1;
  }

  return {
    storeGrossCents: toNumber(storeRow.total_gross ?? 0),
    storePlatformFeeCents: toNumber(storeRow.total_fee ?? 0),
    storePaidPayoutCents: toNumber(payoutRow.total_paid ?? 0),
    userSubscriptionCounts,
    capsuleSubscriptionCounts,
    capsulePassFundingCredits: toNumber(passRow.total_founder ?? 0),
    capsulePassPlatformCredits: toNumber(passRow.total_platform ?? 0),
    capsulePowerFundingCredits: toNumber(powerRow.total_founder ?? 0),
    capsulePowerPlatformCredits: toNumber(powerRow.total_platform ?? 0),
    platformWallet,
  };
}

async function fetchPlatformWalletSnapshot(): Promise<{ computeGranted: number; computeUsed: number } | null> {
  const ownerId = getPlatformWalletOwnerId();
  if (!ownerId) return null;

  try {
    const { balance } = await getWalletWithBalance("user", ownerId, "Platform");
    return pickCompute(balance);
  } catch (error) {
    console.warn("analytics.economy.platform_wallet_snapshot_failed", error);
    return null;
  }
}

function pickCompute(balance: WalletBalance): { computeGranted: number; computeUsed: number } {
  return {
    computeGranted: balance.computeGranted,
    computeUsed: balance.computeUsed,
  };
}

