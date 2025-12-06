import "server-only";

import { getDatabaseAdminClient } from "@/config/database";
import { expectResult } from "@/lib/database/utils";
import type {
  StoreCartLine,
  StoreFulfillmentKind,
  StoreOrderItemRecord,
  StoreOrderRecord,
  StoreProductKind,
  StorePaymentRecord,
  StoreProductRecord,
  StoreProductVariantRecord,
  StoreShippingOptionRecord,
  StoreOrderStatus,
  StorePaymentStatus,
} from "./types";

const db = getDatabaseAdminClient();

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export function mapProduct(row: Record<string, unknown>): StoreProductRecord {
  return {
    id: String(row.id),
    capsuleId: String(row.capsule_id),
    createdBy: toStringOrNull(row.created_by),
    title: String(row.title),
    description: toStringOrNull(row.description),
    priceCents: toInt(row.price_cents),
    currency: (row.currency as string) ?? "usd",
    active: Boolean(row.active),
    inventoryCount: row.inventory_count === null ? null : toInt(row.inventory_count),
    fulfillmentKind: (row.fulfillment_kind as StoreProductRecord["fulfillmentKind"]) ?? "download",
    fulfillmentUrl: toStringOrNull(row.fulfillment_url),
    mediaUrl: toStringOrNull(row.media_url),
    imageUrl: toStringOrNull(row.image_url),
    memoryId: toStringOrNull(row.memory_id),
    metadata: parseJson(row.metadata),
    featured: Boolean(row.featured),
    sortOrder: toInt(row.sort_order),
    salesCount: toInt(row.sales_count),
    sku: toStringOrNull(row.sku),
    hero: Boolean(row.hero),
    kind: (row.kind as StoreProductRecord["kind"]) ?? "digital",
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapVariant(row: Record<string, unknown>): StoreProductVariantRecord {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    label: String(row.label),
    priceCents: row.price_cents === null ? null : toInt(row.price_cents),
    currency: (row.currency as string) ?? "usd",
    inventoryCount: row.inventory_count === null ? null : toInt(row.inventory_count),
    sku: toStringOrNull(row.sku),
    active: Boolean(row.active),
    sortOrder: toInt(row.sort_order),
    metadata: parseJson(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapShippingOption(row: Record<string, unknown>): StoreShippingOptionRecord {
  return {
    id: String(row.id),
    capsuleId: String(row.capsule_id),
    label: String(row.label),
    detail: toStringOrNull(row.detail),
    priceCents: toInt(row.price_cents),
    currency: (row.currency as string) ?? "usd",
    etaMinDays: row.eta_min_days === null ? null : toInt(row.eta_min_days),
    etaMaxDays: row.eta_max_days === null ? null : toInt(row.eta_max_days),
    active: Boolean(row.active),
    sortOrder: toInt(row.sort_order),
    metadata: parseJson(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function mapOrder(row: Record<string, unknown>): StoreOrderRecord {
  return {
    id: String(row.id),
    capsuleId: row.capsule_id ? String(row.capsule_id) : null,
    buyerUserId: row.buyer_user_id ? String(row.buyer_user_id) : null,
    status: (row.status as StoreOrderStatus) ?? "pending",
    paymentStatus: (row.payment_status as StorePaymentStatus) ?? "requires_payment",
    subtotalCents: toInt(row.subtotal_cents),
    taxCents: toInt(row.tax_cents),
    feeCents: toInt(row.fee_cents),
    totalCents: toInt(row.total_cents),
    currency: (row.currency as string) ?? "usd",
    stripeCheckoutSessionId: toStringOrNull(row.stripe_checkout_session_id),
    stripePaymentIntentId: toStringOrNull(row.stripe_payment_intent_id),
    taxDetails: parseJson(row.tax_details),
    shippingRequired: Boolean(row.shipping_required),
    shippingStatus: (row.shipping_status as string) ?? "pending",
    shippingName: toStringOrNull(row.shipping_name),
    shippingEmail: toStringOrNull(row.shipping_email),
    shippingPhone: toStringOrNull(row.shipping_phone),
    shippingAddressLine1: toStringOrNull(row.shipping_address_line1),
    shippingAddressLine2: toStringOrNull(row.shipping_address_line2),
    shippingCity: toStringOrNull(row.shipping_city),
    shippingRegion: toStringOrNull(row.shipping_region),
    shippingPostalCode: toStringOrNull(row.shipping_postal_code),
    shippingCountry: toStringOrNull(row.shipping_country),
    shippingNotes: toStringOrNull(row.shipping_notes),
    shippingCarrier: toStringOrNull(row.shipping_carrier),
    shippingTracking: toStringOrNull(row.shipping_tracking),
    metadata: parseJson(row.metadata),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    contactEmail: toStringOrNull((row as Record<string, unknown>).contact_email),
    contactPhone: toStringOrNull((row as Record<string, unknown>).contact_phone),
    confirmationCode: toStringOrNull((row as Record<string, unknown>).confirmation_code),
  };
}

export function mapOrderItem(row: Record<string, unknown>): StoreOrderItemRecord {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    productId: row.product_id ? String(row.product_id) : null,
    title: String(row.title),
    quantity: toInt(row.quantity),
    unitPriceCents: toInt(row.unit_price_cents),
    totalCents: toInt(row.total_cents),
    taxCents: toInt(row.tax_cents),
    currency: (row.currency as string) ?? "usd",
    metadata: parseJson(row.metadata),
  };
}

export function mapPayment(row: Record<string, unknown>): StorePaymentRecord {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    provider: String(row.provider ?? "stripe"),
    status: (row.status as StorePaymentStatus) ?? "requires_payment",
    amountCents: toInt(row.amount_cents),
    currency: (row.currency as string) ?? "usd",
    stripePaymentIntentId: toStringOrNull(row.stripe_payment_intent_id),
    stripeChargeId: toStringOrNull(row.stripe_charge_id),
    receiptUrl: toStringOrNull(row.receipt_url),
    rawPayload: parseJson(row.raw_payload),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function listProductsWithVariants(
  capsuleId: string,
): Promise<{ products: StoreProductRecord[]; variants: StoreProductVariantRecord[] }> {
  const productsResult = await db
    .from("store_products")
    .select("*")
    .eq("capsule_id", capsuleId)
    .order("featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .fetch();
  const products = expectResult(productsResult, "store_products.list");
  const productRecords = (products as Record<string, unknown>[]).map(mapProduct);

  if (!productRecords.length) {
    return { products: [], variants: [] };
  }

  const variantResult = await db
    .from("store_product_variants")
    .select("*")
    .in(
      "product_id",
      productRecords.map((p) => p.id),
    )
    .fetch();

  const variantRows = expectResult(variantResult, "store_product_variants.list");
  const variantRecords = (variantRows as Record<string, unknown>[]).map(mapVariant);
  return { products: productRecords, variants: variantRecords };
}

export async function listShippingOptions(
  capsuleId: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<StoreShippingOptionRecord[]> {
  const query = db
    .from("store_shipping_options")
    .select("*")
    .eq("capsule_id", capsuleId)
    .order("active", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (!includeInactive) query.eq("active", true);
  const result = await query.fetch();
  const rows = expectResult(result, "store_shipping_options.list");
  return (rows as Record<string, unknown>[]).map(mapShippingOption);
}

export async function insertOrder(params: Record<string, unknown>): Promise<StoreOrderRecord> {
  const result = await db.from("store_orders").insert(params).select("*").single();
  const row = expectResult(result, "store_orders.insert");
  return mapOrder(row as Record<string, unknown>);
}

export async function insertOrderItems(
  items: Record<string, unknown>[],
): Promise<StoreOrderItemRecord[]> {
  if (!items.length) return [];
  const result = await db.from("store_order_items").insert(items).select("*").fetch();
  const rows = expectResult(result, "store_order_items.insert");
  return (rows as Record<string, unknown>[]).map(mapOrderItem);
}

export async function insertPayment(
  params: Record<string, unknown>,
): Promise<StorePaymentRecord | null> {
  const result = await db.from("store_payments").insert(params).select("*").maybeSingle();
  if (!result.data) return null;
  return mapPayment(result.data as Record<string, unknown>);
}

export async function updateOrder(
  orderId: string,
  updates: Record<string, unknown>,
): Promise<StoreOrderRecord> {
  const result = await db.from("store_orders").update(updates).eq("id", orderId).select("*").single();
  const row = expectResult(result, "store_orders.update");
  return mapOrder(row as Record<string, unknown>);
}

export async function updatePaymentByIntentId(
  intentId: string,
  updates: Record<string, unknown>,
): Promise<StorePaymentRecord | null> {
  const result = await db
    .from("store_payments")
    .update(updates)
    .eq("stripe_payment_intent_id", intentId)
    .select("*")
    .maybeSingle();
  if (!result.data) return null;
  return mapPayment(result.data as Record<string, unknown>);
}

export async function findOrderByStripePaymentIntentId(
  intentId: string,
): Promise<StoreOrderRecord | null> {
  const result = await db
    .from("store_orders")
    .select("*")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle();
  if (!result.data) return null;
  return mapOrder(result.data as Record<string, unknown>);
}

export async function findOrderById(orderId: string): Promise<StoreOrderRecord | null> {
  const result = await db.from("store_orders").select("*").eq("id", orderId).maybeSingle();
  if (!result.data) return null;
  return mapOrder(result.data as Record<string, unknown>);
}

export async function listOrdersForBuyer(
  buyerUserId: string,
  capsuleId?: string | null,
): Promise<StoreOrderRecord[]> {
  const query = db
    .from("store_orders")
    .select("*")
    .eq("buyer_user_id", buyerUserId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (capsuleId) query.eq("capsule_id", capsuleId);
  const result = await query.fetch();
  const rows = expectResult(result, "store_orders.list_for_buyer");
  return (rows as Record<string, unknown>[]).map(mapOrder);
}

export async function listOrdersForCapsule(
  capsuleId: string,
): Promise<StoreOrderRecord[]> {
  const result = await db
    .from("store_orders")
    .select("*")
    .eq("capsule_id", capsuleId)
    .order("created_at", { ascending: false })
    .limit(50)
    .fetch();
  const rows = expectResult(result, "store_orders.list_for_capsule");
  return (rows as Record<string, unknown>[]).map(mapOrder);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-fA-F-]{36}$/.test(value);
}

export async function saveProductWithVariants(params: {
  capsuleId: string;
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
    mediaUrl?: string | null;
    imageUrl?: string | null;
    memoryId?: string | null;
    metadata?: Record<string, unknown>;
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
    metadata?: Record<string, unknown>;
    active?: boolean;
    sortOrder?: number;
  }>;
  actorUserId?: string | null;
}): Promise<{ product: StoreProductRecord; variants: StoreProductVariantRecord[] }> {
  const normalizedProductId = isUuid(params.product.id) ? params.product.id : undefined;
  const baseProductRow: Record<string, unknown> = {
    id: normalizedProductId,
    capsule_id: params.capsuleId,
    title: params.product.title,
    description: params.product.description ?? null,
    price_cents: params.product.priceCents,
    currency: params.product.currency ?? "usd",
    active: params.product.active ?? true,
    inventory_count: params.product.inventoryCount ?? null,
    fulfillment_kind: params.product.fulfillmentKind ?? "download",
    fulfillment_url: params.product.fulfillmentUrl ?? null,
    media_url: params.product.mediaUrl ?? null,
    image_url: params.product.imageUrl ?? null,
    memory_id: params.product.memoryId ?? null,
    metadata: params.product.metadata ?? {},
    featured: params.product.featured ?? false,
    sort_order: params.product.sortOrder ?? 0,
    sku: params.product.sku ?? null,
    kind: params.product.kind ?? "digital",
    created_by: params.actorUserId ?? null,
  };

  const productResult = await db
    .from("store_products")
    .upsert(baseProductRow, { onConflict: "id", ignoreDuplicates: false, defaultToNull: false })
    .select("*")
    .maybeSingle();

  const productRow = expectResult(productResult, "store_products.upsert");
  const savedProduct = mapProduct(productRow as Record<string, unknown>);

  const existingVariantsResult = await db
    .from("store_product_variants")
    .select("id")
    .eq("product_id", savedProduct.id)
    .fetch();
  const existingVariantRows = expectResult(existingVariantsResult, "store_product_variants.list_for_product");
  const existingVariantIds = new Set(
    (existingVariantRows as Record<string, unknown>[]).map((row) => String(row.id)),
  );

  const variantRows = params.variants.map((variant, index) => {
    const variantId = isUuid(variant.id) ? variant.id : undefined;
    const metadata = { ...(variant.metadata ?? {}) };
    if (variant.printfulVariantId !== undefined && variant.printfulVariantId !== null) {
      metadata.printful_variant_id = variant.printfulVariantId;
    }
    return {
      id: variantId,
      product_id: savedProduct.id,
      label: variant.label || "Option",
      price_cents: variant.priceCents ?? null,
      currency: variant.currency ?? savedProduct.currency,
      inventory_count: variant.inventoryCount ?? null,
      sku: variant.sku ?? null,
      active: variant.active ?? true,
      sort_order: typeof variant.sortOrder === "number" ? variant.sortOrder : index,
      metadata,
    };
  });

  const upsertedVariantsResult = await db
    .from("store_product_variants")
    .upsert(variantRows, { onConflict: "id", ignoreDuplicates: false, defaultToNull: false })
    .select("*")
    .fetch();
  const upsertedVariantRows = expectResult(upsertedVariantsResult, "store_product_variants.upsert");
  const savedVariants = (upsertedVariantRows as Record<string, unknown>[]).map(mapVariant);

  const keepIds = new Set(savedVariants.map((v) => v.id));
  const staleIds = [...existingVariantIds].filter((id) => !keepIds.has(id));
  if (staleIds.length) {
    await db.from("store_product_variants").delete().in("id", staleIds);
  }

  return { product: savedProduct, variants: savedVariants };
}

export async function deleteProductById(capsuleId: string, productId: string): Promise<void> {
  const result = await db.from("store_products").delete().eq("id", productId).eq("capsule_id", capsuleId);
  const { error } = result as { error?: unknown };
  if (error) throw error;
}

export async function upsertShippingOption(params: {
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
    metadata?: Record<string, unknown>;
  };
}): Promise<StoreShippingOptionRecord> {
  const payload: Record<string, unknown> = {
    id: params.option.id ?? undefined,
    capsule_id: params.capsuleId,
    label: params.option.label,
    detail: params.option.detail ?? null,
    price_cents: Math.max(0, params.option.priceCents),
    currency: params.option.currency ?? "usd",
    eta_min_days: params.option.etaMinDays ?? null,
    eta_max_days: params.option.etaMaxDays ?? null,
    active: params.option.active ?? true,
    sort_order: params.option.sortOrder ?? 0,
    metadata: params.option.metadata ?? {},
  };
  const result = await db
    .from("store_shipping_options")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: false, defaultToNull: false })
    .select("*")
    .maybeSingle();
  const row = expectResult(result, "store_shipping_options.upsert");
  return mapShippingOption(row as Record<string, unknown>);
}

export async function deleteShippingOption(capsuleId: string, optionId: string): Promise<void> {
  const result = await db
    .from("store_shipping_options")
    .delete()
    .eq("capsule_id", capsuleId)
    .eq("id", optionId);
  const { error } = result as { error?: unknown };
  if (error) throw error;
}

export async function listOrderItems(orderId: string): Promise<StoreOrderItemRecord[]> {
  const result = await db.from("store_order_items").select("*").eq("order_id", orderId).fetch();
  const rows = expectResult(result, "store_order_items.list");
  return (rows as Record<string, unknown>[]).map(mapOrderItem);
}

export function filterActiveItems<T extends { active: boolean }>(items: T[]): T[] {
  return items.filter((item) => Boolean(item.active));
}

export function assembleCartItems(
  lines: StoreCartLine[],
  products: StoreProductRecord[],
  variants: StoreProductVariantRecord[],
): {
  subtotalCents: number;
  items: {
    product: StoreProductRecord;
    variant: StoreProductVariantRecord | null;
    quantity: number;
    unitPriceCents: number;
  }[];
} {
  const productById = new Map(products.map((p) => [p.id, p]));
  const variantById = new Map(variants.map((v) => [v.id, v]));

  let subtotalCents = 0;
  const items: {
    product: StoreProductRecord;
    variant: StoreProductVariantRecord | null;
    quantity: number;
    unitPriceCents: number;
  }[] = [];

  for (const line of lines) {
    const product = productById.get(line.productId);
    if (!product || !product.active) continue;
    const variant = line.variantId ? variantById.get(line.variantId) ?? null : null;
    if (variant && !variant.active) continue;
    const quantity = Math.max(1, Math.trunc(line.quantity));
    const unitPriceCents =
      variant?.priceCents !== null && variant?.priceCents !== undefined && Number.isFinite(variant.priceCents)
        ? variant.priceCents
        : product.priceCents;

    subtotalCents += unitPriceCents * quantity;
    items.push({ product, variant, quantity, unitPriceCents });
  }

  return { subtotalCents, items };
}
