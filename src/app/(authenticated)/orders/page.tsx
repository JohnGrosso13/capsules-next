
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
              : "Recent purchases and tracking."}
          </p>
        </header>

        {ordersError ? (
          <div className={capTheme.storePanel}>
            <p>{ordersError}</p>
          </div>
        ) : !orders.length ? (
          <div className={capTheme.storePanel}>
            <p>{sellerView ? "No orders yet for this capsule." : "You have no orders yet."}</p>
          </div>
        ) : (
          <div className={capTheme.storeGrid}>
            {orders.map((entry) => {
              const status = sellerView
                ? `${entry.order.status} · ${entry.order.paymentStatus}`
                : entry.order.status;
              const subtotal = entry.items.reduce(
                (sum, item) => sum + item.unitPriceCents * item.quantity,
                0,
              );
              return (
                <article key={entry.order.id} className={capTheme.storePanel}>
                  <header className={capTheme.storePanelHeader}>
                    <div>
                      <h3 style={{ margin: 0 }}>
                        Order {entry.order.confirmationCode ?? entry.order.id.slice(0, 8)}
                      </h3>
                      <p style={{ margin: 0, color: "var(--muted)" }}>
                        Placed {new Date(entry.order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className={capTheme.storeBadge}>{status}</span>
                  </header>
                  {entry.order.shippingStatus ? (
                    <p className={capTheme.checkoutHint}>Shipping: {entry.order.shippingStatus}</p>
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
                    <div>
                      <span>Items</span>
                      <strong>{formatMoney(subtotal, entry.order.currency)}</strong>
                    </div>
                    <div className={capTheme.checkoutTotalRow}>
                      <span>Total</span>
                      <strong>{formatMoney(entry.order.totalCents, entry.order.currency)}</strong>
                    </div>
                  </div>
                  {entry.order.shippingTracking ? (
                    <p className={capTheme.checkoutHint}>
                      Tracking:{" "}
                      <a href={entry.order.shippingTracking} target="_blank" rel="noreferrer">
                        {entry.order.shippingTracking}
                      </a>{" "}
                      {entry.order.shippingCarrier ? `(${entry.order.shippingCarrier})` : null}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppPage>
  );
}
