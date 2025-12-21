import { z } from "zod";
import { groupUsageFromVars, summarizeGroupLabels } from "@/lib/theme/token-groups";
import { normalizeThemeVariantsInput, isVariantEmpty } from "@/lib/theme/variants";
import { validateThemeVariantsInput } from "@/lib/theme/validate";
import { limitThemeVariants, MAX_RETURNED_VARS, resolveStylerPlan } from "@/server/ai/styler";
import { returnError, validatedJson } from "@/server/validation/http";
import { ensureUserFromRequest } from "@/lib/auth/payload";
import {
  chargeUsage,
  ensureFeatureAccess,
  resolveWalletContext,
  EntitlementError,
} from "@/server/billing/entitlements";
import { computeTextCreditsFromTokens, estimateTokensFromText } from "@/lib/billing/usage";

const VARIANT_MAP_SCHEMA = z.record(z.string(), z.string());
const VARIANTS_SCHEMA = z.object({
  light: VARIANT_MAP_SCHEMA.optional(),
  dark: VARIANT_MAP_SCHEMA.optional(),
});

const responseSchema = z.object({
  status: z.literal("ok"),
  source: z.union([z.literal("heuristic"), z.literal("ai")]),
  summary: z.string(),
  variants: VARIANTS_SCHEMA,
  details: z.string().optional(),
});

async function tryIndexStylerMemory(payload: {
  ownerId: string;
  kind: string;
  mediaUrl: string | null;
  mediaType: string | null;
  title: string | null;
  description: string | null;
  postId: string | null;
  metadata: Record<string, unknown> | null;
  rawText?: string | null;
  source?: string | null;
  tags?: string[] | null;
  eventAt?: string | Date | null;
}) {
  try {
    const { indexMemory } = await import("@/lib/supabase/memories");
    await indexMemory(payload);
  } catch (error) {
    console.warn("styler memory error", error);
  }
}

export async function POST(req: Request) {
  try {
    // Require authentication to prevent unauthenticated style generation calls
    const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
    if (!ownerId) {
      return returnError(401, "auth_required", "Authentication required");
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
        featureName: "AI styler",
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
      console.error("billing.styler.init_failed", billingError);
      return returnError(500, "billing_error", "Failed to verify styling allowance");
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return returnError(400, "invalid_request", "Request body failed validation");
    }

    const payload = body as Record<string, unknown>;
    const promptRaw = typeof payload.prompt === "string" ? payload.prompt : "";
    const prompt = promptRaw.trim();
    if (!prompt) {
      return returnError(400, "invalid_request", "Prompt is required");
    }

    const plan = await resolveStylerPlan(prompt);
    if (!plan) {
      return returnError(422, "styler_unavailable", "I couldn't figure out how to style that yet.");
    }

    const limitedVariants = limitThemeVariants(
      normalizeThemeVariantsInput(plan.variants),
      MAX_RETURNED_VARS,
    );
    if (isVariantEmpty(limitedVariants)) {
      return returnError(
        422,
        "styler_no_changes",
        "That request didn't translate to any visual changes yet.",
      );
    }

    const validation = validateThemeVariantsInput(limitedVariants);
    const variantIssues =
      validation.ok || !validation.issues.length
        ? null
        : validation.issues.map((issue) => issue.message).join("; ");
    const normalizedVariants = validation.ok
      ? validation.normalized
      : limitThemeVariants(validation.normalized, MAX_RETURNED_VARS);

    if (isVariantEmpty(normalizedVariants)) {
      return returnError(422, "styler_validation_failed", "No usable theme variants were produced.");
    }

    const sampleVariant = (normalizedVariants.light ?? normalizedVariants.dark ?? {}) as Record<
      string,
      string
    >;
    const usage = groupUsageFromVars(sampleVariant);
    const inferredDetails = plan.details ?? summarizeGroupLabels(usage);
    const combinedDetails =
      variantIssues && variantIssues.length
        ? [inferredDetails, `Validation warnings: ${variantIssues}`].filter(Boolean).join(" | ")
        : inferredDetails;
    const groupIds = usage.map((entry) => entry.group.id);

    if (ownerId) {
      await tryIndexStylerMemory({
        ownerId,
        kind: "theme",
        mediaUrl: null,
        mediaType: "style",
        title: plan.summary.slice(0, 120),
        description: prompt,
        postId: null,
        metadata: {
          variants: normalizedVariants,
          source: plan.source,
          summary: plan.summary,
          prompt,
          details: combinedDetails ?? null,
          groups: groupIds,
        },
        rawText: `${prompt}\n${plan.summary}`,
        source: "styler",
        tags: [plan.source, "styler"],
      });
    }

    try {
      const tokensUsed = estimateTokensFromText(
        [prompt, plan.summary, JSON.stringify(plan.variants ?? {}), combinedDetails ?? ""].join("\n"),
      );
      const computeCost = computeTextCreditsFromTokens(tokensUsed, null);
      if (walletContext && computeCost > 0 && !walletContext.bypass) {
        await chargeUsage({
          wallet: walletContext.wallet,
          balance: walletContext.balance,
          metric: "compute",
          amount: computeCost,
          reason: "ai.styler",
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
      console.error("billing.styler.charge_failed", billingError);
      return returnError(500, "billing_error", "Failed to record styling usage");
    }

    return validatedJson(responseSchema, {
      status: "ok",
      source: plan.source,
      summary: plan.summary,
      variants: normalizedVariants,
      details: combinedDetails ?? undefined,
    });
  } catch (error) {
    console.error("styler route error", error);
    const message = error instanceof Error && error.message ? error.message : "Internal error";
    return returnError(500, "styler_error", message);
  }
}
// Use the Node.js runtime because we optionally index style changes into Supabase
// via server utilities that rely on Node built-ins (e.g. crypto). Running this
// route on the Edge runtime triggers module resolution errors for those deps.
export const runtime = "nodejs";
