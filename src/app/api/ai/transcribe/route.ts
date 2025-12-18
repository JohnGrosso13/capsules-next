import { NextResponse } from "next/server";

import { AIConfigError, transcribeAudioFromBase64 } from "@/lib/ai/prompter";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import { returnError } from "@/server/validation/http";
import {
  checkRateLimits,
  retryAfterSeconds as computeRetryAfterSeconds,
  type RateLimitDefinition,
} from "@/server/rate-limit";
import { resolveClientIp } from "@/server/http/ip";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { transcriptionCreditsFromBase64 } from "@/lib/billing/usage";

export const runtime = "nodejs";

const TRANSCRIBE_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.transcribe",
  limit: 20,
  window: "10 m",
};

const TRANSCRIBE_IP_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.transcribe.ip",
  limit: 80,
  window: "10 m",
};

const TRANSCRIBE_GLOBAL_RATE_LIMIT: RateLimitDefinition = {
  name: "ai.transcribe.global",
  limit: 250,
  window: "10 m",
};

export async function POST(req: Request) {
  try {
    // Require authentication to guard a cost-incurring endpoint
    const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
    if (!ownerId) {
      return returnError(401, "auth_required", "Authentication required");
    }

    const clientIp = resolveClientIp(req);
    const rateLimitResult = await checkRateLimits([
      { definition: TRANSCRIBE_RATE_LIMIT, identifier: ownerId },
      { definition: TRANSCRIBE_IP_RATE_LIMIT, identifier: clientIp ? `ip:${clientIp}` : null },
      { definition: TRANSCRIBE_GLOBAL_RATE_LIMIT, identifier: "global:ai.transcribe" },
    ]);
    if (rateLimitResult && !rateLimitResult.success) {
      const retryAfterSeconds = computeRetryAfterSeconds(rateLimitResult.reset);
      return returnError(
        429,
        "rate_limited",
        "Hold on - too many transcription requests in a short time.",
        retryAfterSeconds === null ? undefined : { retryAfterSeconds },
      );
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const audioBase64Raw =
      typeof body?.audio_base64 === "string" && body.audio_base64.trim().length
        ? body.audio_base64.trim()
        : typeof body?.audioBase64 === "string"
          ? body.audioBase64.trim()
          : "";
    if (!audioBase64Raw) {
      return NextResponse.json({ error: "audio_base64 is required" }, { status: 400 });
    }

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
        featureName: "AI transcription",
      });
    } catch (error) {
      if (error instanceof EntitlementError) {
        return returnError(error.status, error.code, error.message, error.details);
      }
      console.error("billing.ai_transcribe.failed", error);
      return returnError(500, "billing_error", "Failed to verify allowance");
    }

    const mime =
      typeof body?.mime === "string" && body.mime.trim().length ? body.mime.trim() : null;
    const result = await transcribeAudioFromBase64({ audioBase64: audioBase64Raw, mime });

    try {
      const computeCost = transcriptionCreditsFromBase64(audioBase64Raw);
      if (walletContext && computeCost > 0 && !walletContext.bypass) {
        await chargeUsage({
          wallet: walletContext.wallet,
          balance: walletContext.balance,
          metric: "compute",
          amount: computeCost,
          reason: "ai.transcribe",
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
      console.error("billing.ai_transcribe.debit_failed", billingError);
      return returnError(500, "billing_error", "Failed to record transcription usage");
    }

    return NextResponse.json({
      text: result.text || "",
      model: result.model || null,
      raw: result.raw || null,
    });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const status = Number.isInteger((error as { status?: unknown })?.status)
      ? Number((error as { status?: number }).status)
      : 500;
    console.error("Transcription endpoint error:", error);
    if ((error as { meta?: unknown }).meta) {
      console.error("Transcription endpoint meta:", (error as { meta?: unknown }).meta);
    }
    const payload: Record<string, unknown> = {
      error: (error as Error)?.message || "Transcription failed.",
    };
    if ((error as { meta?: unknown }).meta) {
      payload.meta = (error as { meta?: unknown }).meta;
    }
    return NextResponse.json(payload, { status });
  }
}
