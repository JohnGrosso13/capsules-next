import Stripe from "stripe";
import { z } from "zod";

import { getStripeClient } from "@/server/billing/stripe";
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
  subscription: Stripe.Subscription,
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

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const plan =
    (await resolvePlanFromMetadata(subscription.metadata)) ?? (await resolvePlanFromPrice(priceId));

  await upsertSubscription({
    walletId,
    planId: plan?.id ?? null,
    status: mapStripeStatus(subscription.status),
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
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
  const stripe = getStripeClient();
  const { webhookSecret } = getStripeConfig();

  if (!stripe || !webhookSecret) {
    return returnError(400, "stripe_unconfigured", "Stripe is not configured");
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret);
  } catch (error) {
    console.error("stripe.webhook.invalid", error);
    return returnError(400, "invalid_signature", "Invalid Stripe signature");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!session.subscription) break;
        const subscriptionId = String(session.subscription);
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });
        await handleSubscriptionUpsert(subscription, "stripe_checkout", session.id);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpsert(subscription, "stripe_subscription", subscription.id);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpsert(subscription, "stripe_subscription", subscription.id);
        break;
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (!subscriptionId) break;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price"],
        });
        await handleSubscriptionUpsert(subscription, "stripe_invoice", invoice.id ?? null);

        const dbSub = await getSubscriptionByStripeId(subscriptionId);
        if (dbSub) {
          const plan =
            (await resolvePlanFromMetadata(subscription.metadata)) ??
            (await resolvePlanFromPrice(subscription.items.data[0]?.price?.id ?? null));
          if (plan) {
            await grantPlanAllowances({
              walletId: dbSub.walletId,
              plan,
              sourceType: "stripe_invoice",
              sourceId: invoice.id ?? subscriptionId,
              reason: "Invoice payment",
            });
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
