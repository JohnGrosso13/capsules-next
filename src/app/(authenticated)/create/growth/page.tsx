import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./growth.page.module.css";

type TrendTone = "up" | "down" | "steady";

type StoreMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: TrendTone;
};

type OrdersSummary = {
  id: string;
  label: string;
  count: string;
  hint: string;
};

type CatalogItem = {
  id: string;
  name: string;
  status: "live" | "draft" | "paused";
  price: string;
};

type PayoutSummary = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

const OVERVIEW_METRICS: StoreMetric[] = [
  {
    id: "revenue_today",
    label: "Today&apos;s revenue",
    value: "$1,240",
    detail: "+18% vs last 7 days",
    tone: "up",
  },
  {
    id: "open_orders",
    label: "Open orders",
    value: "12",
    detail: "3 need fulfillment today",
    tone: "steady",
  },
  {
    id: "conversion_rate",
    label: "Conversion rate",
    value: "3.4%",
    detail: "+0.6 pts vs last week",
    tone: "up",
  },
  {
    id: "avg_order",
    label: "Avg. order value",
    value: "$42.80",
    detail: "Across the last 30 days",
    tone: "steady",
  },
];

const ORDERS_SUMMARY: OrdersSummary[] = [
  {
    id: "pending_fulfillment",
    label: "Pending fulfillment",
    count: "5",
    hint: "Packed but not yet shipped.",
  },
  {
    id: "awaiting_payment",
    label: "Awaiting payment",
    count: "2",
    hint: "Authorized but not yet captured.",
  },
  {
    id: "in_transit",
    label: "In transit",
    count: "9",
    hint: "On the way to buyers.",
  },
];

const CATALOG_ITEMS: CatalogItem[] = [
  {
    id: "jersey",
    name: "Team jersey (home)",
    status: "live",
    price: "$65.00",
  },
  {
    id: "mousepad",
    name: "Capsules desk mat",
    status: "live",
    price: "$28.00",
  },
  {
    id: "coaching",
    name: "1:1 coaching session",
    status: "draft",
    price: "$95.00",
  },
];

const PAYOUT_SUMMARY: PayoutSummary[] = [
  {
    id: "next_payout",
    label: "Next payout",
    value: "$2,480.20",
    hint: "Scheduled for Friday via Stripe.",
  },
  {
    id: "last_30_days",
    label: "Last 30 days",
    value: "$7,920.40",
    hint: "Net after fees and refunds.",
  },
  {
    id: "refunds",
    label: "Refund rate",
    value: "1.2%",
    hint: "Below marketplace average.",
  },
];

export const metadata: Metadata = {
  title: "My Store - Capsules",
  description:
    "Analytics for your Capsule storefront: revenue, orders, products, and payouts in one place.",
};

export default function MyStorePage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="store">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>My Store</div>
            <h1 className={styles.title}>Run your Capsule storefront</h1>
            <p className={styles.subtitle}>
              Track revenue, manage orders, and keep your products, payouts, and store settings in one place.
            </p>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Store status</div>
              <div className={styles.metricValue}>Live</div>
              <div className={styles.metricHint}>Visible to buyers on Market</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Fulfillment queue</div>
              <div className={styles.metricValue}>5 orders</div>
              <div className={styles.metricHint}>Pack and ship today</div>
            </div>
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Store overview and commerce surface">
            <section className={styles.cardAccent} aria-label="Store overview">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Overview</h2>
                  <p className={styles.cardSubtitle}>
                    High-level performance across revenue, orders, and conversion. Use this to understand how your
                    store is performing at a glance.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Change Capsule
                </button>
              </header>
              <div className={styles.overviewGrid}>
                {OVERVIEW_METRICS.map((metric) => (
                  <div
                    key={metric.id}
                    className={styles.metricTile}
                    data-metric-id={metric.id}
                    data-tone={metric.tone}
                  >
                    <div className={styles.metricTileLabel}>{metric.label}</div>
                    <div className={styles.metricTileValue}>{metric.value}</div>
                    <div className={styles.metricTileTrend}>{metric.detail}</div>
                  </div>
                ))}
              </div>

              <div className={styles.miniTimeline}>
                <div className={styles.miniTimelineHeader}>
                  <span className={styles.miniTimelineLabel}>Revenue over time</span>
                  <div className={styles.miniTimelineFilters}>
                    <button type="button" className={styles.chipButton} data-variant="ghost">
                      7 days
                    </button>
                    <button type="button" className={styles.chipButton} data-variant="ghost">
                      30 days
                    </button>
                    <button type="button" className={styles.chipButton} data-variant="ghost">
                      90 days
                    </button>
                  </div>
                </div>
                <div className={styles.miniTimelineCanvas} aria-hidden="true">
                  <div className={styles.miniTimelineGlow} />
                  <div className={styles.miniTimelineLine} />
                </div>
              </div>
            </section>

            <section className={styles.card} aria-label="Orders and catalog summary">
              <div className={styles.cardRow}>
                <section className={styles.cardColumn} aria-label="Orders overview">
                  <header className={styles.cardHeaderRow}>
                    <div>
                      <h2 className={styles.cardTitle}>Orders</h2>
                      <p className={styles.cardSubtitle}>
                        Keep an eye on what needs attention &mdash; fulfillment, payment, and shipping state.
                      </p>
                    </div>
                    <a href="/orders?capsuleId=" className={styles.chipButton}>
                      View all
                    </a>
                  </header>
                  <div className={styles.segmentGrid}>
                    {ORDERS_SUMMARY.map((entry) => (
                      <div key={entry.id} className={styles.segmentTile}>
                        <div className={styles.segmentLabel}>{entry.label}</div>
                        <div className={styles.segmentValue}>{entry.count}</div>
                        <p className={styles.segmentHint}>{entry.hint}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.cardColumn} aria-label="Catalog highlights">
                  <header className={styles.cardHeaderRow}>
                    <div>
                      <h2 className={styles.cardTitle}>Catalog</h2>
                      <p className={styles.cardSubtitle}>
                        A quick snapshot of featured products and their current status.
                      </p>
                    </div>
                    <button type="button" className={styles.chipButton}>
                      Manage products
                    </button>
                  </header>
                  <ul className={styles.catalogList}>
                    {CATALOG_ITEMS.map((item) => (
                      <li
                        key={item.id}
                        className={styles.catalogItem}
                        data-status={item.status}
                        data-product-id={item.id}
                      >
                        <div className={styles.catalogMeta}>
                          <div className={styles.catalogName}>{item.name}</div>
                          <p className={styles.catalogPrice}>{item.price}</p>
                        </div>
                        <span className={styles.catalogStatus}>{item.status}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Payouts and balances">
            <section className={styles.card} aria-label="Payouts and balances">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Payouts &amp; balances</h2>
                <p className={styles.cardSubtitle}>
                  High-level view of what&apos;s on the way to you and how your store is performing financially.
                </p>
              </header>
              <ul className={styles.playbookList}>
                {PAYOUT_SUMMARY.map((entry) => (
                  <li key={entry.id} className={styles.playbookItem}>
                    <div className={styles.playbookMeta}>
                      <div className={styles.playbookTitle}>{entry.label}</div>
                      <p className={styles.playbookHint}>{entry.hint}</p>
                    </div>
                    <button type="button" className={styles.playbookCta}>
                      {entry.value}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}
