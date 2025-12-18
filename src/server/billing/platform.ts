import "server-only";

import { serverEnv } from "@/lib/env/server";
import { ensureWallet, recordFundingIfMissing } from "./service";

function normalizeUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function getPlatformWalletOwnerId(): string | null {
  return normalizeUuid(serverEnv.PLATFORM_WALLET_USER_ID ?? null);
}

export async function getPlatformWallet(): Promise<{ walletId: string } | null> {
  const ownerId = getPlatformWalletOwnerId();
  if (!ownerId) return null;
  const wallet = await ensureWallet({ ownerType: "user", ownerId, displayName: "Platform" });
  return { walletId: wallet.id };
}

export async function creditPlatformCut(params: {
  metric: "compute" | "storage";
  amount: number;
  sourceType: string;
  sourceId: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<boolean> {
  const platformWallet = await getPlatformWallet();
  if (!platformWallet) {
    console.warn("platform.wallet.missing", { reason: "PLATFORM_WALLET_USER_ID not set" });
    return false;
  }
  const amount = Math.max(0, Math.floor(params.amount));
  if (!amount) return false;

  const payload: Parameters<typeof recordFundingIfMissing>[0] = {
    walletId: platformWallet.walletId,
    metric: params.metric,
    amount,
    description: params.description ?? "Platform fee",
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    metadata: params.metadata ?? {},
  };
  if (params.metric === "compute") payload.computeGrantDelta = amount;
  if (params.metric === "storage") payload.storageGrantDelta = amount;
  return recordFundingIfMissing(payload);
}
