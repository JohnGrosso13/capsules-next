import "server-only";

import { getDatabaseAdminClient } from "@/config/database";
import { expectResult } from "@/lib/database/utils";

export type WalletOwnerType = "user" | "capsule";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

export type WalletRecord = {
  id: string;
  ownerType: WalletOwnerType;
  ownerId: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WalletBalance = {
  walletId: string;
  computeGranted: number;
  computeUsed: number;
  storageGranted: number;
  storageUsed: number;
  featureTier: string | null;
  modelTier: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  updatedAt: string;
};

export type BillingPlan = {
  id: string;
  code: string;
  scope: WalletOwnerType;
  name: string;
  description: string | null;
  priceCents: number | null;
  currency: string;
  billingInterval: "monthly" | "yearly";
  includedCompute: number;
  includedStorageBytes: number;
  priorityTier: number | null;
  features: Record<string, unknown>;
  active: boolean;
  stripePriceId: string | null;
};

export type SubscriptionRecord = {
  id: string;
  walletId: string;
  planId: string | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WalletTransactionInput = {
  walletId: string;
  type: "funding" | "usage" | "bonus" | "refund" | "transfer_in" | "transfer_out";
  metric: "compute" | "storage" | "feature" | "model_tier";
  amount: number;
  description?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const db = getDatabaseAdminClient();
const RETIRED_PLAN_CODES = new Set(["user_studio"]);

function mapWallet(row: Record<string, unknown>): WalletRecord {
  return {
    id: String(row.id),
    ownerType: row.owner_type as WalletOwnerType,
    ownerId: String(row.owner_id),
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapBalance(row: Record<string, unknown>, walletId: string): WalletBalance {
  const toInt = (value: unknown): number => {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    walletId,
    computeGranted: toInt(row.compute_granted),
    computeUsed: toInt(row.compute_used),
    storageGranted: toInt(row.storage_granted),
    storageUsed: toInt(row.storage_used),
    featureTier: typeof row.feature_tier === "string" ? row.feature_tier : null,
    modelTier: typeof row.model_tier === "string" ? row.model_tier : null,
    periodStart: row.period_start ? String(row.period_start) : null,
    periodEnd: row.period_end ? String(row.period_end) : null,
    updatedAt: String(row.updated_at),
  };
}

function mapPlan(row: Record<string, unknown>): BillingPlan {
  const toInt = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    id: String(row.id),
    code: String(row.code),
    scope: row.scope as WalletOwnerType,
    name: String(row.name),
    description: typeof row.description === "string" ? row.description : null,
    priceCents: toInt(row.price_cents),
    currency: typeof row.currency === "string" ? row.currency : "usd",
    billingInterval:
      (typeof row.billing_interval === "string" && row.billing_interval === "yearly"
        ? "yearly"
        : "monthly") as "monthly" | "yearly",
    includedCompute: toInt(row.included_compute) ?? 0,
    includedStorageBytes: toInt(row.included_storage_bytes) ?? 0,
    priorityTier: toInt(row.priority_tier),
    features:
      row.features && typeof row.features === "object"
        ? { ...(row.features as Record<string, unknown>) }
        : {},
    active: Boolean(row.active),
    stripePriceId:
      typeof row.stripe_price_id === "string" && row.stripe_price_id.trim().length
        ? row.stripe_price_id
        : null,
  };
}

function mapSubscription(row: Record<string, unknown>): SubscriptionRecord {
  const toString = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return `${value}`;
    return null;
  };
  return {
    id: toString(row.id) ?? "",
    walletId: toString(row.wallet_id) ?? "",
    planId: toString(row.plan_id),
    status: (row.status as SubscriptionStatus) ?? "incomplete",
    currentPeriodEnd: row.current_period_end ? String(row.current_period_end) : null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    stripeSubscriptionId: toString(row.stripe_subscription_id),
    stripeCustomerId: toString(row.stripe_customer_id),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? { ...(row.metadata as Record<string, unknown>) }
        : {},
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function getExistingWallet(
  ownerType: WalletOwnerType,
  ownerId: string,
): Promise<WalletRecord | null> {
  const result = await db
    .from("wallets")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (result.error) {
    if (result.error.code === "PGRST116") return null;
    throw result.error;
  }
  if (!result.data) return null;
  return mapWallet(result.data as Record<string, unknown>);
}

export async function ensureWallet(params: {
  ownerType: WalletOwnerType;
  ownerId: string;
  displayName?: string | null;
}): Promise<WalletRecord> {
  const existing = await getExistingWallet(params.ownerType, params.ownerId);
  if (existing) {
    const nextName = params.displayName?.trim();
    if (nextName && nextName !== existing.displayName) {
      const update = await db
        .from("wallets")
        .update({ display_name: nextName, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .maybeSingle();
      if (!update.error && update.data) {
        return mapWallet(update.data as Record<string, unknown>);
      }
    }
    return existing;
  }

  const insert = await db
    .from("wallets")
    .insert(
      {
        owner_type: params.ownerType,
        owner_id: params.ownerId,
        display_name: params.displayName ?? null,
      },
      { returning: "representation" },
    )
    .select("*")
    .single();

  return mapWallet(expectResult(insert, "wallets.insert") as Record<string, unknown>);
}

export async function ensureBalance(walletId: string): Promise<WalletBalance> {
  const lookup = await db.from("wallet_balances").select("*").eq("wallet_id", walletId).maybeSingle();
  if (lookup.data) {
    return mapBalance(lookup.data as Record<string, unknown>, walletId);
  }
  const insert = await db
    .from("wallet_balances")
    .insert({ wallet_id: walletId }, { returning: "representation" })
    .select("*")
    .single();
  return mapBalance(expectResult(insert, "wallet_balances.insert") as Record<string, unknown>, walletId);
}

export async function recordTransaction(input: WalletTransactionInput): Promise<void> {
  const payload = {
    wallet_id: input.walletId,
    type: input.type,
    metric: input.metric,
    amount: input.amount,
    description: input.description ?? null,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    metadata: input.metadata ?? {},
  };
  const result = await db.from("wallet_transactions").insert(payload).single();
  if (result.error) throw result.error;
}

export async function applyBalanceDelta(params: {
  walletId: string;
  computeGrantDelta?: number;
  computeUsedDelta?: number;
  storageGrantDelta?: number;
  storageUsedDelta?: number;
  featureTier?: string | null;
  modelTier?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<WalletBalance> {
  const current = await ensureBalance(params.walletId);
  const next = {
    compute_granted: current.computeGranted + (params.computeGrantDelta ?? 0),
    compute_used: current.computeUsed + (params.computeUsedDelta ?? 0),
    storage_granted: current.storageGranted + (params.storageGrantDelta ?? 0),
    storage_used: current.storageUsed + (params.storageUsedDelta ?? 0),
    feature_tier:
      params.featureTier !== undefined ? params.featureTier : current.featureTier ?? null,
    model_tier: params.modelTier !== undefined ? params.modelTier : current.modelTier ?? null,
    period_start:
      params.periodStart !== undefined ? params.periodStart : current.periodStart ?? null,
    period_end: params.periodEnd !== undefined ? params.periodEnd : current.periodEnd ?? null,
    updated_at: new Date().toISOString(),
  };

  const result = await db
    .from("wallet_balances")
    .update(next)
    .eq("wallet_id", params.walletId)
    .select("*")
    .maybeSingle();

  if (result.error) throw result.error;
  const row = result.data ?? null;
  if (!row) return current;
  return mapBalance(row as Record<string, unknown>, params.walletId);
}

export async function listPlans(scope: WalletOwnerType): Promise<BillingPlan[]> {
  const result = await db
    .from("billing_plans")
    .select("*")
    .eq("scope", scope)
    .eq("active", true)
    .order("price_cents", { ascending: true, nullsFirst: true })
    .fetch();
  if (result.error) throw result.error;
  return (result.data ?? [])
    .map((row) => mapPlan(row as Record<string, unknown>))
    .filter((plan) => !RETIRED_PLAN_CODES.has(plan.code));
}

export async function getPlanByCode(code: string): Promise<BillingPlan | null> {
  const lookup = await db.from("billing_plans").select("*").eq("code", code).maybeSingle();
  if (lookup.error) {
    if (lookup.error.code === "PGRST116") return null;
    throw lookup.error;
  }
  return lookup.data ? mapPlan(lookup.data as Record<string, unknown>) : null;
}

export async function getPlanByStripePrice(priceId: string): Promise<BillingPlan | null> {
  const lookup = await db
    .from("billing_plans")
    .select("*")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (lookup.error) {
    if (lookup.error.code === "PGRST116") return null;
    throw lookup.error;
  }
  return lookup.data ? mapPlan(lookup.data as Record<string, unknown>) : null;
}

export async function upsertPlan(plan: {
  code: string;
  scope: WalletOwnerType;
  name: string;
  description?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  billingInterval?: "monthly" | "yearly";
  includedCompute?: number | null;
  includedStorageBytes?: number | null;
  priorityTier?: number | null;
  features?: Record<string, unknown> | null;
  active?: boolean;
  stripePriceId?: string | null;
}): Promise<BillingPlan> {
  const payload = {
    code: plan.code,
    scope: plan.scope,
    name: plan.name,
    description: plan.description ?? null,
    price_cents:
      typeof plan.priceCents === "number" && Number.isFinite(plan.priceCents)
        ? Math.floor(plan.priceCents)
        : null,
    currency: plan.currency ?? "usd",
    billing_interval: plan.billingInterval ?? "monthly",
    included_compute:
      typeof plan.includedCompute === "number" && Number.isFinite(plan.includedCompute)
        ? Math.floor(plan.includedCompute)
        : 0,
    included_storage_bytes:
      typeof plan.includedStorageBytes === "number" && Number.isFinite(plan.includedStorageBytes)
        ? Math.floor(plan.includedStorageBytes)
        : 0,
    priority_tier:
      typeof plan.priorityTier === "number" && Number.isFinite(plan.priorityTier)
        ? Math.floor(plan.priorityTier)
        : null,
    features: plan.features ?? {},
    active: plan.active ?? true,
    stripe_price_id:
      typeof plan.stripePriceId === "string" && plan.stripePriceId.trim().length
        ? plan.stripePriceId.trim()
        : null,
    updated_at: new Date().toISOString(),
  };

  const result = await db
    .from("billing_plans")
    .upsert(payload, { onConflict: "code" })
    .select("*")
    .eq("code", plan.code)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data) {
    const retry = await db.from("billing_plans").select("*").eq("code", plan.code).maybeSingle();
    if (retry.error) throw retry.error;
    if (!retry.data) throw new Error("billing_plans.upsert: missing row after upsert");
    return mapPlan(retry.data as Record<string, unknown>);
  }
  return mapPlan(result.data as Record<string, unknown>);
}

export async function transferBetweenWallets(params: {
  fromWalletId: string;
  toWalletId: string;
  metric: "compute" | "storage";
  amount: number;
  createdBy?: string | null;
  message?: string | null;
}): Promise<void> {
  const amount = Math.max(0, Math.floor(params.amount));
  if (!amount) return;

  const transfer = await db
    .from("wallet_transfers")
    .insert(
      {
        from_wallet_id: params.fromWalletId,
        to_wallet_id: params.toWalletId,
        metric: params.metric,
        amount,
        message: params.message ?? null,
        created_by: params.createdBy ?? null,
      },
      { returning: "representation" },
    )
    .select("*")
    .single();

  if (transfer.error) throw transfer.error;

  await recordTransaction({
    walletId: params.fromWalletId,
    type: "transfer_out",
    metric: params.metric,
    amount: -amount,
    description: "Donation sent",
    sourceType: "wallet_transfer",
    sourceId: (transfer.data as { id: string }).id,
  });

  await recordTransaction({
    walletId: params.toWalletId,
    type: "transfer_in",
    metric: params.metric,
    amount,
    description: "Donation received",
    sourceType: "wallet_transfer",
    sourceId: (transfer.data as { id: string }).id,
  });

  if (params.metric === "compute") {
    await applyBalanceDelta({
      walletId: params.fromWalletId,
      computeGrantDelta: -amount,
    });
    await applyBalanceDelta({
      walletId: params.toWalletId,
      computeGrantDelta: amount,
    });
  } else if (params.metric === "storage") {
    await applyBalanceDelta({
      walletId: params.fromWalletId,
      storageGrantDelta: -amount,
    });
    await applyBalanceDelta({
      walletId: params.toWalletId,
      storageGrantDelta: amount,
    });
  }
}

export async function getWalletWithBalance(
  ownerType: WalletOwnerType,
  ownerId: string,
  displayName?: string | null,
): Promise<{ wallet: WalletRecord; balance: WalletBalance }> {
  const wallet = await ensureWallet({ ownerType, ownerId, displayName: displayName ?? null });
  const balance = await ensureBalance(wallet.id);
  return { wallet, balance };
}

export async function getWalletById(id: string): Promise<WalletRecord | null> {
  const lookup = await db.from("wallets").select("*").eq("id", id).maybeSingle();
  if (lookup.error) {
    if (lookup.error.code === "PGRST116") return null;
    throw lookup.error;
  }
  if (!lookup.data) return null;
  return mapWallet(lookup.data as Record<string, unknown>);
}

export async function getSubscriptionByStripeId(
  stripeSubscriptionId: string,
): Promise<SubscriptionRecord | null> {
  const lookup = await db
    .from("subscriptions")
    .select("*")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();
  if (lookup.error) {
    if (lookup.error.code === "PGRST116") return null;
    throw lookup.error;
  }
  return lookup.data ? mapSubscription(lookup.data as Record<string, unknown>) : null;
}

export async function getActiveSubscriptionForWallet(
  walletId: string,
): Promise<SubscriptionRecord | null> {
  const lookup = await db
    .from("subscriptions")
    .select("*")
    .eq("wallet_id", walletId)
    .in("status", ["trialing", "active", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookup.error) {
    if (lookup.error.code === "PGRST116") return null;
    throw lookup.error;
  }
  return lookup.data ? mapSubscription(lookup.data as Record<string, unknown>) : null;
}

export async function upsertSubscription(params: {
  walletId: string;
  planId?: string | null;
  status?: SubscriptionStatus | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  stripeSubscriptionId?: string | null;
  stripeCustomerId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<SubscriptionRecord> {
  const now = new Date().toISOString();
  const requestedStatus = params.status ?? null;
  const normalizedStatus: SubscriptionStatus =
    requestedStatus &&
    ["trialing", "active", "past_due", "canceled", "incomplete"].includes(
      requestedStatus as SubscriptionStatus,
    )
      ? (requestedStatus as SubscriptionStatus)
      : "active";

  let existing: SubscriptionRecord | null = null;
  if (params.stripeSubscriptionId) {
    existing = await getSubscriptionByStripeId(params.stripeSubscriptionId);
  }
  if (!existing) {
    const lookup = await db
      .from("subscriptions")
      .select("*")
      .eq("wallet_id", params.walletId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookup.error && lookup.error.code !== "PGRST116") throw lookup.error;
    existing = lookup.data ? mapSubscription(lookup.data as Record<string, unknown>) : null;
  }

  if (existing) {
    const updates: Record<string, unknown> = {
      status: normalizedStatus,
      updated_at: now,
    };
    if (params.planId !== undefined) updates.plan_id = params.planId;
    if (params.currentPeriodEnd !== undefined) updates.current_period_end = params.currentPeriodEnd;
    if (params.cancelAtPeriodEnd !== undefined)
      updates.cancel_at_period_end = Boolean(params.cancelAtPeriodEnd);
    if (params.stripeCustomerId !== undefined) updates.stripe_customer_id = params.stripeCustomerId;
    if (params.stripeSubscriptionId !== undefined)
      updates.stripe_subscription_id = params.stripeSubscriptionId;
    if (params.metadata !== undefined) updates.metadata = params.metadata ?? {};

    const result = await db
      .from("subscriptions")
      .update(updates)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (result.error) throw result.error;
    return mapSubscription(result.data as Record<string, unknown>);
  }

  const insertPayload = {
    wallet_id: params.walletId,
    plan_id: params.planId ?? null,
    status: normalizedStatus,
    current_period_end: params.currentPeriodEnd ?? null,
    cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
    stripe_subscription_id: params.stripeSubscriptionId ?? null,
    stripe_customer_id: params.stripeCustomerId ?? null,
    metadata: params.metadata ?? {},
    created_at: now,
    updated_at: now,
  };

  const insert = await db.from("subscriptions").insert(insertPayload).select("*").single();
  if (insert.error) throw insert.error;
  return mapSubscription(insert.data as Record<string, unknown>);
}

export async function recordFundingIfMissing(params: {
  walletId: string;
  metric: "compute" | "storage";
  amount: number;
  description?: string | null;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown> | null;
  computeGrantDelta?: number;
  storageGrantDelta?: number;
  featureTier?: string | null;
  modelTier?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<boolean> {
  const existing = await db
    .from("wallet_transactions")
    .select("id")
    .eq("wallet_id", params.walletId)
    .eq("source_type", params.sourceType)
    .eq("source_id", params.sourceId)
    .maybeSingle();

  if (existing.data) {
    return false;
  }

  await recordTransaction({
    walletId: params.walletId,
    type: params.amount >= 0 ? "funding" : "refund",
    metric: params.metric,
    amount: params.amount,
    description: params.description ?? null,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    metadata: params.metadata ?? {},
  });

  const delta: {
    walletId: string;
    computeGrantDelta?: number;
    storageGrantDelta?: number;
    featureTier?: string | null;
    modelTier?: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
  } = { walletId: params.walletId };

  if (params.computeGrantDelta !== undefined) delta.computeGrantDelta = params.computeGrantDelta;
  if (params.storageGrantDelta !== undefined) delta.storageGrantDelta = params.storageGrantDelta;
  if (params.featureTier !== undefined) delta.featureTier = params.featureTier;
  if (params.modelTier !== undefined) delta.modelTier = params.modelTier;
  if (params.periodStart !== undefined) delta.periodStart = params.periodStart ?? null;
  if (params.periodEnd !== undefined) delta.periodEnd = params.periodEnd ?? null;

  await applyBalanceDelta(delta);
  return true;
}
