import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

import { AppPage } from "@/components/app-page";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { CapsuleMembershipError, getUserCapsules, requireCapsuleOwnership } from "@/server/capsules/service";
import { getStoreDashboard, type StoreDashboard } from "@/server/store/dashboard";

import styles from "./growth.page.module.css";

export const metadata: Metadata = {
  title: "My Store - Capsules",
  description: "Orders, payouts, and catalog controls for your Capsule storefront.",
};

type MyStorePageProps = { searchParams?: { capsuleId?: string } };

const EMPTY_SUMMARY = {
  grossLast30Cents: 0,
  netLast30Cents: 0,
  totalOrders: 0,
  openOrders: 0,
  inTransitOrders: 0,
  fulfilledOrders: 0,
  failedOrders: 0,
  pendingPayment: 0,
  lastOrderAt: null as string | null,
};

function formatStatus(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function toneForStatus(value: string): "success" | "warning" | "danger" | "info" {
  const normalized = value.toLowerCase();
  if (normalized.includes("failed") || normalized.includes("canceled")) return "danger";
  if (normalized.includes("pending") || normalized.includes("requires")) return "warning";
  if (normalized.includes("succeeded") || normalized.includes("fulfilled")) return "success";
  return "info";
}

function buildFormatter(currency: string) {
  const normalized = currency && currency.trim().length ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalized,
    maximumFractionDigits: 2,
  });
}

export default async function MyStorePage({ searchParams }: MyStorePageProps) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/create/growth");
  }
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/create/growth");
  }

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
  });

  const ownedCapsules = (await getUserCapsules(supabaseUserId)).filter((capsule) => capsule.ownership === "owner");
  const requestedCapsuleId = searchParams?.capsuleId?.trim() ?? null;
  const selectedCapsule =
    (requestedCapsuleId ? ownedCapsules.find((capsule) => capsule.id === requestedCapsuleId) : null) ??
    ownedCapsules[0] ??
    null;

  let dashboard: StoreDashboard | null = null;
  let dashboardError: string | null = null;

  if (selectedCapsule) {
    try {
      await requireCapsuleOwnership(selectedCapsule.id, supabaseUserId);
      dashboard = await getStoreDashboard(selectedCapsule.id);
    } catch (error) {
      dashboardError =
        error instanceof CapsuleMembershipError
          ? error.message
          : "Unable to load store metrics right now.";
    }
  } else if (requestedCapsuleId) {
    dashboardError = "You do not own this capsule.";
  }

  const summary = dashboard?.summary ?? EMPTY_SUMMARY;
  const currency = dashboard?.currency ?? "usd";
  const formatCents = buildFormatter(currency);
  const manageHref = selectedCapsule ? `/capsule?capsuleId=${selectedCapsule.id}&tab=store` : "#";
  const ordersHref = selectedCapsule ? `/orders?capsuleId=${selectedCapsule.id}` : "#";
  const payoutsHref = manageHref;

  const overviewMetrics = [
    {
      id: "gross_30d",
      label: "Gross (30d)",
      value: formatCents.format(summary.grossLast30Cents / 100),
      hint: "Before platform fees",
      tone: summary.grossLast30Cents > 0 ? "up" : "steady",
    },
    {
      id: "net_30d",
      label: "Net (30d)",
      value: formatCents.format(summary.netLast30Cents / 100),
      hint: "After platform fee",
      tone: summary.netLast30Cents > 0 ? "up" : "steady",
    },
    {
      id: "open_orders",
      label: "Open orders",
      value: summary.openOrders.toString(),
      hint: "Needs fulfillment",
      tone: summary.openOrders ? "steady" : "up",
    },
    {
      id: "in_transit",
      label: "In transit",
      value: summary.inTransitOrders.toString(),
      hint: "On the way to buyers",
      tone: "steady",
    },
  ];

  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="store">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>My Store</div>
            <h1 className={styles.title}>Run your Capsule storefront</h1>
            <p className={styles.subtitle}>
              Select a capsule to review revenue, orders, payouts, and your live catalog.
            </p>
            <div className={styles.capsuleSwitcher}>
              {ownedCapsules.length ? (
                ownedCapsules.map((capsule) => (
                  <a
                    key={capsule.id}
                    className={styles.chipButton}
                    data-active={capsule.id === selectedCapsule?.id ? "true" : undefined}
                    href={`?capsuleId=${capsule.id}`}
                  >
                    {capsule.name || "Untitled capsule"}
                  </a>
                ))
              ) : (
                <p className={styles.emptyHint}>
                  You don&apos;t own a capsule yet. Launch one from your Capsule page to start selling.
                </p>
              )}
            </div>
            <div className={styles.headerActions}>
              <a
                href={manageHref}
                className={styles.chipButton}
                aria-disabled={!selectedCapsule}
                data-disabled={!selectedCapsule ? "true" : undefined}
              >
                Manage products
              </a>
              <a
                href={ordersHref}
                className={styles.chipButton}
                aria-disabled={!selectedCapsule}
                data-disabled={!selectedCapsule ? "true" : undefined}
              >
                View all orders
              </a>
              <a
                href={payoutsHref}
                className={styles.chipButton}
                aria-disabled={!selectedCapsule}
                data-disabled={!selectedCapsule ? "true" : undefined}
              >
                Orders &amp; payouts
              </a>
            </div>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Open orders</div>
              <div className={styles.metricValue}>{summary.openOrders}</div>
              <div className={styles.metricHint}>Needs fulfillment</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Gross last 30 days</div>
              <div className={styles.metricValue}>
                {formatCents.format(summary.grossLast30Cents / 100)}
              </div>
              <div className={styles.metricHint}>
                {summary.totalOrders ? `${summary.totalOrders} orders` : "No orders yet"}
              </div>
            </div>
          </div>
        </header>

        {dashboardError ? (
          <div className={styles.card} role="status">
            <p className={styles.cardSubtitle}>{dashboardError}</p>
          </div>
        ) : null}

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Store overview">
            <section className={styles.cardAccent} aria-label="Store metrics">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>
                    {selectedCapsule ? selectedCapsule.name ?? "Capsule store" : "Choose a capsule"}
                  </h2>
                  <p className={styles.cardSubtitle}>
                    {selectedCapsule
                      ? "Live numbers from your storefront."
                      : "Pick a capsule you own to view orders and revenue."}
                  </p>
                </div>
              </header>
              <div className={styles.overviewGrid}>
                {overviewMetrics.map((metric) => (
                  <div
                    key={metric.id}
                    className={styles.metricTile}
                    data-metric-id={metric.id}
                    data-tone={metric.tone}
                  >
                    <div className={styles.metricTileLabel}>{metric.label}</div>
                    <div className={styles.metricTileValue}>{metric.value}</div>
                    <div className={styles.metricTileTrend}>{metric.hint}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.card} aria-label="Orders and catalog summary">
              <div className={styles.cardRow}>
                <section className={styles.cardColumn} aria-label="Orders overview">
                  <header className={styles.cardHeaderRow}>
                    <div>
                      <h2 className={styles.cardTitle}>Recent orders</h2>
                      <p className={styles.cardSubtitle}>
                        Watch payment, fulfillment, and tracking progress.
                      </p>
                    </div>
                    <a
                      href={ordersHref}
                      className={styles.chipButton}
                      aria-disabled={!selectedCapsule}
                      data-disabled={!selectedCapsule ? "true" : undefined}
                    >
                      View all
                    </a>
                  </header>
                  {dashboard?.recentOrders?.length ? (
                    <ul className={styles.orderList}>
                      {dashboard.recentOrders.map((order) => {
                        const ref = order.confirmationCode ?? order.id.slice(0, 8);
                        const tone = toneForStatus(order.paymentStatus);
                        const shippingTone = toneForStatus(order.shippingStatus);
                        return (
                          <li key={order.id} className={styles.orderRow}>
                            <div className={styles.orderMetaBlock}>
                              <div className={styles.orderTitle}>Order {ref}</div>
                              <p className={styles.orderMeta}>{new Date(order.createdAt).toLocaleString()}</p>
                              <p className={styles.orderMeta}>
                                {order.itemSummary}
                                {order.itemCount > 1 ? ` (+${order.itemCount - 1} more)` : ""}
                              </p>
                            </div>
                            <div className={styles.orderRowMeta}>
                              <div className={styles.statusGroup}>
                                <span className={styles.statusPill} data-tone={tone}>
                                  {formatStatus(order.paymentStatus)}
                                </span>
                                <span className={styles.statusPill} data-tone={shippingTone}>
                                  {formatStatus(order.shippingStatus)}
                                </span>
                              </div>
                              <strong className={styles.orderTotal}>
                                {formatCents.format(order.totalCents / 100)}
                              </strong>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className={styles.emptyCard}>
                      <p>No orders yet. New purchases will appear here.</p>
                    </div>
                  )}
                </section>

                <section className={styles.cardColumn} aria-label="Catalog highlights">
                  <header className={styles.cardHeaderRow}>
                    <div>
                      <h2 className={styles.cardTitle}>Catalog</h2>
                      <p className={styles.cardSubtitle}>
                        Active and featured products that buyers see in your store.
                      </p>
                    </div>
                    <a
                      href={manageHref}
                      className={styles.chipButton}
                      aria-disabled={!selectedCapsule}
                      data-disabled={!selectedCapsule ? "true" : undefined}
                    >
                      Manage products
                    </a>
                  </header>
                  {dashboard?.catalog?.length ? (
                    <ul className={styles.catalogList}>
                      {dashboard.catalog.map((item) => (
                        <li
                          key={item.id}
                          className={styles.catalogItem}
                          data-status={item.active ? "live" : "draft"}
                          data-product-id={item.id}
                        >
                          <div className={styles.catalogMeta}>
                            <div className={styles.catalogName}>{item.title}</div>
                            <p className={styles.catalogPrice}>
                              {formatCents.format(item.priceCents / 100)} • {item.kind}
                            </p>
                          </div>
                          <span className={styles.catalogStatus}>
                            {item.active ? "Live" : "Draft"}
                            {item.featured ? " • Featured" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className={styles.emptyCard}>
                      <p>No products yet. Add an item from the store editor.</p>
                    </div>
                  )}
                </section>
              </div>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Payouts and operations">
            <section className={styles.card} aria-label="Payouts and balances">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Orders &amp; payouts</h2>
                <p className={styles.cardSubtitle}>
                  Stripe Connect setup and seller orders live inside the Capsule store editor.
                </p>
              </header>
              <ul className={styles.linkList}>
                <li className={styles.linkItem}>
                  <div className={styles.linkMeta}>
                    <div className={styles.linkLabel}>Open store editor</div>
                    <p className={styles.linkHint}>
                      Switch to founder mode to update products, shipping, and payouts.
                    </p>
                  </div>
                  <a
                    className={styles.chipButton}
                    href={manageHref}
                    aria-disabled={!selectedCapsule}
                    data-disabled={!selectedCapsule ? "true" : undefined}
                  >
                    Open store
                  </a>
                </li>
                <li className={styles.linkItem}>
                  <div className={styles.linkMeta}>
                    <div className={styles.linkLabel}>Stripe Connect status</div>
                    <p className={styles.linkHint}>
                      Finish onboarding in the store&apos;s “Orders & payouts” section. Until then, payments
                      may route through the platform account.
                    </p>
                  </div>
                  <a
                    className={styles.chipButton}
                    href={payoutsHref}
                    aria-disabled={!selectedCapsule}
                    data-disabled={!selectedCapsule ? "true" : undefined}
                  >
                    Go to payouts
                  </a>
                </li>
              </ul>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}
