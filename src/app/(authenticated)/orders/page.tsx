
import { currentUser, auth } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";

type OrderItem = {
  id: string;
  title: string;
  quantity: number;
  unitPriceCents: number;
};

type OrderEntry = {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
    shippingStatus?: string;
    totalCents: number;
    netRevenueCents: number;
    currency: string;
    createdAt: string;
    shippingTracking: string | null;
    shippingCarrier: string | null;
    confirmationCode: string | null;
  };
  items: OrderItem[];
};

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountCents / 100);
}

function formatStatus(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

async function fetchOrders(capsuleId?: string | null): Promise<{ orders: OrderEntry[]; error?: string }> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const url = `${base}/api/store/orders${capsuleId ? `?capsuleId=${encodeURIComponent(capsuleId)}` : ""}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const error = res.status === 403 ? "You do not have permission to view these orders." : "Unable to load orders.";
    return { orders: [], error };
  }
  const json = (await res.json()) as { orders: OrderEntry[] };
  return { orders: json.orders ?? [] };
}

type OrdersPageProps = { searchParams?: { capsuleId?: string } };

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const capsuleId = searchParams?.capsuleId?.trim() ? searchParams.capsuleId.trim() : null;
  const { userId } = await auth();
  const user = await currentUser();
  if (!userId || !user) {
    return (
      <AppPage activeNav="home">
        <div className={capTheme.storePanel} style={{ marginTop: "2rem" }}>
          <h3>Please sign in to view your orders.</h3>
        </div>
      </AppPage>
    );
  }

  const { orders, error: ordersError } = await fetchOrders(capsuleId);
  const sellerView = Boolean(capsuleId);
  const sortedOrders = [...orders].sort(
    (a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime(),
  );

  return (
    <AppPage activeNav={sellerView ? "market" : "profile"} showPrompter>
      <div className={capTheme.storeContent} style={{ padding: "24px 0" }}>
        <header style={{ marginBottom: "16px" }}>
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>
            {sellerView ? "Store orders" : "My orders"}
          </h1>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            {sellerView
              ? capsuleId
                ? `Orders for capsule ${capsuleId}.`
                : "Provide a capsuleId query param to view orders you own."
              : "Recent purchases, status, and tracking."}
          </p>
          {orders.length ? (
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>Sorted by newest first.</p>
          ) : null}
        </header>

        {ordersError ? (
          <div className={capTheme.storePanel}>
            <p>{ordersError}</p>
          </div>
        ) : !orders.length ? (
          <div className={capTheme.storePanel}>
            <p>
              {sellerView
                ? "No orders yet for this capsule."
                : "You have no orders yet. Your confirmations and tracking links will land here."}
            </p>
          </div>
        ) : (
          <div className={capTheme.storeGrid}>
            {sortedOrders.map((entry) => {
              const subtotal = entry.items.reduce(
                (sum, item) => sum + item.unitPriceCents * item.quantity,
                0,
              );
              const netRevenue = entry.order.netRevenueCents ?? entry.order.totalCents;
              const orderRef = entry.order.confirmationCode ?? entry.order.id.slice(0, 8);
              const orderStatus = formatStatus(entry.order.status);
              const paymentStatus = formatStatus(entry.order.paymentStatus);
              const shippingStatus = entry.order.shippingStatus ? formatStatus(entry.order.shippingStatus) : null;
              const placedAt = new Date(entry.order.createdAt).toLocaleString();
              const badgeTone = entry.order.paymentStatus === "failed"
                ? "var(--danger, #ef4444)"
                : entry.order.paymentStatus === "succeeded"
                  ? "var(--success, #22c55e)"
                  : "color-mix(in srgb, var(--color-brand) 70%, transparent)";
              const shippingTone = shippingStatus
                ? entry.order.shippingStatus?.toLowerCase().includes("pending")
                  ? "color-mix(in srgb, var(--muted), transparent)"
                  : "color-mix(in srgb, var(--color-brand) 70%, transparent)"
                : undefined;
              const trackingLabel = entry.order.shippingTracking
                ? entry.order.shippingCarrier
                  ? `${entry.order.shippingCarrier} — ${entry.order.shippingTracking}`
                  : entry.order.shippingTracking
                : sellerView
                  ? "Add tracking when this order ships."
                  : "Tracking will appear once the order ships.";
              return (
                <article key={entry.order.id} className={capTheme.storePanel}>
                  <header className={capTheme.storePanelHeader}>
                    <div>
                      <h3 style={{ margin: 0 }}>Order {orderRef}</h3>
                      <p style={{ margin: 0, color: "var(--muted)" }}>Placed {placedAt}</p>
                      <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
                        Total {formatMoney(entry.order.totalCents, entry.order.currency)}
                        {sellerView
                          ? ` • Net ${formatMoney(netRevenue, entry.order.currency)} after platform fee`
                          : ""}
                      </p>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "flex-end" }}>
                      <span className={capTheme.storeBadge} style={{ background: badgeTone }}>
                        {orderStatus} — {paymentStatus}
                      </span>
                      {shippingStatus ? (
                        <span className={capTheme.storeBadge} style={{ background: shippingTone }}>
                          {shippingStatus}
                        </span>
                      ) : null}
                    </div>
                  </header>
                  {entry.order.shippingStatus ? (
                    <p className={capTheme.checkoutHint}>Shipping: {shippingStatus}</p>
                  ) : null}
                  <ul className={capTheme.checkoutReviewList}>
                    {entry.items.map((item) => (
                      <li key={item.id} className={capTheme.checkoutReviewCard}>
                        <div>
                          <strong>{item.title}</strong>
                          <p>Qty {item.quantity}</p>
                        </div>
                        <div>{formatMoney(item.unitPriceCents, entry.order.currency)}</div>
                      </li>
                    ))}
                  </ul>
                  <div className={capTheme.checkoutTotals} style={{ marginTop: 8 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <div className={capTheme.checkoutTotalRow}>
                        <span>Items</span>
                        <strong>{formatMoney(subtotal, entry.order.currency)}</strong>
                      </div>
                      <div className={capTheme.checkoutTotalRow}>
                        <span>Total</span>
                        <strong>{formatMoney(entry.order.totalCents, entry.order.currency)}</strong>
                      </div>
                    </div>
                    {sellerView ? null : (
                      <span className={capTheme.checkoutHint}>Need anything? Reply to your receipt email.</span>
                    )}
                  </div>
                  <p className={capTheme.checkoutHint} style={{ marginTop: 8 }}>
                    Tracking:{" "}
                    {entry.order.shippingTracking ? (
                      <a href={entry.order.shippingTracking} target="_blank" rel="noreferrer">
                        {trackingLabel}
                      </a>
                    ) : (
                      trackingLabel
                    )}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppPage>
  );
}
