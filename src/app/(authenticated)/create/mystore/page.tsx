import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

import { AppPage } from "@/components/app-page";
import { ensureSupabaseUser } from "@/lib/auth/payload";
import { deriveRequestOrigin } from "@/lib/url";
import {
  CapsuleMembershipError,
  getUserCapsules,
  requireCapsuleOwnership,
  type CapsuleSummary,
} from "@/server/capsules/service";
import { getStoreDashboard, type StoreDashboard } from "@/server/store/dashboard";

import { StoreCapsuleGate } from "./StoreCapsuleGate";
import { StoreNavigation } from "./StoreNavigation";
import { resolveCapsuleAvatar } from "./resolveCapsuleAvatar";
import styles from "./mystore.page.module.css";
import { StoreSetup } from "./StoreSetup";

export const metadata: Metadata = {
  title: "My Store - Capsules",
  description: "Orders, payouts, and catalog controls for your Capsule storefront.",
};

type MyStoreSearchParams = { capsuleId?: string; switch?: string; view?: string };

type MyStorePageProps = { searchParams?: MyStoreSearchParams | Promise<MyStoreSearchParams> };

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

const MOCK_DASHBOARD_ORDERS: StoreDashboard["recentOrders"] = [
  {
    id: "ord_mock_1174",
    confirmationCode: "1174",
    status: "paid",
    paymentStatus: "succeeded",
    shippingStatus: "fulfilled",
    shippingTracking: null,
    shippingCarrier: null,
    createdAt: "2024-04-25T15:12:00.000Z",
    totalCents: 4999,
    netRevenueCents: 4499,
    currency: "usd",
    itemSummary: "Aurora Hoodie",
    itemCount: 1,
  },
  {
    id: "ord_mock_1173",
    confirmationCode: "1173",
    status: "shipped",
    paymentStatus: "succeeded",
    shippingStatus: "shipped",
    shippingTracking: null,
    shippingCarrier: null,
    createdAt: "2024-04-24T17:45:00.000Z",
    totalCents: 8850,
    netRevenueCents: 8120,
    currency: "usd",
    itemSummary: "Galaxy Jersey",
    itemCount: 2,
  },
  {
    id: "ord_mock_1172",
    confirmationCode: "1172",
    status: "paid",
    paymentStatus: "succeeded",
    shippingStatus: "pending",
    shippingTracking: null,
    shippingCarrier: null,
    createdAt: "2024-04-24T09:20:00.000Z",
    totalCents: 2499,
    netRevenueCents: 2300,
    currency: "usd",
    itemSummary: "Neon Keycap Set",
    itemCount: 1,
  },
];

export default async function MyStorePage({ searchParams }: MyStorePageProps) {
  const resolvedSearchParams =
    typeof searchParams === "object" && searchParams !== null && typeof (searchParams as Promise<unknown>).then === "function"
      ? await (searchParams as Promise<MyStoreSearchParams>)
      : ((searchParams as MyStoreSearchParams | undefined) ?? undefined);

  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in?redirect_url=/create/mystore");
  }
  const user = await currentUser();
  if (!user) {
    redirect("/sign-in?redirect_url=/create/mystore");
  }

  const supabaseUserId = await ensureSupabaseUser({
    key: `clerk:${user.id}`,
    provider: "clerk",
    clerk_id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? null,
    full_name: user.fullName ?? null,
    avatar_url: user.imageUrl ?? null,
  });

  const headerList = await headers();
  const requestOrigin = deriveRequestOrigin({ headers: headerList }) ?? null;

  const ownedCapsules = (await getUserCapsules(supabaseUserId, { origin: requestOrigin })).filter(
    (capsule) => capsule.ownership === "owner",
  );
  const requestedCapsuleId = resolvedSearchParams?.capsuleId?.trim() ?? null;
  const selectedCapsule: CapsuleSummary | null =
    (requestedCapsuleId
      ? ownedCapsules.find((capsule) => capsule.id === requestedCapsuleId)
      : ownedCapsules.length === 1
        ? ownedCapsules[0]
        : null) ?? null;
  const { avatarUrl: selectedCapsuleLogo, avatarInitial: selectedCapsuleInitial } =
    resolveCapsuleAvatar(selectedCapsule, requestOrigin);
  const selectedCapsuleId = selectedCapsule?.id ?? null;
  const showSelector = !selectedCapsule && !requestedCapsuleId;
  const switchHref = selectedCapsuleId ? `?capsuleId=${selectedCapsuleId}&switch=1` : "?switch=1";
  const activeNav = resolvedSearchParams?.view === "reports" ? "reports" : "home";

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
  const ordersHref = selectedCapsuleId ? `/create/mystore/orders?capsuleId=${selectedCapsuleId}` : "#";
  const productsHref = selectedCapsuleId ? `/create/mystore/products?capsuleId=${selectedCapsuleId}` : "#";

  const hasSales = summary.grossLast30Cents > 0;
  const hasOrders = summary.totalOrders > 0;

  const headlineMetrics = [
    {
      id: "total_sales",
      label: "Total sales",
      value: formatCents.format(summary.grossLast30Cents / 100),
      hint: hasSales ? "+15.2% from last month" : "No sales yet",
      tone: hasSales ? "up" : "steady",
    },
    {
      id: "orders",
      label: "Orders",
      value: summary.totalOrders.toString(),
      hint: hasOrders ? "+10.4% from last month" : "No orders yet",
      tone: hasOrders ? "up" : "steady",
    },
    {
      id: "visitors",
      label: "Visitors",
      value: "\u2014",
      hint: "Traffic insights coming soon",
      tone: "steady",
    },
  ];

  const recentOrders = dashboard?.recentOrders ?? [];
  const catalog = dashboard?.catalog ?? [];
  const displayRecentOrders = recentOrders.length ? recentOrders : MOCK_DASHBOARD_ORDERS;

  if (showSelector) {
    return (
      <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
        <div className={styles.shell} data-surface="store">
          <header className={`${styles.header} ${styles.headerBare}`}>
            <div className={styles.headerBottom}>
              <StoreCapsuleGate capsules={ownedCapsules} selectedCapsuleId={null} />
            </div>
          </header>
        </div>
      </AppPage>
    );
  }

  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="store">
        <header className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.brand}>
              <div
                className={styles.brandMark}
                aria-hidden="true"
                style={
                  selectedCapsuleLogo
                    ? {
                        backgroundImage: `url("${selectedCapsuleLogo}"), var(--store-brand-gradient)`,
                      }
                    : undefined
                }
              >
                <span className={styles.brandMarkInitial}>{selectedCapsuleInitial}</span>
              </div>
              <div className={styles.brandMeta}>
                <div className={styles.brandTitle}>My Store</div>
                <div className={styles.brandSubtitle}>
                {selectedCapsule
                  ? selectedCapsule.name ?? "Capsule store"
                  : "Use Capsule Gate to pick your store"}
              </div>
            </div>
          </div>
          <div className={styles.headerActions}>
            <Link href={switchHref} className={styles.chipButton} data-variant="ghost">
              Open Capsule Gate
            </Link>
            <button className={styles.iconButtonSimple} type="button" aria-label="Notifications">
              <span className={styles.iconDot} />
              </button>
            </div>
          </div>
          <div className={styles.headerBottom}>
            {showSelector ? (
              <StoreCapsuleGate
                capsules={ownedCapsules}
                selectedCapsuleId={selectedCapsuleId}
              />
            ) : (
              <div className={styles.storeNavCard}>
                <StoreNavigation
                  capsuleId={selectedCapsuleId}
                  active={activeNav}
                  disabled={!selectedCapsule}
                />
              </div>
            )}
          </div>
        </header>

        {dashboardError ? (
          <div className={styles.card} role="status">
            <p className={styles.cardSubtitle}>{dashboardError}</p>
          </div>
        ) : null}

        <main className={styles.layout}>
          <section className={styles.summaryRow} aria-label="Key metrics">
            {headlineMetrics.map((metric) => (
              <div key={metric.id} className={styles.summaryCard} data-tone={metric.tone}>
                <div className={styles.summaryLabel}>{metric.label}</div>
                <div className={styles.summaryValue}>{metric.value}</div>
                <div className={styles.summaryHint}>{metric.hint}</div>
              </div>
            ))}
          </section>

          <section className={styles.columnPrimary} aria-label="Store overview">
            {activeNav === "reports" ? (
              <section className={styles.card} aria-label="Sales overview">
                <header className={styles.cardHeaderRow}>
                  <div>
                    <h2 className={styles.cardTitle}>Sales overview</h2>
                    <p className={styles.cardSubtitle}>Performance for the last 30 days.</p>
                  </div>
                  <button className={styles.rangePill} type="button">
                    Last 30 days
                    <span className={styles.rangeChevron} aria-hidden="true" />
                  </button>
                </header>
                <div className={styles.salesBody}>
                  <div className={styles.salesYAxis}>
                    <span>$1,500</span>
                    <span>$1,000</span>
                    <span>$500</span>
                    <span>$0</span>
                  </div>
                  <div className={styles.salesChart}>
                    <div className={styles.salesChartGrid} aria-hidden="true" />
                    <svg
                      className={styles.salesChartSvg}
                      viewBox="0 0 320 120"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <defs>
                        <linearGradient id="salesLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="var(--color-brand)" />
                          <stop offset="50%" stopColor="color-mix(in srgb, var(--color-brand) 60%, var(--color-accent) 40%)" />
                          <stop offset="100%" stopColor="var(--color-accent)" />
                        </linearGradient>
                        <linearGradient id="salesAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="color-mix(in srgb, var(--color-brand) 55%, var(--color-accent) 45%)" stopOpacity="0.45" />
                          <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                      </defs>
                      <path
                        className={styles.salesChartArea}
                        d="M0 86 C 32 40, 64 24, 96 60 C 128 96, 160 40, 192 52 C 224 64, 256 30, 288 48 C 304 56, 320 70, 320 70 L 320 120 L 0 120 Z"
                        fill="url(#salesAreaGradient)"
                      />
                      <path
                        className={styles.salesChartStroke}
                        d="M0 86 C 32 40, 64 24, 96 60 C 128 96, 160 40, 192 52 C 224 64, 256 30, 288 48 C 304 56, 320 70, 320 70"
                        fill="none"
                        stroke="url(#salesLineGradient)"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                      <g className={styles.salesChartDots}>
                        <circle cx="0" cy="86" r="3.5" />
                        <circle cx="64" cy="24" r="3.5" />
                        <circle cx="128" cy="96" r="3.5" />
                        <circle cx="192" cy="52" r="3.5" />
                        <circle cx="256" cy="30" r="3.5" />
                        <circle cx="320" cy="70" r="3.5" />
                      </g>
                    </svg>
                  </div>
                </div>
                <div className={styles.salesXAxis}>
                  <span>Apr 1</span>
                  <span>Apr 10</span>
                  <span>Apr 20</span>
                  <span>Apr 30</span>
                </div>
              </section>
            ) : null}

            {activeNav !== "reports" ? (
              <StoreSetup capsuleId={selectedCapsuleId} />
            ) : null}

            {activeNav !== "reports" ? (
              <section className={styles.card} aria-label="Orders">
                <header className={styles.cardHeaderRow}>
                  <div>
                    <h2 className={styles.cardTitle}>Orders</h2>
                    <p className={styles.cardSubtitle}>Latest activity from your store.</p>
                  </div>
                  <Link
                    href={selectedCapsule ? ordersHref : "#"}
                    className={styles.cardLink}
                    aria-disabled={!selectedCapsule}
                    data-disabled={!selectedCapsule ? "true" : undefined}
                    tabIndex={!selectedCapsule ? -1 : undefined}
                  >
                    View all
                  </Link>
                </header>
                {displayRecentOrders.length ? (
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.tableHeaderCell}>Order</th>
                        <th className={styles.tableHeaderCell}>Date</th>
                        <th className={styles.tableHeaderCell}>Summary</th>
                        <th className={styles.tableHeaderCell}>Status</th>
                        <th className={styles.tableHeaderCellRight}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayRecentOrders.map((order) => {
                        const ref = order.confirmationCode ?? order.id.slice(0, 8);
                        const date = new Date(order.createdAt);
                        const formattedDate = date.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        });
                        const statusTone = toneForStatus(order.paymentStatus);
                        return (
                          <tr key={order.id}>
                            <td className={styles.tableCellMuted}>#{ref}</td>
                            <td className={styles.tableCellMuted}>{formattedDate}</td>
                            <td className={styles.tableCellPrimary}>
                              {order.itemSummary}
                              {order.itemCount > 1 ? ` (+${order.itemCount - 1} more)` : ""}
                            </td>
                            <td className={styles.tableCellStatus}>
                              <span className={styles.statusPill} data-tone={statusTone}>
                                {formatStatus(order.paymentStatus)}
                              </span>
                            </td>
                            <td className={styles.tableCellRight}>
                              {formatCents.format(order.totalCents / 100)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className={styles.emptyCard}>
                    <p>No orders yet. New purchases will appear here.</p>
                  </div>
                )}
              </section>
            ) : null}
          </section>

          {activeNav !== "reports" ? (
            <section className={styles.columnSecondary} aria-label="Products and payouts">
            <section className={styles.card} aria-label="Products">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Products</h2>
                  <p className={styles.cardSubtitle}>
                    Active and featured products that buyers see in your store.
                  </p>
                </div>
                <Link
                  href={selectedCapsule ? productsHref : "#"}
                  className={styles.cardLink}
                  aria-disabled={!selectedCapsule}
                  data-disabled={!selectedCapsule ? "true" : undefined}
                  tabIndex={!selectedCapsule ? -1 : undefined}
                >
                  View all
                </Link>
              </header>
              {catalog.length ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.tableHeaderCell}>Product</th>
                      <th className={styles.tableHeaderCellRight}>Price</th>
                      <th className={styles.tableHeaderCellRight}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((item) => (
                      <tr key={item.id}>
                        <td className={styles.tableCellPrimary}>{item.title}</td>
                        <td className={styles.tableCellRight}>
                          <span className={styles.pricePositive}>
                            {formatCents.format(item.priceCents / 100)}
                          </span>
                        </td>
                        <td className={styles.tableCellRight}>
                          <span
                            className={styles.productStatus}
                            data-status={item.active ? "live" : "draft"}
                          >
                            {item.active ? "Live" : "Draft"}
                            {item.featured ? " - Featured" : ""}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={styles.emptyCard}>
                  <p>No products yet. Add an item from the store editor.</p>
                </div>
              )}
            </section>

            </section>
          ) : null}
        </main>
      </div>
    </AppPage>
  );
}
