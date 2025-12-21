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
import { BILLING_SETTINGS_PATH } from "@/lib/billing/client-errors";
import { sendNotificationEmails } from "@/server/notifications/email";
import { createNotifications } from "@/server/notifications/service";
import { getCapsuleAdminRecipients } from "@/server/notifications/recipients";
import type { NotificationType } from "@/shared/notifications";
import { returnError, validatedJson } from "@/server/validation/http";
import type { BillingSubscription, BillingWebhookEvent } from "@/ports/billing";

export const runtime = "nodejs";

function mapStripeStatus(status: string | null | undefined) {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
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

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function resolveBillingRecipients(
  metadata: Record<string, unknown> | null | undefined,
  walletId?: string | null,
): Promise<string[]> {
  const recipients = new Set<string>();
  const metaUserId = normalizeId(metadata?.["user_id"]);
  if (metaUserId) recipients.add(metaUserId);
  const ownerType = typeof metadata?.["owner_type"] === "string" ? (metadata?.["owner_type"] as string) : null;
  const ownerId = normalizeId(metadata?.["owner_id"]);
  if (ownerType === "user" && ownerId) {
    recipients.add(ownerId);
  } else if (ownerType === "capsule" && ownerId) {
    const adminRecipients = await getCapsuleAdminRecipients(ownerId, null);
    adminRecipients.forEach((id) => recipients.add(id));
  }

  const metaWalletId = normalizeId(metadata?.["wallet_id"]);
  const resolvedWalletId = walletId ?? metaWalletId;
  if (resolvedWalletId) {
    const wallet = await getWalletById(resolvedWalletId);
    if (wallet?.ownerType === "user") {
      recipients.add(wallet.ownerId);
    } else if (wallet?.ownerType === "capsule") {
      const adminRecipients = await getCapsuleAdminRecipients(wallet.ownerId, null);
      adminRecipients.forEach((id) => recipients.add(id));
    }
  }

  return Array.from(recipients);
}

function describePlan(plan: BillingPlan | null, fallback?: string | null): string {
  return plan?.name ?? fallback ?? "your subscription";
}

async function dispatchBillingNotification(
  recipients: string[],
  payload: {
    type: NotificationType;
    title: string;
    body?: string | null;
    data?: Record<string, unknown> | null;
  },
): Promise<void> {
  if (!recipients.length) return;
  const data = payload.data ?? null;
  await createNotifications(
    recipients,
    {
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      href: BILLING_SETTINGS_PATH,
      data,
    },
    { respectPreferences: true },
  );
  void sendNotificationEmails(
    recipients,
    {
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      href: BILLING_SETTINGS_PATH,
      data,
    },
    { respectPreferences: true },
  );
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
          const previous =
            event.subscription.id && typeof event.subscription.id === "string"
              ? await getSubscriptionByStripeId(event.subscription.id)
              : null;
          await handleSubscriptionUpsert(
            event.subscription,
            "stripe_subscription",
            event.subscription.id,
          );

          const plan =
            (await resolvePlanFromMetadata(event.subscription.metadata)) ??
            (await resolvePlanFromPrice(event.subscription.priceId));
          const dbSub =
            event.subscription.id && typeof event.subscription.id === "string"
              ? await getSubscriptionByStripeId(event.subscription.id)
              : null;
          const recipients = await resolveBillingRecipients(
            event.subscription.metadata ?? null,
            dbSub?.walletId ?? previous?.walletId ?? null,
          );
          const data = {
            subscriptionId: event.subscription.id ?? null,
            walletId: dbSub?.walletId ?? previous?.walletId ?? null,
            planCode: plan?.code ?? null,
            cancelAtPeriodEnd: event.subscription.cancelAtPeriodEnd ?? false,
          };

          if (event.subscription.cancelAtPeriodEnd && !previous?.cancelAtPeriodEnd) {
            await dispatchBillingNotification(recipients, {
              type: "billing_plan_changed",
              title: `${describePlan(plan, "your subscription")} will cancel at period end`,
              body: "Your plan will end unless you resume billing before renewal.",
              data,
            });
          } else if (
            previous &&
            dbSub &&
            previous.planId &&
            dbSub.planId &&
            previous.planId !== dbSub.planId
          ) {
            await dispatchBillingNotification(recipients, {
              type: "billing_plan_changed",
              title: `Plan changed to ${describePlan(plan, "new plan")}`,
              body: "You're all set on the updated plan. Manage billing anytime.",
              data,
            });
          } else if (!previous && event.type === "customer.subscription.created") {
            await dispatchBillingNotification(recipients, {
              type: "billing_plan_changed",
              title: `Subscribed to ${describePlan(plan, "a plan")}`,
              body: "You can review receipts and billing preferences in Settings.",
              data,
            });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        if ("subscription" in event) {
          const previous =
            event.subscription.id && typeof event.subscription.id === "string"
              ? await getSubscriptionByStripeId(event.subscription.id)
              : null;
          await handleSubscriptionUpsert(
            event.subscription,
            "stripe_subscription",
            event.subscription.id,
          );

          const plan =
            (await resolvePlanFromMetadata(event.subscription.metadata)) ??
            (await resolvePlanFromPrice(event.subscription.priceId));
          const recipients = await resolveBillingRecipients(
            event.subscription.metadata ?? null,
            previous?.walletId ?? null,
          );
          await dispatchBillingNotification(recipients, {
            type: "billing_plan_changed",
            title: `${describePlan(plan, "your subscription")} was canceled`,
            body: "Access will end at the close of the current period. Restart anytime from Billing.",
            data: {
              subscriptionId: event.subscription.id ?? null,
              walletId: previous?.walletId ?? null,
              planCode: plan?.code ?? null,
            },
          });
        }
        break;
      }
      case "invoice.payment_succeeded": {
        if ("invoice" in event) {
          const subscriptionId = event.invoice.subscriptionId;
          if (!subscriptionId) break;
          const subscription = await billing.retrieveSubscription(subscriptionId);
          if (!subscription) break;
          const plan =
            (await resolvePlanFromMetadata(subscription.metadata)) ??
            (await resolvePlanFromPrice(subscription.priceId));
          await handleSubscriptionUpsert(
            subscription,
            "stripe_invoice",
            event.invoice.id ?? subscriptionId,
          );

          const dbSub = await getSubscriptionByStripeId(subscriptionId);
          const recipients = await resolveBillingRecipients(
            subscription.metadata ?? event.invoice.metadata ?? null,
            dbSub?.walletId ?? null,
          );
          await dispatchBillingNotification(recipients, {
            type: "billing_payment_succeeded",
            title: `Payment received for ${describePlan(plan, "your subscription")}`,
            body: "We applied your payment. View your receipt in Billing.",
            data: {
              invoiceId: event.invoice.id ?? null,
              subscriptionId,
              walletId: dbSub?.walletId ?? null,
              planCode: plan?.code ?? null,
            },
          });

          if (dbSub) {
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
      case "invoice.payment_failed": {
        if ("invoice" in event) {
          const subscriptionId = event.invoice.subscriptionId;
          if (!subscriptionId) break;
          const subscription = await billing.retrieveSubscription(subscriptionId);
          if (!subscription) break;
          const plan =
            (await resolvePlanFromMetadata(subscription.metadata)) ??
            (await resolvePlanFromPrice(subscription.priceId));
          await handleSubscriptionUpsert(
            subscription,
            "stripe_invoice",
            event.invoice.id ?? subscriptionId,
          );

          const dbSub = await getSubscriptionByStripeId(subscriptionId);
          const recipients = await resolveBillingRecipients(
            subscription.metadata ?? event.invoice.metadata ?? null,
            dbSub?.walletId ?? null,
          );
          await dispatchBillingNotification(recipients, {
            type: "billing_payment_failed",
            title: `Payment failed for ${describePlan(plan, "your subscription")}`,
            body: "Update your payment method to avoid interruptions.",
            data: {
              invoiceId: event.invoice.id ?? null,
              subscriptionId,
              walletId: dbSub?.walletId ?? null,
              planCode: plan?.code ?? null,
            },
          });
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
