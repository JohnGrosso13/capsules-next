import "server-only";

import crypto from "node:crypto";

import { serverEnv } from "@/lib/env/server";
import type { StoreAddress } from "./types";

type PrintfulOrderItem = {
  sync_variant_id: number;
  quantity: number;
  retail_price?: string;
  name?: string;
};

type PrintfulOrderResponse = {
  id: number;
  status: string;
  external_id?: string;
  shipping?: { service?: string | null };
  tracking_number?: string | null;
  tracking_url?: string | null;
};

const PRINTFUL_API_BASE = "https://api.printful.com";

function getPrintfulHeaders() {
  if (!serverEnv.PRINTFUL_API_KEY) {
    throw new Error("PRINTFUL_API_KEY is not configured");
  }
  return {
    Authorization: `Bearer ${serverEnv.PRINTFUL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export function hasPrintfulCredentials(): boolean {
  return Boolean(serverEnv.PRINTFUL_API_KEY);
}

export async function createPrintfulOrder(params: {
  storeId?: string | null;
  recipient: StoreAddress;
  items: PrintfulOrderItem[];
  packingSlip?: Record<string, unknown>;
  externalId?: string | null;
}): Promise<PrintfulOrderResponse | null> {
  if (!hasPrintfulCredentials()) return null;
  if (!params.items.length) return null;

  const payload: Record<string, unknown> = {
    external_id: params.externalId ?? undefined,
    store_id: params.storeId ?? serverEnv.PRINTFUL_STORE_ID ?? undefined,
    recipient: {
      name: params.recipient.name ?? params.recipient.email ?? "Capsules Customer",
      address1: params.recipient.line1,
      address2: params.recipient.line2 ?? undefined,
      city: params.recipient.city,
      state_code: params.recipient.region ?? undefined,
      country_code: params.recipient.country ?? undefined,
      zip: params.recipient.postal ?? undefined,
      phone: params.recipient.phone ?? undefined,
      email: params.recipient.email ?? undefined,
    },
    items: params.items,
    packing_slip: params.packingSlip ?? undefined,
    confirm: true,
  };

  const response = await fetch(`${PRINTFUL_API_BASE}/orders`, {
    method: "POST",
    headers: getPrintfulHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("printful.order.create_failed", response.status, text);
    throw new Error(`Printful order creation failed: ${response.status}`);
  }

  const json = (await response.json()) as { result?: PrintfulOrderResponse };
  return json.result ?? null;
}

export function verifyPrintfulSignature(body: string, signatureHeader: string | null): boolean {
  const secret = serverEnv.PRINTFUL_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const digest = hmac.digest("hex");
  // Printful docs describe a hex digest comparison.
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
}
