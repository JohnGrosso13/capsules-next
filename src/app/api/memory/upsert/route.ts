import { NextResponse } from "next/server";

export const runtime = "nodejs";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { indexMemory } from "@/lib/supabase/memories";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { returnError } from "@/server/validation/http";
import { memoryUpsertCredits } from "@/lib/billing/usage";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const userPayload = (body?.user as Record<string, unknown>) ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const item = (body?.item as Record<string, unknown>) ?? null;
  if (!item || typeof item.media_url !== "string") {
    return returnError(400, "invalid_request", "media_url required");
  }

  try {
    const primaryText =
      typeof item.raw_text === "string"
        ? item.raw_text
        : typeof item.description === "string"
          ? item.description
          : typeof item.title === "string"
            ? item.title
            : null;

    let walletContext: Awaited<ReturnType<typeof resolveWalletContext>> | null = null;
    try {
      walletContext = await resolveWalletContext({
        ownerType: "user",
        ownerId,
        supabaseUserId: ownerId,
        req,
        ensureDevCredits: true,
      });
      ensureFeatureAccess({
        balance: walletContext.balance,
        bypass: walletContext.bypass,
        requiredTier: "starter",
        featureName: "Memory uploads",
      });
    } catch (billingError) {
      if (billingError instanceof EntitlementError) {
        return returnError(
          billingError.status,
          billingError.code,
          billingError.message,
          billingError.details,
        );
      }
      console.error("billing.memory_upsert.failed", billingError);
      return returnError(500, "billing_error", "Billing check failed");
    }

    await indexMemory({
      ownerId,
      kind: typeof item.kind === "string" ? item.kind : "upload",
      mediaUrl: item.media_url as string,
      mediaType: typeof item.media_type === "string" ? item.media_type : null,
      title: typeof item.title === "string" ? item.title : null,
      description: typeof item.description === "string" ? item.description : null,
      postId: typeof item.post_id === "string" ? item.post_id : null,
      metadata: (item.meta as Record<string, unknown>) ?? null,
      rawText:
        typeof item.raw_text === "string"
          ? item.raw_text
          : typeof item.description === "string"
            ? item.description
            : null,
      source: typeof item.source === "string" ? item.source : null,
      tags: Array.isArray(item.tags)
        ? (item.tags as unknown[]).filter((value): value is string => typeof value === "string")
        : null,
      eventAt: typeof item.created_at === "string" ? item.created_at : null,
    });

    try {
      const computeCost = memoryUpsertCredits(primaryText);
      if (walletContext && computeCost > 0 && !walletContext.bypass) {
        await chargeUsage({
          wallet: walletContext.wallet,
          balance: walletContext.balance,
          metric: "compute",
          amount: computeCost,
          reason: "memory.upsert",
          bypass: walletContext.bypass,
        });
      }
    } catch (billingError) {
      if (billingError instanceof EntitlementError) {
        return returnError(
          billingError.status,
          billingError.code,
          billingError.message,
          billingError.details,
        );
      }
      console.error("billing.memory_upsert.charge_failed", billingError);
      return returnError(500, "billing_error", "Failed to record memory usage");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("memory upsert error", error);
    return returnError(500, "index_failed", "Failed to index memory");
  }
}
