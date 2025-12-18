import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { ChartLine, Coins, Storefront, TrendDown, TrendUp, UsersThree } from "@phosphor-icons/react/dist/ssr";

import { AppPage } from "@/components/app-page";
import {
  fetchAnalyticsOverview,
  fetchDailyActiveUsers,
  fetchDailyPosts,
  fetchEconomyOverview,
  type EconomyOverview,
} from "@/lib/analytics";

import styles from "./page.module.css";

type TimeSeries = {
  label: string;
  points: { date: string; value: number }[];
};

type OverviewMetric = {
  label: string;
  value: number;
  hint?: string;
};

type EconomyMetric = {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
};

export const metadata = {
  title: "Admin Overview - Capsules",
  description: "High-level analytics for Capsules",
  robots: { index: false },
};

export default async function AdminOverviewPage() {
  const { userId } = await auth();
  if (!userId) {
    return (
      <AppPage showPrompter={false}>
        <div className={styles.unauthorized}>You must be signed in to view admin analytics.</div>
      </AppPage>
    );
  }

  const overview = await fetchAnalyticsOverview();
  const dailyActive = await fetchDailyActiveUsers(14);
  const dailyPosts = await fetchDailyPosts(14);
  const economy: EconomyOverview = await fetchEconomyOverview();

  const overviewMetrics: OverviewMetric[] = [
    { label: "Total users", value: overview.totalUsers },
    { label: "Active users (30d)", value: overview.activeUsers30d },
    { label: "Active users (7d)", value: overview.activeUsers7d },
    { label: "Capsules created", value: overview.capsulesCreated },
    { label: "Posts (24h)", value: overview.postsCreated24h },
    { label: "Friend connections", value: overview.friendsConnections },
  ];

  const economyMetrics: EconomyMetric[] = buildEconomyMetrics(economy);

  const series: TimeSeries[] = [
    { label: "Daily active users", points: dailyActive },
    { label: "Daily posts", points: dailyPosts },
  ];

  return (
    <AppPage showPrompter={false}>
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Admin Overview</h1>
            <p className={styles.subtitle}>Key metrics for Capsules operations.</p>
          </div>
          <Link className={styles.link} href="/">
            Back to app
          </Link>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Snapshot</h2>
          <div className={styles.metricGrid}>
            {overviewMetrics.map((metric) => (
              <article key={metric.label} className={styles.metricCard}>
                <span className={styles.metricLabel}>{metric.label}</span>
                <span className={styles.metricValue}>{metric.value.toLocaleString()}</span>
                {metric.hint ? <span className={styles.metricHint}>{metric.hint}</span> : null}
              </article>
            ))}
          </div>
          <div className={styles.refreshNote}>
            Last snapshot: {new Date(overview.lastSync).toLocaleString()}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Economy</h2>
          <div className={styles.metricGrid}>
            {economyMetrics.map((metric) => (
              <article key={metric.label} className={styles.metricCard}>
                <div className={styles.metricHeader}>
                  {metric.icon ? <span className={styles.metricIcon}>{metric.icon}</span> : null}
                  <span className={styles.metricLabel}>{metric.label}</span>
                </div>
                <span className={styles.metricValue}>{metric.value}</span>
                {metric.hint ? <span className={styles.metricHint}>{metric.hint}</span> : null}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Trends</h2>
          <div className={styles.seriesGrid}>
            {series.map((serie) => (
              <article key={serie.label} className={styles.seriesCard}>
                <header className={styles.seriesHeader}>{serie.label}</header>
                <div className={styles.seriesBody}>
                  <div className={styles.sparkline}>
                    {(() => {
                      if (serie.points.length === 0)
                        return <span className={styles.empty}>No data</span>;
                      const first = serie.points[0]?.value ?? 0;
                      const last = serie.points[serie.points.length - 1]?.value ?? first;
                      const Icon = last > first ? TrendUp : last < first ? TrendDown : ChartLine;
                      return <Icon weight="duotone" className={styles.trendIcon} />;
                    })()}
                  </div>
                  <ul className={styles.seriesList}>
                    {serie.points.slice(-5).map((point) => (
                      <li key={point.date} className={styles.seriesItem}>
                        <span>{new Date(point.date).toLocaleDateString()}</span>
                        <span>{point.value.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppPage>
  );
}

function formatCurrencyCents(cents: number, currency: string = "usd"): string {
  const amount = (cents ?? 0) / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatCredits(credits: number): string {
  const value = Number.isFinite(credits) ? credits : 0;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M credits`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k credits`;
  return `${Math.round(value)} credits`;
}

function formatCount(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return num.toLocaleString();
}

function buildEconomyMetrics(economy: EconomyOverview): EconomyMetric[] {
  const platformWalletAvailable =
    (economy.platformWallet?.computeGranted ?? 0) - (economy.platformWallet?.computeUsed ?? 0);

  const paidUserSubs =
    (economy.userSubscriptionCounts["user_creator"] ?? 0) +
    (economy.userSubscriptionCounts["user_pro"] ?? 0) +
    (economy.userSubscriptionCounts["user_studio"] ?? 0);

  const capsuleUpgradesTotal = Object.values(economy.capsuleSubscriptionCounts).reduce(
    (sum, value) => sum + value,
    0,
  );

  return [
    {
      label: "Store gross (paid orders)",
      value: formatCurrencyCents(economy.storeGrossCents),
      hint: `Platform fees: ${formatCurrencyCents(economy.storePlatformFeeCents)}`,
      icon: <Storefront size={16} weight="bold" />,
    },
    {
      label: "Store payouts (paid)",
      value: formatCurrencyCents(economy.storePaidPayoutCents),
      hint: "Total sent to creators (all time)",
      icon: <Coins size={16} weight="bold" />,
    },
    {
      label: "Active paid personal subs",
      value: formatCount(paidUserSubs),
      hint: `Plus: ${formatCount(economy.userSubscriptionCounts["user_creator"] ?? 0)}, Pro: ${formatCount(
        economy.userSubscriptionCounts["user_pro"] ?? 0,
      )}, Studio: ${formatCount(
        economy.userSubscriptionCounts["user_studio"] ?? 0,
      )}`,
      icon: <UsersThree size={16} weight="bold" />,
    },
    {
      label: "Capsule upgrades (subs)",
      value: formatCount(capsuleUpgradesTotal),
      hint: "Total active capsule-scope plans",
      icon: <ChartLine size={16} weight="bold" />,
    },
    {
      label: "Capsule Pass volume",
      value: formatCredits(economy.capsulePassFundingCredits),
      hint: `Platform cut: ${formatCredits(economy.capsulePassPlatformCredits)}`,
      icon: <Coins size={16} weight="bold" />,
    },
    {
      label: "Capsule Power volume",
      value: formatCredits(economy.capsulePowerFundingCredits),
      hint: `Platform cut: ${formatCredits(economy.capsulePowerPlatformCredits)}`,
      icon: <Coins size={16} weight="bold" />,
    },
    {
      label: "Platform wallet (compute)",
      value: formatCredits(platformWalletAvailable),
      hint: `Granted: ${formatCredits(economy.platformWallet?.computeGranted ?? 0)}, Used: ${formatCredits(
        economy.platformWallet?.computeUsed ?? 0,
      )}`,
      icon: <Coins size={16} weight="bold" />,
    },
  ];
}
