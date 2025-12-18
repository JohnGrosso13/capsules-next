import "server-only";

import Stripe from "stripe";

import type {
  BillingAdapter,
  BillingCheckoutParams,
  BillingCheckoutSession,
  BillingSubscription,
  BillingWebhookEvent,
} from "@/ports/billing";
import { serverEnv } from "@/lib/env/server";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-12-15.clover";

let cachedStripe: Stripe | null = null;
let cachedSecret: string | null = null;

function getStripeClient(): Stripe | null {
  const secret = serverEnv.STRIPE_SECRET_KEY?.trim() ?? null;
  if (!secret) return null;
  if (!cachedStripe || cachedSecret !== secret) {
    cachedSecret = secret;
    cachedStripe = new Stripe(secret, { apiVersion: STRIPE_API_VERSION });
  }
  return cachedStripe;
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const items = subscription.items?.data ?? [];
  if (!items.length) return null;
  let latest: number | null = null;
  for (const item of items) {
    if (latest === null || item.current_period_end > latest) {
      latest = item.current_period_end;
    }
  }
  return latest;
}

function mapSubscription(subscription: Stripe.Subscription): BillingSubscription {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  return {
    id: subscription.id,
    status: subscription.status ?? null,
    currentPeriodEnd: getSubscriptionCurrentPeriodEnd(subscription),
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    customerId: typeof subscription.customer === "string" ? subscription.customer : null,
    metadata: subscription.metadata ?? {},
    priceId,
  };
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription = invoice.parent?.subscription_details?.subscription;
  if (typeof parentSubscription === "string") return parentSubscription;
  if (parentSubscription && typeof parentSubscription === "object") {
    return parentSubscription.id ?? null;
  }

  const legacySubscription = (invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  }).subscription;
  if (typeof legacySubscription === "string") return legacySubscription;
  if (legacySubscription && typeof legacySubscription === "object") {
    return legacySubscription.id ?? null;
  }

  return null;
}

function mapCheckoutSession(session: Stripe.Checkout.Session): BillingCheckoutSession {
  return {
    id: session.id,
    url: session.url ?? null,
    subscriptionId: session.subscription ? String(session.subscription) : null,
    customerId: session.customer ? String(session.customer) : null,
  };
}

class StripeBillingAdapter implements BillingAdapter {
  vendor = "stripe";

  isConfigured(): boolean {
    return Boolean(serverEnv.STRIPE_SECRET_KEY);
  }

  async createCheckoutSession(params: BillingCheckoutParams): Promise<BillingCheckoutSession> {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new Error("Stripe client is not configured");
    }

    const payload: Stripe.Checkout.SessionCreateParams = {
      mode: params.mode ?? "subscription",
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: [
        {
          price: params.priceId,
          quantity: params.quantity ?? 1,
        },
      ],
    };

    if (params.clientReferenceId) {
      payload.client_reference_id = params.clientReferenceId;
    }

    if (params.metadata) {
      payload.metadata = params.metadata as Stripe.MetadataParam;
    }

    if (params.subscriptionMetadata) {
      payload.subscription_data = {
        metadata: params.subscriptionMetadata as Stripe.MetadataParam,
      };
    }

    const session = await stripe.checkout.sessions.create(payload);

    return mapCheckoutSession(session);
  }

  parseWebhookEvent(rawBody: string, signature: string | null | undefined): BillingWebhookEvent {
    const stripe = getStripeClient();
    const secret = serverEnv.STRIPE_WEBHOOK_SECRET?.trim() ?? null;

    if (!stripe || !secret) {
      throw new Error("Stripe webhook secret is not configured");
    }

    const event = stripe.webhooks.constructEvent(rawBody, signature ?? "", secret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          type: event.type,
          session: {
            id: session.id,
            subscriptionId: session.subscription ? String(session.subscription) : null,
          },
        };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          type: event.type,
          subscription: mapSubscription(subscription),
        };
      }
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);
        return {
          type: event.type,
          invoice: {
            id: invoice.id ?? null,
            subscriptionId,
            metadata: invoice.metadata ?? {},
          },
        };
      }
      default:
        return { type: event.type, raw: event.data.object };
    }
  }

  async retrieveSubscription(id: string): Promise<BillingSubscription | null> {
    const stripe = getStripeClient();
    if (!stripe) return null;
    const subscription = await stripe.subscriptions.retrieve(id, {
      expand: ["items.data.price"],
    });
    if (!subscription) return null;
    return mapSubscription(subscription);
  }
}

let cachedAdapter: BillingAdapter | null = null;

export function getStripeBillingAdapter(): BillingAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new StripeBillingAdapter();
  }
  return cachedAdapter;
}
