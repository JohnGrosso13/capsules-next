import { serverEnv } from "@/lib/env/server";

export type StripeConfig = {
  secretKey: string | null;
  webhookSecret: string | null;
  storeWebhookSecret: string | null;
  pricePersonal: string | null;
  priceCapsule: string | null;
  priceCreator: string | null;
  pricePro: string | null;
  priceStudio: string | null;
  connectEnabled: boolean;
  connectRequireAccount: boolean;
  platformFeeBasisPoints: number;
};

export function getStripeConfig(): StripeConfig {
  const platformFeeBasisPoints = serverEnv.STRIPE_PLATFORM_FEE_BASIS_POINTS ?? 1000;
  return {
    secretKey: serverEnv.STRIPE_SECRET_KEY ?? null,
    webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET ?? null,
    storeWebhookSecret: serverEnv.STRIPE_STORE_WEBHOOK_SECRET ?? serverEnv.STRIPE_WEBHOOK_SECRET ?? null,
    pricePersonal: serverEnv.STRIPE_PRICE_PERSONAL ?? null,
    priceCapsule: serverEnv.STRIPE_PRICE_CAPSULE ?? null,
    priceCreator: serverEnv.STRIPE_PRICE_CREATOR ?? null,
    pricePro: serverEnv.STRIPE_PRICE_PRO ?? null,
    priceStudio: serverEnv.STRIPE_PRICE_STUDIO ?? null,
    connectEnabled: Boolean(serverEnv.STRIPE_CONNECT_ENABLED),
    connectRequireAccount: Boolean(serverEnv.STRIPE_CONNECT_REQUIRE_ACCOUNT),
    platformFeeBasisPoints: Number.isFinite(platformFeeBasisPoints) ? platformFeeBasisPoints : 1000,
  };
}

export function hasStripeCredentials(): boolean {
  const { secretKey } = getStripeConfig();
  return Boolean(secretKey);
}
