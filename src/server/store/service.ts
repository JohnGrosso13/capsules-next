import "server-only";

import crypto from "node:crypto";
import Stripe from "stripe";

import { getStripeClient } from "@/server/billing/stripe";
import {
  assembleCartItems,
  filterActiveItems,
  findOrderByStripePaymentIntentId,
  deleteProductById,
  insertOrder,
  insertOrderItems,
  insertPayment,
  listOrderItems,
  listOrdersForBuyer,
  listOrdersForCapsule,
  listProductsWithVariants,
  listShippingOptions,
  upsertShippingOption,
  deleteShippingOption,
  saveProductWithVariants,
  updateOrder,
  updatePaymentByIntentId,
  findOrderById,
} from "./repository";
import type {
  StoreAddress,
  StoreCartLine,
  StoreOrderRecord,
  StoreFulfillmentKind,
  StorePaymentStatus,
  StoreProductKind,
  StripePaymentIntentResult,
  TaxCalculationResult,
} from "./types";
import { getEmailService } from "@/config/email";
import { createPrintfulOrder, hasPrintfulCredentials, verifyPrintfulSignature } from "./printful";

export type CheckoutRequest = {
  capsuleId: string;
  buyerUserId?: string | null;
  cart: StoreCartLine[];
  contact: { email: string; phone?: string | null };
  shippingOptionId?: string | null;
  shippingAddress?: StoreAddress | null;
  billingAddress?: StoreAddress | null;
  billingSameAsShipping?: boolean;
  promoCode?: string | null;
  notes?: string | null;
  paymentMethod?: string | null;
  termsVersion?: string | null;
  termsAcceptedAt?: string | null;
};

export type CheckoutResponse = {
  orderId: string;
  clientSecret: string;
  paymentIntentId: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  stripeTaxCalculationId: string | null;
};

const DEFAULT_CURRENCY = "usd";

function requireStripe(): Stripe {
  const client = getStripeClient();
  if (!client) throw new Error("Stripe is not configured");
  return client;
}

function toCountryCode(country?: string | null): string | undefined {
  if (!country) return undefined;
  const trimmed = country.trim().toUpperCase();
  if (!trimmed) return undefined;
  return trimmed;
}

function buildStripeAddress(address?: StoreAddress | null): Stripe.AddressParam | null {
  if (!address) return null;
  const country = toCountryCode(address.country);

  const payload: Stripe.AddressParam = {};
  if (address.line1) payload.line1 = address.line1;
  if (address.line2) payload.line2 = address.line2;
  if (address.city) payload.city = address.city;
  if (address.region) payload.state = address.region;
  if (address.postal) payload.postal_code = address.postal;
  if (country) payload.country = country;

  return Object.keys(payload).length ? payload : null;
}

function buildStripeTaxAddress(
  address?: StoreAddress | null,
): Stripe.Tax.CalculationCreateParams.CustomerDetails.Address | null {
  const payload = buildStripeAddress(address);
  if (!payload?.country) return null;
  return payload as Stripe.Tax.CalculationCreateParams.CustomerDetails.Address;
}

function generateConfirmationCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let output = "";
  for (let i = 0; i < 8; i += 1) {
    output += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return output;
}

async function calculateTax({
  items,
  currency,
  shippingAddress,
  shippingCents,
}: {
  items: { amount: number; reference?: string | null; quantity: number; taxCode?: string | null }[];
  currency: string;
  shippingAddress?: StoreAddress | null;
  shippingCents: number;
}): Promise<TaxCalculationResult> {
  const stripe = requireStripe();

  const stripeShippingAddress = buildStripeTaxAddress(shippingAddress);

  try {
    const calculation = (await stripe.tax.calculations.create({
      currency,
      ...(stripeShippingAddress
        ? { customer_details: { address: stripeShippingAddress, address_source: "shipping" as const } }
        : {}),
      line_items: items.map((item) => ({
        amount: item.amount,
        quantity: item.quantity,
      })),
      ...(shippingCents > 0 ? { shipping_cost: { amount: shippingCents } } : {}),
    })) as Stripe.Tax.Calculation & { amount_subtotal?: number; amount_tax?: number; amount_total?: number };
    return {
      subtotalCents:
        calculation.amount_subtotal ?? items.reduce((sum, item) => sum + item.amount * item.quantity, 0),
      shippingCents,
      taxCents: calculation.amount_tax ?? 0,
      totalCents: calculation.amount_total ?? 0,
      stripeCalculationId: calculation.id ?? null,
    };
  } catch (error) {
    console.warn("stripe.tax.calculation.failed", error);
    const fallbackSubtotal = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
    return {
      subtotalCents: fallbackSubtotal,
      shippingCents,
      taxCents: 0,
      totalCents: fallbackSubtotal + shippingCents,
      stripeCalculationId: null,
    };
  }
}

async function createPaymentIntent(params: {
  amount: number;
  currency: string;
  description?: string | null;
  contactEmail?: string | null;
  shippingAddress?: StoreAddress | null;
  metadata?: Record<string, string | null>;
}): Promise<StripePaymentIntentResult> {
  const stripe = requireStripe();

  const shippingAddress = buildStripeAddress(params.shippingAddress);
  const shippingDetails =
    params.shippingAddress && shippingAddress
      ? ({
          name: params.shippingAddress.name ?? params.contactEmail ?? "Customer",
          address: shippingAddress,
          ...(params.shippingAddress.phone ? { phone: params.shippingAddress.phone } : {}),
        } satisfies Stripe.PaymentIntentCreateParams.Shipping)
      : undefined;

  const intent = await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    automatic_payment_methods: { enabled: true },
    ...(params.description ? { description: params.description } : {}),
    ...(params.contactEmail ? { receipt_email: params.contactEmail } : {}),
    metadata: Object.entries(params.metadata ?? {}).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value);
      }
      return acc;
    }, {}),
    ...(shippingDetails ? { shipping: shippingDetails } : {}),
  });

  return {
    id: intent.id,
    clientSecret: intent.client_secret ?? "",
    amount: intent.amount,
    currency: intent.currency,
    latestCharge: (intent as Stripe.PaymentIntent & { charges?: { data?: Stripe.Charge[] } }).charges?.data?.[0] ?? null,
  };
}

function resolvePrintfulVariantId(metadata: Record<string, unknown>): number | null {
  const candidates = [
    metadata.printful_variant_id,
    metadata.printful_sync_variant_id,
    metadata.printful_variant,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return Math.trunc(candidate);
    if (typeof candidate === "string" && candidate.trim().length) {
      const parsed = Number(candidate.trim());
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
  }
  return null;
}

export async function createCheckoutIntent(payload: CheckoutRequest): Promise<CheckoutResponse> {
  const { capsuleId, cart, contact, shippingAddress, billingAddress, billingSameAsShipping = true } = payload;
  if (!capsuleId || !cart.length) {
    throw new Error("Capsule and cart are required");
  }

  const { products, variants } = await listProductsWithVariants(capsuleId);
  const activeProducts = filterActiveItems(products);
  const activeVariants = filterActiveItems(variants);

  const { items } = assembleCartItems(cart, activeProducts, activeVariants);
  if (!items.length) {
    throw new Error("No valid items in cart");
  }

  const shippingRequired = items.some(
    (entry) => entry.product.fulfillmentKind === "ship" || entry.product.kind === "physical",
  );

  const shippingOptions = await listShippingOptions(capsuleId);
  let shippingCostCents = 0;
  let chosenShippingId: string | null = null;
  if (shippingRequired) {
    const selected = payload.shippingOptionId
      ? shippingOptions.find((option) => option.id === payload.shippingOptionId) ?? null
      : shippingOptions[0] ?? null;
    if (!selected) {
      throw new Error("Shipping option is required for physical items");
    }
    shippingCostCents = selected.priceCents;
    chosenShippingId = selected.id;
  }

  const currency =
    items[0]?.product.currency ??
    shippingOptions[0]?.currency ??
    activeProducts[0]?.currency ??
    DEFAULT_CURRENCY;

  const taxCalculation = await calculateTax({
    items: items.map((line) => ({
      amount: line.unitPriceCents,
      quantity: line.quantity,
      reference: line.product.id,
      taxCode:
        ((line.variant?.metadata?.["tax_code"] as string | null | undefined) ??
          (line.product.metadata?.["tax_code"] as string | null | undefined) ??
          null) ?? null,
    })),
    currency,
    shippingAddress: shippingAddress ?? null,
    shippingCents: shippingCostCents,
  });

  const orderMetadata: Record<string, unknown> = {
    cart: items.map((entry) => ({
      product_id: entry.product.id,
      variant_id: entry.variant?.id ?? null,
      quantity: entry.quantity,
    })),
    shipping_option_id: chosenShippingId,
    stripe_tax_calculation_id: taxCalculation.stripeCalculationId,
    promo_code: payload.promoCode ?? null,
  };

  const confirmationCode = generateConfirmationCode();
  const nowIso = new Date().toISOString();

  const order = await insertOrder({
    capsule_id: capsuleId,
    buyer_user_id: payload.buyerUserId ?? null,
    status: "requires_payment",
    payment_status: "requires_payment",
    subtotal_cents: taxCalculation.subtotalCents,
    tax_cents: taxCalculation.taxCents,
    fee_cents: 0,
    total_cents: taxCalculation.totalCents,
    currency,
    shipping_required: shippingRequired,
    shipping_status: "pending",
    shipping_name: shippingAddress?.name ?? null,
    shipping_email: contact.email ?? null,
    shipping_phone: contact.phone ?? null,
    shipping_address_line1: shippingAddress?.line1 ?? null,
    shipping_address_line2: shippingAddress?.line2 ?? null,
    shipping_city: shippingAddress?.city ?? null,
    shipping_region: shippingAddress?.region ?? null,
    shipping_postal_code: shippingAddress?.postal ?? null,
    shipping_country: shippingAddress?.country ?? null,
    shipping_notes: shippingAddress?.notes ?? payload.notes ?? null,
    metadata: orderMetadata,
    created_at: nowIso,
    updated_at: nowIso,
    contact_email: contact.email,
    contact_phone: contact.phone ?? null,
    confirmation_code: confirmationCode,
    terms_version: payload.termsVersion ?? null,
    terms_accepted_at: payload.termsAcceptedAt ?? nowIso,
    payment_method: payload.paymentMethod ?? "card",
    billing_same_as_shipping: billingSameAsShipping,
    billing_name: (billingSameAsShipping ? shippingAddress?.name : billingAddress?.name) ?? null,
    billing_email: (billingSameAsShipping ? contact.email : billingAddress?.email) ?? contact.email ?? null,
    billing_phone: (billingSameAsShipping ? shippingAddress?.phone : billingAddress?.phone) ?? null,
    billing_address_line1: (billingSameAsShipping ? shippingAddress?.line1 : billingAddress?.line1) ?? null,
    billing_address_line2: (billingSameAsShipping ? shippingAddress?.line2 : billingAddress?.line2) ?? null,
    billing_city: (billingSameAsShipping ? shippingAddress?.city : billingAddress?.city) ?? null,
    billing_region: (billingSameAsShipping ? shippingAddress?.region : billingAddress?.region) ?? null,
    billing_postal_code: (billingSameAsShipping ? shippingAddress?.postal : billingAddress?.postal) ?? null,
    billing_country: (billingSameAsShipping ? shippingAddress?.country : billingAddress?.country) ?? null,
    shipping_option_id: chosenShippingId ?? null,
  });

  await insertOrderItems(
    items.map((entry) => ({
      order_id: order.id,
      product_id: entry.product.id,
      title: entry.product.title,
      quantity: entry.quantity,
      unit_price_cents: entry.unitPriceCents,
      total_cents: entry.unitPriceCents * entry.quantity,
      tax_cents: 0,
      currency,
      metadata: {
        variant_id: entry.variant?.id ?? null,
        fulfillment_kind: entry.product.fulfillmentKind,
      },
    })),
  );

  await insertPayment({
    order_id: order.id,
    provider: "stripe",
    status: "requires_payment",
    amount_cents: taxCalculation.totalCents,
    currency,
    stripe_payment_intent_id: null,
    stripe_charge_id: null,
    receipt_url: null,
    raw_payload: {},
  });

  const paymentIntent = await createPaymentIntent({
    amount: taxCalculation.totalCents,
    currency,
    description: `${items.length} item(s) from capsule ${capsuleId}`,
    contactEmail: contact.email ?? null,
    shippingAddress: shippingRequired ? shippingAddress ?? null : null,
    metadata: {
      order_id: order.id,
      capsule_id: capsuleId,
      confirmation_code: confirmationCode,
      stripe_tax_calculation_id: taxCalculation.stripeCalculationId,
    },
  });

  await updateOrder(order.id, {
    stripe_payment_intent_id: paymentIntent.id,
    updated_at: new Date().toISOString(),
  });

  await updatePaymentByIntentId(paymentIntent.id, {
    order_id: order.id,
    amount_cents: taxCalculation.totalCents,
    currency,
    updated_at: new Date().toISOString(),
  });

  return {
    orderId: order.id,
    clientSecret: paymentIntent.clientSecret,
    paymentIntentId: paymentIntent.id,
    subtotalCents: taxCalculation.subtotalCents,
    shippingCents: taxCalculation.shippingCents,
    taxCents: taxCalculation.taxCents,
    totalCents: taxCalculation.totalCents,
    currency,
    stripeTaxCalculationId: taxCalculation.stripeCalculationId,
  };
}

async function updateOrderFromPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  status: StorePaymentStatus,
): Promise<StoreOrderRecord | null> {
  const order = await findOrderByStripePaymentIntentId(paymentIntent.id);
  if (!order) return null;

  const charge =
    (paymentIntent as Stripe.PaymentIntent & { charges?: { data?: Stripe.Charge[] } }).charges?.data?.[0] ?? null;
  const receiptUrl = charge?.receipt_url ?? null;
  const chargeId = charge?.id ?? null;

  const updates: Record<string, unknown> = {
    payment_status: status,
    status: status === "succeeded" ? (order.shippingRequired ? "fulfillment_pending" : "fulfilled") : order.status,
    updated_at: new Date().toISOString(),
    total_cents: paymentIntent.amount_received || paymentIntent.amount || order.totalCents,
  };

  await updatePaymentByIntentId(paymentIntent.id, {
    status,
    amount_cents: paymentIntent.amount_received || paymentIntent.amount || order.totalCents,
    stripe_charge_id: chargeId,
    receipt_url: receiptUrl,
    raw_payload: paymentIntent,
    updated_at: new Date().toISOString(),
  });

  const next = await updateOrder(order.id, updates);
  return next;
}

async function maybeSendPrintful(order: StoreOrderRecord) {
  if (!hasPrintfulCredentials()) return;
  if (!order.shippingRequired) return;

  const items = await listOrderItems(order.id);
  const lineItems = items
    .map((item) => {
      const variantId = resolvePrintfulVariantId(item.metadata ?? {});
      if (!variantId) return null;
      return {
        sync_variant_id: variantId,
        quantity: item.quantity,
        retail_price: (item.unitPriceCents / 100).toFixed(2),
        name: item.title,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!lineItems.length) {
    console.warn("printful.skip_no_items", { orderId: order.id });
    return;
  }

  try {
    const result = await createPrintfulOrder({
      externalId: order.id,
      recipient: {
        name: order.shippingName ?? order.shippingEmail ?? null,
        email: order.shippingEmail ?? null,
        phone: order.shippingPhone ?? null,
        line1: order.shippingAddressLine1 ?? null,
        line2: order.shippingAddressLine2 ?? null,
        city: order.shippingCity ?? null,
        region: order.shippingRegion ?? null,
        postal: order.shippingPostalCode ?? null,
        country: order.shippingCountry ?? null,
        notes: order.shippingNotes ?? null,
      },
      items: lineItems,
    });

    if (result) {
      await updateOrder(order.id, {
        shipping_status: "preparing",
        metadata: {
          ...(order.metadata ?? {}),
          printful_order_id: result.id,
          printful_status: result.status,
        },
      });
    }
  } catch (error) {
    console.error("printful.order.create_error", { orderId: order.id, error });
  }
}

async function sendOrderReceipt(order: StoreOrderRecord) {
  const email = order.contactEmail ?? order.shippingEmail ?? null;
  if (!email) return;
  const items = await listOrderItems(order.id);
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: order.currency ?? "usd",
  });
  const lines = items.map(
    (item) => `${item.title} x${item.quantity} — ${formatter.format(item.unitPriceCents / 100)}`,
  );
  const summary = [
    `Subtotal: ${formatter.format(order.subtotalCents / 100)}`,
    `Tax: ${formatter.format(order.taxCents / 100)}`,
    `Total: ${formatter.format(order.totalCents / 100)}`,
  ];
  const tracking =
    order.shippingTracking && order.shippingTracking.trim().length
      ? [`Tracking: ${order.shippingTracking}`, order.shippingCarrier ? `Carrier: ${order.shippingCarrier}` : ""].filter(
          Boolean,
        )
      : [];
  const body = [
    "Thank you for your order!",
    "",
    ...lines,
    "",
    ...summary,
    "",
    ...tracking,
    "",
    `Order ID: ${order.id}`,
  ].join("\n");

  const emailService = getEmailService();
  await emailService.send({
    to: email,
    subject: `Your order ${order.confirmationCode ?? order.id}`,
    text: body,
    html: body.replace(/\n/g, "<br/>"),
  });
}

export async function handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const order = await updateOrderFromPaymentIntent(intent, "succeeded");
      if (order) {
        await maybeSendPrintful(order);
        try {
          await sendOrderReceipt(order);
        } catch (error) {
          console.error("store.order.receipt_failed", { orderId: order.id, error });
        }
      }
      break;
    }
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const intent = event.data.object as Stripe.PaymentIntent;
      await updateOrderFromPaymentIntent(intent, "failed");
      break;
    }
    default:
      break;
  }
}

export async function handlePrintfulWebhook(rawBody: string, headers: Headers): Promise<void> {
  const signature = headers.get("X-Printful-Signature") ?? headers.get("x-printful-signature");
  if (!verifyPrintfulSignature(rawBody, signature)) {
    throw new Error("Invalid Printful webhook signature");
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch (error) {
    console.error("printful.webhook.parse_failed", error);
    throw new Error("Invalid Printful webhook payload");
  }

  const data = (payload["data"] as Record<string, unknown>) ?? {};
  const externalId = (data["external_id"] as string | undefined) ?? null;
  if (!externalId) return;
  const existing = await findOrderById(externalId);
  if (!existing) return;
  await updateOrder(externalId, {
    shipping_status: typeof data["status"] === "string" ? data["status"] : "pending",
    shipping_tracking: (data["tracking_url"] as string | undefined) ?? null,
    shipping_carrier: (data["carrier"] as string | undefined) ?? null,
    updated_at: new Date().toISOString(),
    metadata: {
      ...(existing.metadata ?? {}),
      ...(data ?? {}),
    },
  });
}

export async function loadStoreCatalog(capsuleId: string) {
  const { products, variants } = await listProductsWithVariants(capsuleId);
  const shippingOptions = await listShippingOptions(capsuleId);
  return { products, variants, shippingOptions };
}

export async function listViewerOrders(buyerUserId: string, capsuleId?: string | null) {
  const orders = await listOrdersForBuyer(buyerUserId, capsuleId ?? undefined);
  const withItems = await Promise.all(
    orders.map(async (order) => ({
      order,
      items: await listOrderItems(order.id),
    })),
  );
  return withItems;
}

export async function listOrdersForCapsuleOwner(capsuleId: string) {
  const orders = await listOrdersForCapsule(capsuleId);
  const withItems = await Promise.all(
    orders.map(async (order) => ({
      order,
      items: await listOrderItems(order.id),
    })),
  );
  return withItems;
}

export async function saveProductForCapsule(params: {
  capsuleId: string;
  actorUserId?: string | null;
  product: {
    id?: string | null;
    title: string;
    description?: string | null;
    priceCents: number;
    currency?: string;
    active?: boolean;
    inventoryCount?: number | null;
    fulfillmentKind?: StoreFulfillmentKind;
    fulfillmentUrl?: string | null;
    imageUrl?: string | null;
    memoryId?: string | null;
    featured?: boolean;
    sortOrder?: number;
    sku?: string | null;
    kind?: StoreProductKind;
  };
  variants: Array<{
    id?: string | null;
    label: string;
    priceCents?: number | null;
    currency?: string;
    inventoryCount?: number | null;
    sku?: string | null;
    printfulVariantId?: string | number | null;
    active?: boolean;
    sortOrder?: number;
  }>; 
}) {
  return saveProductWithVariants({
    capsuleId: params.capsuleId,
    product: params.product,
    variants: params.variants,
    actorUserId: params.actorUserId ?? null,
  });
}

export async function deleteProductForCapsule(capsuleId: string, productId: string) {
  return deleteProductById(capsuleId, productId);
}

export async function saveShippingOptionForCapsule(params: {
  capsuleId: string;
  option: {
    id?: string | null;
    label: string;
    detail?: string | null;
    priceCents: number;
    currency?: string;
    etaMinDays?: number | null;
    etaMaxDays?: number | null;
    active?: boolean;
    sortOrder?: number;
  };
}) {
  return upsertShippingOption(params);
}

export async function deleteShippingOptionForCapsule(capsuleId: string, optionId: string) {
  return deleteShippingOption(capsuleId, optionId);
}
