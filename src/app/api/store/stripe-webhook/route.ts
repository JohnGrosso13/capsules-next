import Stripe from "stripe";

import { getStripeConfig } from "@/server/billing/config";
import { handleStripeWebhookEvent } from "@/server/store/service";
import { returnError } from "@/server/validation/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { webhookSecret, secretKey } = getStripeConfig();
  if (!secretKey || !webhookSecret) {
    return returnError(400, "stripe_unconfigured", "Stripe is not configured");
  }

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) {
    return returnError(400, "invalid_signature", "Missing Stripe signature");
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" as Stripe.LatestApiVersion });
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("store.stripe.webhook.invalid", error);
    return returnError(400, "invalid_signature", "Invalid Stripe signature");
  }

  try {
    await handleStripeWebhookEvent(event);
  } catch (error) {
    console.error("store.stripe.webhook.error", error);
    return returnError(500, "webhook_error", "Failed to process webhook");
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
