import { serverEnv } from "@/lib/env/server";

export type StripeConfig = {
  secretKey: string | null;
  webhookSecret: string | null;
  pricePersonal: string | null;
  priceCapsule: string | null;
};

export function getStripeConfig(): StripeConfig {
  return {
    secretKey: serverEnv.STRIPE_SECRET_KEY ?? null,
    webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET ?? null,
    pricePersonal: serverEnv.STRIPE_PRICE_PERSONAL ?? null,
    priceCapsule: serverEnv.STRIPE_PRICE_CAPSULE ?? null,
  };
}

export function hasStripeCredentials(): boolean {
  const { secretKey } = getStripeConfig();
  return Boolean(secretKey);
}
