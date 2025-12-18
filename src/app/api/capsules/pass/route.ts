import { z } from "zod";
import crypto from "node:crypto";

import { parseJsonBody, validatedJson, returnError } from "@/server/validation/http";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { requireCapsule } from "@/server/capsules/domain/common";
import { resolveWalletContext, chargeUsage, EntitlementError } from "@/server/billing/entitlements";
import { recordFundingIfMissing } from "@/server/billing/service";
import { usdMicrosToCredits } from "@/lib/billing/pricebook";
import { creditPlatformCut } from "@/server/billing/platform";

const requestSchema = z.object({
  capsuleId: z.string().uuid(),
  amountUsd: z.number().positive().max(10_000),
});

const responseSchema = z.object({
  ok: z.literal(true),
  capsuleId: z.string().uuid(),
  founderUserId: z.string().uuid(),
  usdMicros: z.number(),
  grossCredits: z.number(),
  founderCredits: z.number(),
  platformCutCredits: z.number(),
});

export async function POST(req: Request) {
  const supabaseUserId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!supabaseUserId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) return parsed.response;
  const { capsuleId, amountUsd } = parsed.data;

  let founderUserId: string;
  try {
    const capsule = await requireCapsule(capsuleId);
    founderUserId = capsule.ownerId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capsule not found.";
    return returnError(
      (error as { status?: number })?.status ?? 404,
      "not_found",
      message || "Capsule not found.",
    );
  }

  const userWallet = await resolveWalletContext({
    ownerType: "user",
    ownerId: supabaseUserId,
    supabaseUserId,
    req,
    ensureDevCredits: true,
  });

  const founderWallet = await resolveWalletContext({
    ownerType: "user",
    ownerId: founderUserId,
    supabaseUserId,
    req,
    ensureDevCredits: false,
  });

  const usdMicros = Math.max(1, Math.round(amountUsd * 1_000_000));
  const grossCreditsFloat = usdMicrosToCredits(usdMicros);
  const grossCredits = Math.max(1, Math.floor(grossCreditsFloat));
  const founderCredits = Math.max(1, Math.floor(grossCredits * 0.8));
  const platformCutCredits = Math.max(0, grossCredits - founderCredits);
  const sourceId = crypto.randomUUID();

  try {
    await chargeUsage({
      wallet: userWallet.wallet,
      balance: userWallet.balance,
      metric: "compute",
      amount: grossCredits,
      reason: "capsule_pass",
      bypass: userWallet.bypass,
    });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return returnError(error.status, error.code, error.message, error.details);
    }
    console.error("capsule.pass.charge_failed", error);
    return returnError(500, "billing_error", "Failed to debit wallet for Capsule Pass");
  }

  try {
    await recordFundingIfMissing({
      walletId: founderWallet.wallet.id,
      metric: "compute",
      amount: founderCredits,
      description: "Capsule Pass",
      sourceType: "capsule_pass",
      sourceId,
      computeGrantDelta: founderCredits,
      metadata: {
        capsuleId,
        fromUserId: supabaseUserId,
        usdMicros,
        grossCredits,
        platformCutCredits,
      },
    });
  } catch (error) {
    console.error("capsule.pass.fund_founder_failed", error);
    return returnError(500, "billing_error", "Failed to credit founder for Capsule Pass");
  }

  if (platformCutCredits > 0) {
    await creditPlatformCut({
      metric: "compute",
      amount: platformCutCredits,
      sourceType: "capsule_pass_platform",
      sourceId,
      description: "Capsule Pass platform cut",
      metadata: {
        capsuleId,
        founderUserId,
        fromUserId: supabaseUserId,
        usdMicros,
        grossCredits,
        founderCredits,
      },
    }).catch((error) => console.warn("capsule.pass.platform_cut_failed", error));
  }

  return validatedJson(responseSchema, {
    ok: true,
    capsuleId,
    founderUserId,
    usdMicros,
    grossCredits,
    founderCredits,
    platformCutCredits,
  });
}

export const runtime = "nodejs";
