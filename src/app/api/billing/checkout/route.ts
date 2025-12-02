import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { serverEnv } from "@/lib/env/server";
import { deriveRequestOrigin } from "@/lib/url";
import { requireCapsuleOwnership } from "@/server/capsules/domain/common";
import { resolveWalletContext, grantPlanAllowances } from "@/server/billing/entitlements";
import { ensureDefaultPlans, resolvePlanForScope } from "@/server/billing/plans";
import { getStripeClient } from "@/server/billing/stripe";
import { getStripeConfig } from "@/server/billing/config";
import { upsertSubscription } from "@/server/billing/service";
import { returnError, validatedJson } from "@/server/validation/http";

export const runtime = "nodejs";

const requestSchema = z.object({
  scope: z.enum(["user", "capsule"]).default("user"),
  capsuleId: z.string().optional().nullable(),
  planCode: z.string().optional().nullable(),
  successPath: z.string().optional().nullable(),
  cancelPath: z.string().optional().nullable(),
});

const responseSchema = z.object({
  checkoutUrl: z.string(),
  mode: z.enum(["stripe", "bypass"]),
  planCode: z.string(),
  subscriptionId: z.string().optional(),
});

function buildRedirectUrl(origin: string, path: string | null | undefined): string {
  const normalized = (path ?? "").trim();
  if (!normalized.length) return origin;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `${origin.replace(/\/$/, "")}/${normalized.replace(/^\//, "")}`;
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return returnError(400, "invalid_request", "Invalid checkout payload", parsed.error.flatten());
  }

  const { scope, capsuleId, planCode, successPath, cancelPath } = parsed.data;
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  if (scope === "capsule") {
    if (!capsuleId) {
      return returnError(400, "invalid_request", "capsuleId is required for capsule scope");
    }
    try {
      await requireCapsuleOwnership(capsuleId, ownerId);
    } catch (error) {
      const status = (error as { status?: number }).status ?? 403;
      return returnError(status, "forbidden", "You cannot upgrade this capsule");
    }
  }

  await ensureDefaultPlans();
  const plan = await resolvePlanForScope(scope, planCode ?? null);
  if (!plan) {
    return returnError(400, "plan_unavailable", "No billing plan is configured for this scope.");
  }

  const origin = deriveRequestOrigin(req) ?? serverEnv.SITE_URL;
  const successUrl = buildRedirectUrl(origin, successPath ?? "/settings/billing");
  const cancelUrl = buildRedirectUrl(origin, cancelPath ?? "/settings/billing");
  const walletOwnerId = scope === "capsule" && capsuleId ? capsuleId : ownerId;

  const walletContext = await resolveWalletContext({
    ownerType: scope,
    ownerId: walletOwnerId,
    supabaseUserId: ownerId,
    req,
    ensureDevCredits: true,
  });

  const stripe = getStripeClient();
  const stripeConfigured = Boolean(getStripeConfig().secretKey) && Boolean(stripe);
  const bypassCheckout = walletContext.bypass || !stripeConfigured || !plan.stripePriceId;

  if (bypassCheckout) {
    const subscription = await upsertSubscription({
      walletId: walletContext.wallet.id,
      planId: plan.id,
      status: "active",
      metadata: { mode: "bypass" },
    });
    await grantPlanAllowances({
      walletId: walletContext.wallet.id,
      plan,
      sourceType: "dev_bypass",
      reason: "Development bypass",
    });

    return validatedJson(responseSchema, {
      checkoutUrl: successUrl,
      mode: "bypass",
      planCode: plan.code,
      subscriptionId: subscription.id,
    });
  }

  if (!plan.stripePriceId) {
    return returnError(400, "stripe_unconfigured", "Stripe price is not set for this plan");
  }

  try {
    const session = await stripe!.checkout.sessions.create({
      mode: "subscription",
      success_url: `${successUrl}${successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      client_reference_id: walletContext.wallet.id,
      metadata: {
        wallet_id: walletContext.wallet.id,
        plan_code: plan.code,
        owner_type: scope,
        owner_id: walletOwnerId,
        user_id: ownerId,
      },
      subscription_data: {
        metadata: {
          wallet_id: walletContext.wallet.id,
          plan_code: plan.code,
          owner_type: scope,
          owner_id: walletOwnerId,
          user_id: ownerId,
        },
      },
    });

    await upsertSubscription({
      walletId: walletContext.wallet.id,
      planId: plan.id,
      status: "incomplete",
      stripeSubscriptionId: session.subscription ? String(session.subscription) : null,
      stripeCustomerId: session.customer ? String(session.customer) : null,
      metadata: {
        checkout_session_id: session.id,
        plan_code: plan.code,
      },
    });

    return validatedJson(responseSchema, {
      checkoutUrl: session.url ?? successUrl,
      mode: "stripe",
      planCode: plan.code,
      subscriptionId: session.subscription ? String(session.subscription) : undefined,
    });
  } catch (error) {
    console.error("stripe.checkout.create_failed", error);
    return returnError(500, "checkout_failed", "Unable to start checkout");
  }
}
