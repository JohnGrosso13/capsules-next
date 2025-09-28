import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { TrendUp, TrendDown, ChartLine } from "@phosphor-icons/react/dist/ssr";

import { AppPage } from "@/components/app-page";
import { fetchAnalyticsOverview, fetchDailyActiveUsers, fetchDailyPosts } from "@/lib/analytics";

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

  const overviewMetrics: OverviewMetric[] = [
    { label: "Total users", value: overview.totalUsers },
    { label: "Active users (30d)", value: overview.activeUsers30d },
    { label: "Active users (7d)", value: overview.activeUsers7d },
    { label: "Capsules created", value: overview.capsulesCreated },
    { label: "Posts (24h)", value: overview.postsCreated24h },
    { label: "Friend connections", value: overview.friendsConnections },
  ];

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
          <h2 className={styles.sectionTitle}>Trends</h2>
          <div className={styles.seriesGrid}>
            {series.map((serie) => (
              <article key={serie.label} className={styles.seriesCard}>
                <header className={styles.seriesHeader}>{serie.label}</header>
                <div className={styles.seriesBody}>
                  <div className={styles.sparkline}>
                    {(() => {
                      if (serie.points.length === 0) return <span className={styles.empty}>No data</span>;
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
