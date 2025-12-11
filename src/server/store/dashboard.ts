import "server-only";

import { loadStoreCatalog, listOrdersForCapsuleOwner } from "./service";

type DashboardOrder = {
  id: string;
  confirmationCode: string | null;
  status: string;
  paymentStatus: string;
  shippingStatus: string;
  shippingTracking: string | null;
  shippingCarrier: string | null;
  createdAt: string;
  totalCents: number;
  netRevenueCents: number;
  currency: string;
  itemSummary: string;
  itemCount: number;
};

type DashboardProduct = {
  id: string;
  title: string;
  priceCents: number;
  currency: string;
  active: boolean;
  featured: boolean;
  kind: string;
  fulfillmentKind: string;
};

export type StoreDashboard = {
  capsuleId: string;
  currency: string;
  summary: {
    grossLast30Cents: number;
    netLast30Cents: number;
    totalOrders: number;
    openOrders: number;
    inTransitOrders: number;
    fulfilledOrders: number;
    failedOrders: number;
    pendingPayment: number;
    lastOrderAt: string | null;
  };
  recentOrders: DashboardOrder[];
  catalog: DashboardProduct[];
};

function normalizeCurrency(currency?: string | null): string {
  return (currency ?? "usd").toLowerCase();
}

function isInTransit(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return (
    normalized.includes("transit") ||
    normalized.includes("shipped") ||
    normalized.includes("preparing") ||
    normalized.includes("out_for_delivery")
  );
}

function isFulfilled(status: string | null | undefined): boolean {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized.includes("fulfilled") || normalized.includes("delivered");
}

export async function getStoreDashboard(capsuleId: string): Promise<StoreDashboard> {
  const [orders, catalog] = await Promise.all([
    listOrdersForCapsuleOwner(capsuleId),
    loadStoreCatalog(capsuleId),
  ]);

  const products = catalog.products ?? [];
  const currency =
    orders[0]?.order.currency ?? products[0]?.currency ?? orders[0]?.items?.[0]?.currency ?? "usd";
  const normalizedCurrency = normalizeCurrency(currency);

  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30Orders = orders.filter((entry) => {
    const createdAt = new Date(entry.order.createdAt).getTime();
    return entry.order.paymentStatus === "succeeded" && createdAt >= thirtyDaysAgo;
  });

  const grossLast30Cents = last30Orders.reduce((sum, entry) => sum + entry.order.totalCents, 0);
  const netLast30Cents = last30Orders.reduce(
    (sum, entry) => sum + Math.max(0, entry.order.totalCents - entry.order.feeCents),
    0,
  );

  const openStatuses = new Set(["pending", "requires_payment", "fulfillment_pending"]);
  const openOrders = orders.filter(
    (entry) => openStatuses.has(entry.order.status) || entry.order.paymentStatus === "requires_payment",
  );
  const inTransitOrders = orders.filter((entry) => isInTransit(entry.order.shippingStatus));
  const fulfilledOrders = orders.filter((entry) => isFulfilled(entry.order.status));
  const failedOrders = orders.filter((entry) => entry.order.paymentStatus === "failed");
  const pendingPayment = orders.filter((entry) => entry.order.paymentStatus === "requires_payment");

  const recentOrders: DashboardOrder[] = orders.slice(0, 8).map((entry) => ({
    id: entry.order.id,
    confirmationCode: entry.order.confirmationCode ?? null,
    status: entry.order.status,
    paymentStatus: entry.order.paymentStatus,
    shippingStatus: entry.order.shippingStatus ?? "pending",
    shippingTracking: entry.order.shippingTracking,
    shippingCarrier: entry.order.shippingCarrier,
    createdAt: entry.order.createdAt,
    totalCents: entry.order.totalCents,
    netRevenueCents: Math.max(0, entry.order.totalCents - entry.order.feeCents),
    currency: normalizeCurrency(entry.order.currency ?? normalizedCurrency),
    itemSummary: entry.items[0]?.title ?? "Order items",
    itemCount: entry.items.length,
  }));

  const catalogProducts: DashboardProduct[] = products
    .sort((a, b) => {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    })
    .slice(0, 12)
    .map((product) => ({
      id: product.id,
      title: product.title,
      priceCents: product.priceCents,
      currency: normalizeCurrency(product.currency),
      active: product.active,
      featured: product.featured,
      kind: product.kind,
      fulfillmentKind: product.fulfillmentKind,
    }));

  return {
    capsuleId,
    currency: normalizedCurrency,
    summary: {
      grossLast30Cents,
      netLast30Cents,
      totalOrders: orders.length,
      openOrders: openOrders.length,
      inTransitOrders: inTransitOrders.length,
      fulfilledOrders: fulfilledOrders.length,
      failedOrders: failedOrders.length,
      pendingPayment: pendingPayment.length,
      lastOrderAt: orders[0]?.order.createdAt ?? null,
    },
    recentOrders,
    catalog: catalogProducts,
  };
}
