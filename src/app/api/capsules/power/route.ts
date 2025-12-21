import { z } from "zod";
import crypto from "node:crypto";

import { parseJsonBody, validatedJson, returnError } from "@/server/validation/http";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { requireCapsule } from "@/server/capsules/domain/common";
import { resolveWalletContext, chargeUsage, EntitlementError } from "@/server/billing/entitlements";
import { recordFundingIfMissing } from "@/server/billing/service";
import { usdMicrosToCredits } from "@/lib/billing/pricebook";
import { creditPlatformCut } from "@/server/billing/platform";
import { createNotifications } from "@/server/notifications/service";
import { sendNotificationEmails } from "@/server/notifications/email";
import { getCapsuleAdminRecipients } from "@/server/notifications/recipients";

const requestSchema = z.object({
  capsuleId: z.string().uuid(),
  amountUsd: z.number().positive().max(10_000),
});

const responseSchema = z.object({
  ok: z.literal(true),
  capsuleId: z.string().uuid(),
  usdMicros: z.number(),
  grossCredits: z.number(),
  capsuleCredits: z.number(),
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
  const amountLabel = `$${amountUsd.toFixed(2)}`;

  let capsuleName = "your capsule";
  let capsuleOwnerId: string;
  try {
    const { capsule, ownerId } = await requireCapsule(capsuleId);
    capsuleOwnerId = ownerId;
    capsuleName = (capsule as { name?: string | null })?.name ?? capsuleName;
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

  const capsuleWallet = await resolveWalletContext({
    ownerType: "capsule",
    ownerId: capsuleId,
    supabaseUserId,
    req,
    ensureDevCredits: false,
  });

  const usdMicros = Math.max(1, Math.round(amountUsd * 1_000_000));
  const grossCreditsFloat = usdMicrosToCredits(usdMicros);
  const grossCredits = Math.max(1, Math.floor(grossCreditsFloat));
  const capsuleCredits = Math.max(1, Math.floor(grossCredits * 0.8));
  const platformCutCredits = Math.max(0, grossCredits - capsuleCredits);
  const sourceId = crypto.randomUUID();

  try {
    await chargeUsage({
      wallet: userWallet.wallet,
      balance: userWallet.balance,
      metric: "compute",
      amount: grossCredits,
      reason: "capsule_power",
      bypass: userWallet.bypass,
    });
  } catch (error) {
    if (error instanceof EntitlementError) {
      return returnError(error.status, error.code, error.message, error.details);
    }
    console.error("capsule.power.charge_failed", error);
    return returnError(500, "billing_error", "Failed to debit wallet for Capsule Power");
  }

  try {
    await recordFundingIfMissing({
      walletId: capsuleWallet.wallet.id,
      metric: "compute",
      amount: capsuleCredits,
      description: "Capsule Power top-up",
      sourceType: "capsule_power",
      sourceId,
      computeGrantDelta: capsuleCredits,
      metadata: {
        capsuleId,
        fromUserId: supabaseUserId,
        usdMicros,
        grossCredits,
        platformCutCredits,
      },
    });
  } catch (error) {
    console.error("capsule.power.fund_capsule_failed", error);
    return returnError(500, "billing_error", "Failed to credit capsule for Capsule Power");
  }

  if (platformCutCredits > 0) {
    await creditPlatformCut({
      metric: "compute",
      amount: platformCutCredits,
      sourceType: "capsule_power_platform",
      sourceId,
      description: "Capsule Power platform cut",
      metadata: {
        capsuleId,
        fromUserId: supabaseUserId,
        usdMicros,
        grossCredits,
        capsuleCredits,
      },
    }).catch((error) => console.warn("capsule.power.platform_cut_failed", error));
  }

  const adminRecipients = await getCapsuleAdminRecipients(capsuleId, capsuleOwnerId);
  const recipientData = {
    capsuleId,
    fromUserId: supabaseUserId,
    usdMicros,
    amountUsd,
    grossCredits,
    capsuleCredits,
  };

  if (adminRecipients.length) {
    await createNotifications(
      adminRecipients,
      {
        type: "capsule_power_received",
        title: `${amountLabel} Capsule Power added to ${capsuleName}`,
        body: "A supporter boosted your capsule's compute balance.",
        data: recipientData,
        actorId: supabaseUserId,
      },
      { respectPreferences: true },
    );
    void sendNotificationEmails(
      adminRecipients,
      {
        type: "capsule_power_received",
        title: `${amountLabel} Capsule Power added to ${capsuleName}`,
        body: "A supporter boosted your capsule's compute balance.",
        data: recipientData,
      },
      { respectPreferences: true },
    );
  }

  await createNotifications(
    [supabaseUserId],
    {
      type: "capsule_power_sent",
      title: `You added ${amountLabel} Capsule Power`,
      body: `Converted to ${capsuleCredits} credits for ${capsuleName}.`,
      data: recipientData,
    },
    { respectPreferences: true },
  );
  void sendNotificationEmails(
    [supabaseUserId],
    {
      type: "capsule_power_sent",
      title: `You added ${amountLabel} Capsule Power`,
      body: `Converted to ${capsuleCredits} credits for ${capsuleName}.`,
      data: recipientData,
    },
    { respectPreferences: true },
  );

  return validatedJson(responseSchema, {
    ok: true,
    capsuleId,
    usdMicros,
    grossCredits,
    capsuleCredits,
    platformCutCredits,
  });
}

export const runtime = "nodejs";
