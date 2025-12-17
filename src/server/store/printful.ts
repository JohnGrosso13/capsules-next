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

export type PrintfulShipment = {
  id?: number | null;
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  service?: string | null;
  status?: string | null;
  shipped_at?: number | null;
};

export type PrintfulOrderResponse = {
  id: number;
  status: string;
  external_id?: string;
  shipping?: { service?: string | null };
  tracking_number?: string | null;
  tracking_url?: string | null;
  shipments?: PrintfulShipment[];
  raw?: Record<string, unknown>;
};

export type PrintfulWebhookNormalized = {
  externalId: string;
  eventType: string | null;
  orderStatus: string | null;
  shippingStatus: string | null;
  shipments: PrintfulShipment[];
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrier: string | null;
  createdAt: number | null;
  data: Record<string, unknown>;
};

const PRINTFUL_DEFAULT_API_BASE = "https://api.printful.com";
const SIGNATURE_HEADER_CANDIDATES = ["x-printful-signature", "x-printful-hmac-sha256"];
const DEFAULT_WEBHOOK_TYPES = [
  "order_created",
  "order_updated",
  "order_failed",
  "order_canceled",
  "order_put_hold",
  "order_put_hold_approval",
  "order_remove_hold",
  "order_refunded",
  "package_shipped",
  "package_returned",
];

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

export function getPrintfulApiBase(): string {
  return (serverEnv.PRINTFUL_API_BASE ?? PRINTFUL_DEFAULT_API_BASE).replace(/\/$/, "");
}

export function isPrintfulV2Enabled(): boolean {
  return Boolean(serverEnv.PRINTFUL_V2_ENABLED);
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function normalizeShipment(input: unknown): PrintfulShipment | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const data = input as Record<string, unknown>;
  const id = toNumberOrNull(data.id);
  const carrier = toStringOrNull(data.carrier);
  const trackingNumber =
    toStringOrNull(data.tracking_number ?? data.tracking_no ?? data.trackingNo) ?? null;
  const trackingUrl = toStringOrNull(data.tracking_url) ?? null;
  const service = toStringOrNull(data.service) ?? null;
  const status = toStringOrNull(data.status) ?? null;
  const shippedAt = toNumberOrNull(data.shipped_at ?? data.created ?? null);
  return {
    id: id ?? null,
    carrier,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    service,
    status,
    shipped_at: shippedAt ?? null,
  };
}

function normalizePrintfulOrderResponse(
  result: Record<string, unknown> | null | undefined,
): PrintfulOrderResponse | null {
  if (!result) return null;
  const shipments: PrintfulShipment[] = [];
  const addShipment = (entry: unknown) => {
    const normalized = normalizeShipment(entry);
    if (normalized) shipments.push(normalized);
  };
  const resultShipments = (result as Record<string, unknown>)["shipments"];
  if (Array.isArray(resultShipments)) {
    for (const shipment of resultShipments) addShipment(shipment);
  }
  const trackingUrl =
    toStringOrNull((result as Record<string, unknown>)["tracking_url"]) ??
    shipments.find((s) => s.tracking_url)?.tracking_url ??
    null;
  const trackingNumber =
    toStringOrNull((result as Record<string, unknown>)["tracking_number"]) ??
    shipments.find((s) => s.tracking_number)?.tracking_number ??
    null;

  const id = toNumberOrNull((result as Record<string, unknown>)["id"]);
  const status = toStringOrNull((result as Record<string, unknown>)["status"]);
  if (id === null || !status) return null;

  const response: PrintfulOrderResponse = {
    id,
    status,
    tracking_number: trackingNumber,
    tracking_url: trackingUrl,
    raw: result,
  };
  if (shipments.length) response.shipments = shipments;
  const externalId = toStringOrNull((result as Record<string, unknown>)["external_id"]);
  if (externalId) response.external_id = externalId;
  const shipping = (result as Record<string, unknown>)["shipping"] as { service?: string | null } | undefined;
  if (shipping) response.shipping = shipping;
  return response;
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
  const useV2 = isPrintfulV2Enabled();

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
    confirm: useV2 ? undefined : true,
  };

  const endpoint = new URL(`${getPrintfulApiBase()}/orders`);
  if (useV2) {
    endpoint.searchParams.set("confirm", "true");
    if (payload.store_id) {
      endpoint.searchParams.set("store_id", String(payload.store_id));
    }
  }

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: getPrintfulHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("printful.order.create_failed", response.status, text);
    throw new Error(`Printful order creation failed: ${response.status}`);
  }

  const json = (await response.json()) as { result?: Record<string, unknown> | null };
  return normalizePrintfulOrderResponse(json.result ?? null);
}

export function resolvePrintfulSignatureHeader(headers: Headers): string | null {
  for (const header of SIGNATURE_HEADER_CANDIDATES) {
    const value = headers.get(header) ?? headers.get(header.toUpperCase());
    if (value && value.trim().length) return value.trim();
  }
  return null;
}

export async function quotePrintfulShipping(params: {
  recipient: {
    country?: string | null;
    region?: string | null;
    city?: string | null;
    postal?: string | null;
    address1?: string | null;
    phone?: string | null;
    name?: string | null;
    email?: string | null;
  };
  items: { variantId: number; quantity: number }[];
}): Promise<
  | {
      rates: { id: string; label: string; priceCents: number; currency: string; etaMinDays: number | null; etaMaxDays: number | null }[];
    }
  | null
> {
  if (!hasPrintfulCredentials()) return null;
  if (!params.items.length) return null;

  const endpoint = new URL(`${getPrintfulApiBase()}/shipping/rates`);
  const payload: Record<string, unknown> = {
    recipient: {
      country_code: params.recipient.country ?? undefined,
      state_code: params.recipient.region ?? undefined,
      city: params.recipient.city ?? undefined,
      zip: params.recipient.postal ?? undefined,
      address1: params.recipient.address1 ?? undefined,
      phone: params.recipient.phone ?? undefined,
      name: params.recipient.name ?? undefined,
      email: params.recipient.email ?? undefined,
    },
    items: params.items.map((item) => ({
      sync_variant_id: item.variantId,
      quantity: item.quantity,
    })),
  };

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: {
      ...getPrintfulHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.warn("printful.shipping.quote_failed", response.status, text);
    return null;
  }

  type PrintfulRate = {
    id?: string;
    name?: string;
    service?: string;
    rate?: string | number;
    currency?: string | null;
    delivery_days?: { from?: number | null; to?: number | null };
    days?: number | null;
  };
  const json = (await response.json()) as { result?: { rates?: PrintfulRate[] } | PrintfulRate[] | null };
  const ratesArray: PrintfulRate[] | undefined =
    Array.isArray(json?.result) ? (json?.result as PrintfulRate[]) : (json?.result as { rates?: PrintfulRate[] })?.rates;
  if (!ratesArray?.length) return null;
  const [bestCandidate, ...rest] = ratesArray;
  if (!bestCandidate) return null;
  const rates = [bestCandidate, ...rest]
    .map((rate, index) => {
      const parsedRate =
        typeof rate.rate === "number"
          ? rate.rate
          : typeof rate.rate === "string"
            ? Number.parseFloat(rate.rate)
            : null;
      if (parsedRate === null || !Number.isFinite(parsedRate)) return null;
      const currency =
        typeof rate.currency === "string" && rate.currency.trim().length ? rate.currency.toLowerCase() : "usd";
      const etaMin = rate.delivery_days?.from ?? null;
      const etaMax = rate.delivery_days?.to ?? rate.days ?? null;
      const label = rate.name ?? rate.service ?? "Shipping";
      const id =
        rate.id ??
        rate.service ??
        (label && label.trim().length ? label.toLowerCase().replace(/\s+/g, "-") : `rate-${index}`);
      return {
        id,
        label,
        priceCents: Math.max(0, Math.round(parsedRate * 100)),
        currency,
        etaMinDays: typeof etaMin === "number" && Number.isFinite(etaMin) ? etaMin : null,
        etaMaxDays: typeof etaMax === "number" && Number.isFinite(etaMax) ? etaMax : null,
      };
    })
    .filter(Boolean) as { id: string; label: string; priceCents: number; currency: string; etaMinDays: number | null; etaMaxDays: number | null }[];

  if (!rates.length) return null;
  rates.sort((a, b) => a.priceCents - b.priceCents);
  return { rates };
}


export function verifyPrintfulSignature(body: string, signatureHeader: string | null): boolean {
  const secret = serverEnv.PRINTFUL_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signatureHeader) return false;
  const cleaned = signatureHeader.trim();
  const signature = cleaned.startsWith("sha256=") ? cleaned.slice(7) : cleaned;
  if (!signature) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body, "utf8");
  const digest = hmac.digest("hex");
  if (signature.length !== digest.length) return false;
  try {
    // Printful webhooks use an HMAC SHA256 hex digest
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const EVENT_STATUS_MAP: Record<string, string> = {
  order_created: "preparing",
  package_shipped: "shipped",
  package_returned: "returned",
  order_failed: "failed",
  order_canceled: "canceled",
  order_put_hold: "on_hold",
  order_put_hold_approval: "in_review",
  order_remove_hold: "preparing",
  order_refunded: "refunded",
};

const ORDER_STATUS_MAP: Record<string, string> = {
  draft: "pending",
  pending: "preparing",
  inreview: "in_review",
  onhold: "on_hold",
  inprocess: "in_production",
  partial: "partial",
  fulfilled: "shipped",
  failed: "failed",
  canceled: "canceled",
};

function mapShippingStatus(eventType: string | null, orderStatus: string | null): string | null {
  if (eventType) {
    const mapped = EVENT_STATUS_MAP[eventType.toLowerCase()];
    if (mapped) return mapped;
  }
  if (orderStatus) {
    const mapped = ORDER_STATUS_MAP[orderStatus.toLowerCase()];
    if (mapped) return mapped;
  }
  return orderStatus ?? null;
}

function collectShipments(
  data: Record<string, unknown>,
  order: Record<string, unknown> | null,
): PrintfulShipment[] {
  const shipments: PrintfulShipment[] = [];
  const addShipment = (entry: unknown) => {
    const normalized = normalizeShipment(entry);
    if (normalized) shipments.push(normalized);
  };
  const dataShipments = data["shipments"];
  if (Array.isArray(dataShipments)) {
    for (const shipment of dataShipments) addShipment(shipment);
  }
  if (data["shipment"]) addShipment(data["shipment"]);
  if (order) {
    const orderShipments = order["shipments"];
    if (Array.isArray(orderShipments)) {
      for (const shipment of orderShipments) addShipment(shipment);
    }
  }
  return shipments;
}

function selectTracking(
  data: Record<string, unknown>,
  shipments: PrintfulShipment[],
): { trackingUrl: string | null; trackingNumber: string | null; carrier: string | null } {
  const fromDataUrl = toStringOrNull(data["tracking_url"]);
  const fromDataNumber = toStringOrNull(data["tracking_number"] ?? data["tracking_no"]);
  const fromDataCarrier = toStringOrNull(data["carrier"]);
  const withTracking = shipments.find((s) => s.tracking_url || s.tracking_number);
  return {
    trackingUrl: withTracking?.tracking_url ?? fromDataUrl ?? null,
    trackingNumber: withTracking?.tracking_number ?? fromDataNumber ?? null,
    carrier: withTracking?.carrier ?? fromDataCarrier ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizePrintfulWebhookPayload(payload: unknown): PrintfulWebhookNormalized | null {
  if (!isRecord(payload)) return null;
  const data = isRecord(payload.data) ? (payload.data as Record<string, unknown>) : {};
  const order = isRecord(data.order) ? (data.order as Record<string, unknown>) : null;
  const externalId =
    toStringOrNull(data.external_id) ??
    toStringOrNull(order?.external_id) ??
    null;
  if (!externalId) return null;

  const eventType = toStringOrNull((payload as Record<string, unknown>)["type"]) ?? null;
  const orderStatus = toStringOrNull(data.status) ?? toStringOrNull(order?.status) ?? null;
  const shipments = collectShipments(data, order);
  const tracking = selectTracking(data, shipments);

  return {
    externalId,
    eventType,
    orderStatus,
    shippingStatus: mapShippingStatus(eventType, orderStatus),
    shipments,
    trackingNumber: tracking.trackingNumber,
    trackingUrl: tracking.trackingUrl,
    carrier: tracking.carrier,
    createdAt: typeof (payload as Record<string, unknown>)["created"] === "number"
      ? ((payload as Record<string, unknown>)["created"] as number)
      : null,
    data,
  };
}

let webhookRegistrationPromise: Promise<void> | null = null;

async function upsertWebhookConfig(webhookUrl: string, types: string[]): Promise<void> {
  const endpoint = new URL(`${getPrintfulApiBase()}/webhooks`);
  if (serverEnv.PRINTFUL_STORE_ID) {
    endpoint.searchParams.set("store_id", serverEnv.PRINTFUL_STORE_ID);
  }

  try {
    const existingRes = await fetch(endpoint.toString(), { headers: getPrintfulHeaders() });
    if (existingRes.ok) {
      const existingJson = (await existingRes.json()) as { result?: { url?: string; types?: string[] } };
      const existing = existingJson.result;
      if (existing?.url === webhookUrl && Array.isArray(existing.types)) {
        const desired = new Set(types);
        const current = new Set(existing.types);
        const matches =
          types.every((type) => current.has(type)) && existing.types.every((type) => desired.has(type));
        if (matches) return;
      }
    }
  } catch (error) {
    console.warn("printful.webhook.fetch_failed", error);
  }

  try {
    const res = await fetch(endpoint.toString(), {
      method: "POST",
      headers: getPrintfulHeaders(),
      body: JSON.stringify({ url: webhookUrl, types }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("printful.webhook.register_failed", res.status, text);
    }
  } catch (error) {
    console.warn("printful.webhook.register_failed", error);
  }
}

export async function ensurePrintfulWebhookRegistered(options?: {
  webhookUrl?: string;
  types?: string[];
}): Promise<void> {
  if (!isPrintfulV2Enabled()) return;
  if (!hasPrintfulCredentials()) return;

  const webhookUrl = options?.webhookUrl ?? `${serverEnv.SITE_URL}/api/store/printful-webhook`;
  const types = options?.types?.length ? options.types : DEFAULT_WEBHOOK_TYPES;

  if (!webhookRegistrationPromise) {
    webhookRegistrationPromise = upsertWebhookConfig(webhookUrl, types).finally(() => {
      webhookRegistrationPromise = null;
    });
  }

  try {
    await webhookRegistrationPromise;
  } catch (error) {
    console.warn("printful.webhook.ensure_failed", error);
  }
}

export type PrintfulMockupImage = {
  url: string;
  position: string | null;
  variantIds: number[];
};

type MockupTaskResult =
  | { status: "pending" | "failed"; taskKey: string; error?: string | null }
  | { status: "completed"; taskKey: string; mockups: PrintfulMockupImage[] };

export type PrintfulPlacementPosition = {
  areaWidth: number;
  areaHeight: number;
  width: number;
  height: number;
  top: number;
  left: number;
};

async function createPrintfulMockupTask(params: {
  productId: number;
  variantIds: number[];
  imageUrl: string;
  placement?: string | null;
  storeId?: string | null;
  position?: PrintfulPlacementPosition | null;
}): Promise<MockupTaskResult> {
  if (!hasPrintfulCredentials()) {
    return { status: "failed", taskKey: "", error: "Printful API key is not configured" };
  }
  const endpoint = new URL(`${getPrintfulApiBase()}/mockup-generator/create-task/${params.productId}`);
  const resolvedStoreId = params.storeId ?? serverEnv.PRINTFUL_STORE_ID;
  if (resolvedStoreId) {
    endpoint.searchParams.set("store_id", resolvedStoreId);
  }

  const placement = params.placement ?? "front";
  const resolvedPosition: PrintfulPlacementPosition = {
    areaWidth: Math.max(1, Math.round(params.position?.areaWidth ?? 1800)),
    areaHeight: Math.max(1, Math.round(params.position?.areaHeight ?? 2400)),
    width: Math.max(1, Math.round(params.position?.width ?? 1800)),
    height: Math.max(1, Math.round(params.position?.height ?? 2400)),
    top: Math.max(0, Math.round(params.position?.top ?? 0)),
    left: Math.max(0, Math.round(params.position?.left ?? 0)),
  };
  const payload = {
    variant_ids: params.variantIds,
    format: "png",
    files: [
      {
        placement,
        position: {
          area_width: resolvedPosition.areaWidth,
          area_height: resolvedPosition.areaHeight,
          width: resolvedPosition.width,
          height: resolvedPosition.height,
          top: resolvedPosition.top,
          left: resolvedPosition.left,
        },
        url: params.imageUrl,
      },
    ],
  };

  const response = await fetch(endpoint.toString(), {
    method: "POST",
    headers: getPrintfulHeaders(),
    body: JSON.stringify(payload),
  }).catch((error: unknown) => {
    throw new Error(error instanceof Error ? error.message : "Failed to call Printful mockup API");
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      status: "failed",
      taskKey: "",
      error: text || `Printful mockup create failed (${response.status})`,
    };
  }

  const json = (await response.json().catch(() => null)) as { result?: { task_key?: string } } | null;
  const taskKey = json?.result?.task_key;
  if (!taskKey) {
    return { status: "failed", taskKey: "", error: "Printful mockup task key missing" };
  }
  return { status: "pending", taskKey };
}

async function fetchPrintfulMockupTask(
  taskKey: string,
  storeId?: string | null,
): Promise<MockupTaskResult> {
  if (!hasPrintfulCredentials()) {
    return { status: "failed", taskKey, error: "Printful API key is not configured" };
  }
  const endpoint = new URL(`${getPrintfulApiBase()}/mockup-generator/task`);
  endpoint.searchParams.set("task_key", taskKey);
  const resolvedStoreId = storeId ?? serverEnv.PRINTFUL_STORE_ID;
  if (resolvedStoreId) {
    endpoint.searchParams.set("store_id", resolvedStoreId);
  }

  const response = await fetch(endpoint.toString(), {
    headers: getPrintfulHeaders(),
  }).catch((error: unknown) => {
    throw new Error(error instanceof Error ? error.message : "Failed to poll Printful mockup task");
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      status: "failed",
      taskKey,
      error: text || `Printful mockup poll failed (${response.status})`,
    };
  }

  type RawMockup = {
    mockup_url?: string | null;
    placement?: string | null;
    variant_ids?: number[];
    variant_id?: number | null;
  };
  const json = (await response.json().catch(() => null)) as {
    result?: {
      status?: string;
      mockups?: RawMockup[];
      error?: string;
    };
  } | null;
  const status = json?.result?.status ?? "pending";
  if (status === "failed") {
    return {
      status: "failed",
      taskKey,
      error: json?.result?.error ?? "Printful mockup failed",
    };
  }
  if (status !== "completed") {
    return { status: "pending", taskKey };
  }

  const mockups =
    (json?.result?.mockups ?? [])
      .map((mockup) => {
        const url = typeof mockup.mockup_url === "string" ? mockup.mockup_url : null;
        if (!url) return null;
        const variantIds: number[] = [];
        if (Array.isArray(mockup.variant_ids)) {
          mockup.variant_ids.forEach((id) => {
            if (typeof id === "number" && Number.isFinite(id)) variantIds.push(id);
          });
        } else if (typeof mockup.variant_id === "number" && Number.isFinite(mockup.variant_id)) {
          variantIds.push(mockup.variant_id);
        }
        return {
          url,
          position: mockup.placement ?? null,
          variantIds,
        } satisfies PrintfulMockupImage;
      })
      .filter(Boolean) as PrintfulMockupImage[];

  if (!mockups.length) {
    return { status: "failed", taskKey, error: "Printful returned no mockup images" };
  }

  return { status: "completed", taskKey, mockups };
}

export async function generatePrintfulMockup(params: {
  productId: number;
  variantIds: number[];
  imageUrl: string;
  placement?: string | null;
  storeId?: string | null;
  position?: PrintfulPlacementPosition | null;
  timeoutMs?: number;
  pollIntervalMs?: number;
}): Promise<MockupTaskResult> {
  const created = await createPrintfulMockupTask(params);
  if (created.status === "failed") return created;

  const timeoutMs = Number.isFinite(params.timeoutMs) ? Number(params.timeoutMs) : 25000;
  const pollIntervalMs = Number.isFinite(params.pollIntervalMs) ? Number(params.pollIntervalMs) : 2000;
  const deadline = Date.now() + timeoutMs;

  let lastResult: MockupTaskResult = { status: "pending", taskKey: created.taskKey };
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    lastResult = await fetchPrintfulMockupTask(created.taskKey, params.storeId);
    if (lastResult.status === "completed" || lastResult.status === "failed") {
      return lastResult;
    }
  }

  return { status: "failed", taskKey: created.taskKey, error: "Printful mockup timed out" };
}
