import { getStripeBillingAdapter } from "@/adapters/billing/stripe";
import type { BillingAdapter } from "@/ports/billing";

const rawVendor =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? process.env.BILLING_VENDOR
    : undefined;

const configuredVendor = (rawVendor ?? "stripe").trim().toLowerCase();

let adapter: BillingAdapter | null = null;

function resolveAdapter(): BillingAdapter {
  switch (configuredVendor) {
    case "stripe":
    case "":
      return getStripeBillingAdapter();
    default:
      console.warn(`Unknown billing vendor "${configuredVendor}". Falling back to Stripe.`);
      return getStripeBillingAdapter();
  }
}

export function getBillingAdapter(): BillingAdapter {
  if (!adapter) {
    adapter = resolveAdapter();
  }
  return adapter;
}

export function getBillingVendor(): string {
  return configuredVendor || "stripe";
}
