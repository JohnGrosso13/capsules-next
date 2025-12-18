import "server-only";

import Stripe from "stripe";

import { getStripeConfig } from "./config";

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-12-15.clover";

export function getStripeClient(): Stripe | null {
  const { secretKey } = getStripeConfig();
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}

export type StripeClient = Stripe;
