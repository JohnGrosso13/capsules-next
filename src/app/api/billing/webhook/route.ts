import { z } from "zod";

import { getBillingAdapter } from "@/config/billing";
import { getStripeConfig } from "@/server/billing/config";
import { ensureDefaultPlans } from "@/server/billing/plans";
import {
  getPlanByCode,
  getPlanByStripePrice,
  getSubscriptionByStripeId,
  getWalletById,
  upsertSubscription,
} from "@/server/billing/service";
import type { BillingPlan } from "@/server/billing/service";
import { grantPlanAllowances } from "@/server/billing/entitlements";
import { returnError, validatedJson } from "@/server/validation/http";
import type { BillingSubscription, BillingWebhookEvent } from "@/ports/billing";

export const runtime = "nodejs";

function mapStripeStatus(status: string | null | undefined) {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
    case "unpaid":
    case "past_due":
      return "active";
    case "canceled":
      return "canceled";
    default:
      return "incomplete";
  }
}

async function resolvePlanFromPrice(priceId: string | null | undefined): Promise<BillingPlan | null> {
  if (!priceId) return null;
  await ensureDefaultPlans();
  return getPlanByStripePrice(priceId);
}

async function resolvePlanFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const code =
    metadata && typeof metadata["plan_code"] === "string" ? (metadata["plan_code"] as string) : null;
  if (!code) return null;
  await ensureDefaultPlans();
  return getPlanByCode(code);
}

async function handleSubscriptionUpsert(
  subscription: BillingSubscription,
  sourceType: string,
  sourceId: string | null,
): Promise<void> {
  const walletId =
    (subscription.metadata?.wallet_id as string | undefined) ??
    (subscription.metadata?.walletId as string | undefined) ??
    null;

  if (!walletId) return;
  const wallet = await getWalletById(walletId);
  if (!wallet) return;

  const priceId = subscription.priceId ?? null;
  const plan =
    (await resolvePlanFromMetadata(subscription.metadata)) ?? (await resolvePlanFromPrice(priceId));

  await upsertSubscription({
    walletId,
    planId: plan?.id ?? null,
    status: mapStripeStatus(subscription.status),
    currentPeriodEnd:
      typeof subscription.currentPeriodEnd === "number"
        ? new Date(subscription.currentPeriodEnd * 1000).toISOString()
        : null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customerId,
    metadata: subscription.metadata ?? {},
  });

  if (plan && sourceId) {
    await grantPlanAllowances({
      walletId,
      plan,
      sourceType,
      sourceId,
      reason: "Subscription payment",
    });
  }
}

export async function POST(req: Request) {
  const billing = getBillingAdapter();
  const { webhookSecret } = getStripeConfig();

  if (!billing.isConfigured() || !webhookSecret) {
    return returnError(400, "stripe_unconfigured", "Stripe is not configured");
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: BillingWebhookEvent;
  try {
    event = billing.parseWebhookEvent(rawBody, signature ?? "");
  } catch (error) {
    console.error("stripe.webhook.invalid", error);
    return returnError(400, "invalid_signature", "Invalid Stripe signature");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if ("session" in event) {
          const subscriptionId = event.session.subscriptionId;
          if (!subscriptionId) break;
          const subscription = await billing.retrieveSubscription(subscriptionId);
          if (!subscription) break;
          await handleSubscriptionUpsert(subscription, "stripe_checkout", event.session.id);
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        if ("subscription" in event) {
          await handleSubscriptionUpsert(
            event.subscription,
            "stripe_subscription",
            event.subscription.id,
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        if ("subscription" in event) {
          await handleSubscriptionUpsert(
            event.subscription,
            "stripe_subscription",
            event.subscription.id,
          );
        }
        break;
      }
      case "invoice.payment_succeeded": {
        if ("invoice" in event) {
          const subscriptionId = event.invoice.subscriptionId;
          if (!subscriptionId) break;
          const subscription = await billing.retrieveSubscription(subscriptionId);
          if (!subscription) break;
          await handleSubscriptionUpsert(
            subscription,
            "stripe_invoice",
            event.invoice.id ?? subscriptionId,
          );

          const dbSub = await getSubscriptionByStripeId(subscriptionId);
          if (dbSub) {
            const plan =
              (await resolvePlanFromMetadata(subscription.metadata)) ??
              (await resolvePlanFromPrice(subscription.priceId));
            if (plan) {
              await grantPlanAllowances({
                walletId: dbSub.walletId,
                plan,
                sourceType: "stripe_invoice",
                sourceId: event.invoice.id ?? subscriptionId,
                reason: "Invoice payment",
              });
            }
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("stripe.webhook.processing_error", { type: event.type, error });
    return returnError(500, "webhook_error", "Failed to process webhook event");
  }

  return validatedJson(
    z.object({ received: z.boolean() }),
    { received: true },
    { status: 200 },
  );
}
