import { serverEnv } from "@/lib/env/server";

export type StripeConfig = {
  secretKey: string | null;
  webhookSecret: string | null;
  pricePersonal: string | null;
  priceCapsule: string | null;
  priceCreator: string | null;
  pricePro: string | null;
  priceStudio: string | null;
};

export function getStripeConfig(): StripeConfig {
  return {
    secretKey: serverEnv.STRIPE_SECRET_KEY ?? null,
    webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET ?? null,
    pricePersonal: serverEnv.STRIPE_PRICE_PERSONAL ?? null,
    priceCapsule: serverEnv.STRIPE_PRICE_CAPSULE ?? null,
    priceCreator: serverEnv.STRIPE_PRICE_CREATOR ?? null,
    pricePro: serverEnv.STRIPE_PRICE_PRO ?? null,
    priceStudio: serverEnv.STRIPE_PRICE_STUDIO ?? null,
  };
}

export function hasStripeCredentials(): boolean {
  const { secretKey } = getStripeConfig();
  return Boolean(secretKey);
}
