import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { requireCapsuleOwnership } from "@/server/capsules/domain/common";
import { resolveWalletContext } from "@/server/billing/entitlements";
import { getActiveSubscriptionForWallet } from "@/server/billing/service";
import { returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

const querySchema = z.object({
  scope: z.enum(["user", "capsule"]).default("user"),
  capsuleId: z.string().optional().nullable(),
});

const responseSchema = z.object({
  wallet: z.object({
    id: z.string(),
    ownerType: z.enum(["user", "capsule"]),
    ownerId: z.string(),
    displayName: z.string().nullable(),
  }),
  balance: z.object({
    computeGranted: z.number(),
    computeUsed: z.number(),
    storageGranted: z.number(),
    storageUsed: z.number(),
    featureTier: z.string().nullable(),
    modelTier: z.string().nullable(),
    periodStart: z.string().nullable(),
    periodEnd: z.string().nullable(),
  }),
  bypass: z.boolean(),
  subscription: z
    .object({
      id: z.string(),
      status: z.string(),
      planId: z.string().nullable(),
      currentPeriodEnd: z.string().nullable(),
      cancelAtPeriodEnd: z.boolean(),
      stripeSubscriptionId: z.string().nullable(),
    })
    .nullable(),
});

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsedQuery = querySchema.safeParse(
    Object.fromEntries(new URL(req.url ?? "http://localhost").searchParams.entries()),
  );
  if (!parsedQuery.success) {
    return returnError(400, "invalid_request", "Invalid wallet query params");
  }

  const { scope, capsuleId } = parsedQuery.data;
  const walletOwnerId = scope === "capsule" && capsuleId ? capsuleId : ownerId;

  if (scope === "capsule" && capsuleId) {
    try {
      await requireCapsuleOwnership(capsuleId, ownerId);
    } catch (error) {
      const status = (error as { status?: number }).status ?? 403;
      return returnError(status, "forbidden", "You cannot view this capsule wallet");
    }
  }

  const walletContext = await resolveWalletContext({
    ownerType: scope,
    ownerId: walletOwnerId,
    supabaseUserId: ownerId,
    req,
    ensureDevCredits: true,
  });
  const subscription = await getActiveSubscriptionForWallet(walletContext.wallet.id);

  return validatedJson(responseSchema, {
    wallet: {
      id: walletContext.wallet.id,
      ownerType: walletContext.wallet.ownerType,
      ownerId: walletContext.wallet.ownerId,
      displayName: walletContext.wallet.displayName,
    },
    balance: {
      computeGranted: walletContext.balance.computeGranted,
      computeUsed: walletContext.balance.computeUsed,
      storageGranted: walletContext.balance.storageGranted,
      storageUsed: walletContext.balance.storageUsed,
      featureTier: walletContext.balance.featureTier,
      modelTier: walletContext.balance.modelTier,
      periodStart: walletContext.balance.periodStart,
      periodEnd: walletContext.balance.periodEnd,
    },
    bypass: walletContext.bypass,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          planId: subscription.planId,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
        }
      : null,
  });
}
