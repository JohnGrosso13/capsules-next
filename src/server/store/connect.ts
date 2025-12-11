import "server-only";

import { getStripeConfig } from "@/server/billing/config";
import { getStripeClient } from "@/server/billing/stripe";
import { getConnectAccountForCapsule, upsertConnectAccount } from "./repository";
import type { StoreConnectAccountRecord } from "./types";

export type StripeConnectSettings = {
  enabled: boolean;
  platformFeeBasisPoints: number;
  requireAccount: boolean;
};

export type ConnectAccountStatus = StoreConnectAccountRecord & {
  onboardingComplete: boolean;
};

export type ConnectChargeResolution = {
  useConnect: boolean;
  destinationAccountId: string | null;
  applicationFeeAmount: number;
  platformFeeBasisPoints: number;
  account: ConnectAccountStatus | null;
  blockedReason?: { code: "seller_connect_missing" | "seller_onboarding_incomplete"; message: string };
};

export function getStripeConnectSettings(): StripeConnectSettings {
  const config = getStripeConfig();
  const bps = Number.isFinite(config.platformFeeBasisPoints)
    ? Math.max(0, Math.trunc(config.platformFeeBasisPoints))
    : 1000;

  return {
    enabled: Boolean(config.connectEnabled && config.secretKey),
    platformFeeBasisPoints: bps,
    requireAccount: Boolean(config.connectRequireAccount),
  };
}

export function computePlatformFeeCents(amountCents: number, basisPoints: number): number {
  if (!Number.isFinite(amountCents) || !Number.isFinite(basisPoints) || amountCents <= 0 || basisPoints <= 0) {
    return 0;
  }
  const computed = Math.floor((amountCents * basisPoints) / 10_000);
  return Math.min(amountCents, Math.max(0, computed));
}

function isOnboarded(record: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean }) {
  return Boolean(record.chargesEnabled && record.detailsSubmitted && record.payoutsEnabled);
}

async function syncAccountFromStripe(
  capsuleId: string,
  accountId: string,
): Promise<ConnectAccountStatus> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  const account = await stripe.accounts.retrieve(accountId);
  const upserted = await upsertConnectAccount({
    capsuleId,
    stripeAccountId: account.id,
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    requirements: account.requirements
      ? { ...(account.requirements as unknown as Record<string, unknown>) }
      : {},
    metadata: { ...(account.metadata ?? {}), email: account.email ?? null, type: account.type ?? null },
  });
  return { ...upserted, onboardingComplete: isOnboarded(upserted) };
}

export async function loadStoredConnectAccount(
  capsuleId: string,
  { refreshFromStripe = false }: { refreshFromStripe?: boolean } = {},
): Promise<ConnectAccountStatus | null> {
  const existing = await getConnectAccountForCapsule(capsuleId);
  if (!existing) return null;
  const base: ConnectAccountStatus = {
    ...existing,
    onboardingComplete: isOnboarded(existing),
  };
  if (!refreshFromStripe) return base;

  try {
    return await syncAccountFromStripe(capsuleId, existing.stripeAccountId);
  } catch (error) {
    console.warn("store.connect.sync_failed", { error, capsuleId, accountId: existing.stripeAccountId });
    return base;
  }
}

async function createStripeConnectAccount(capsuleId: string): Promise<ConnectAccountStatus> {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");
  const account = await stripe.accounts.create({
    type: "express",
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { capsule_id: capsuleId },
  });
  return syncAccountFromStripe(capsuleId, account.id);
}

export async function createConnectOnboardingLink(
  capsuleId: string,
  params: { returnUrl: string; refreshUrl: string },
): Promise<{ url: string; account: ConnectAccountStatus }> {
  const settings = getStripeConnectSettings();
  if (!settings.enabled) {
    throw new Error("Stripe Connect is not enabled");
  }
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe is not configured");

  const account =
    (await loadStoredConnectAccount(capsuleId, { refreshFromStripe: true })) ??
    (await createStripeConnectAccount(capsuleId));

  const link = await stripe.accountLinks.create({
    account: account.stripeAccountId,
    refresh_url: params.refreshUrl,
    return_url: params.returnUrl,
    type: "account_onboarding",
  });

  return { url: link.url, account };
}

export async function resolveConnectCharge(
  capsuleId: string,
  totalCents: number,
): Promise<ConnectChargeResolution> {
  const settings = getStripeConnectSettings();
  const platformFeeBasisPoints = settings.platformFeeBasisPoints;
  if (!settings.enabled) {
    return {
      useConnect: false,
      destinationAccountId: null,
      applicationFeeAmount: 0,
      platformFeeBasisPoints,
      account: null,
    };
  }

  const account = await loadStoredConnectAccount(capsuleId, { refreshFromStripe: true });
  if (!account) {
    const blocked =
      settings.requireAccount && settings.enabled
        ? {
            code: "seller_connect_missing" as const,
            message: "This capsule must finish Stripe payouts setup before charging customers.",
          }
        : undefined;
    return {
      useConnect: false,
      destinationAccountId: null,
      applicationFeeAmount: 0,
      platformFeeBasisPoints,
      account: null,
      ...(blocked ? { blockedReason: blocked } : {}),
    };
  }

  if (!account.onboardingComplete) {
    const blocked = settings.requireAccount
      ? {
          code: "seller_onboarding_incomplete" as const,
          message: "Stripe payouts onboarding is not complete for this capsule.",
        }
      : undefined;
    return {
      useConnect: false,
      destinationAccountId: null,
      applicationFeeAmount: 0,
      platformFeeBasisPoints,
      account,
      ...(blocked ? { blockedReason: blocked } : {}),
    };
  }

  return {
    useConnect: true,
    destinationAccountId: account.stripeAccountId,
    applicationFeeAmount: computePlatformFeeCents(totalCents, platformFeeBasisPoints),
    platformFeeBasisPoints,
    account,
  };
}
