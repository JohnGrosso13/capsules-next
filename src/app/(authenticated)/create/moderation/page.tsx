import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./moderation.page.module.css";

type AlertMetric = {
  id: string;
  label: string;
  value: number;
  delta: string;
  trend: "up" | "down";
};

type ReviewItem = {
  id: string;
  issue: string;
  user: string;
  contentType: string;
  status: "pending" | "flagged" | "removed";
  accent: "indigo" | "amber" | "rose" | "teal";
};

type RecentAlert = {
  id: string;
  label: string;
  stream: string;
  creator: string;
  flaggedAt: string;
  resolvedAt: string;
  accent: "rose" | "amber" | "blue" | "indigo";
};

type SafetyControl = {
  id: string;
  title: string;
  description?: string;
  enabled?: boolean;
  actionLabel?: string;
};

const ALERT_METRICS: AlertMetric[] = [
  { id: "suspicious", label: "Suspicious Reports", value: 174, delta: "+42% from yesterday", trend: "up" },
  { id: "actions", label: "Action Taken Today", value: 52, delta: "+44% from yesterday", trend: "up" },
  { id: "violations", label: "Stream Violations Today", value: 18, delta: "+50% from yesterday", trend: "up" },
  { id: "blocks", label: "Auto Blocks Today", value: 83, delta: "+20% from yesterday", trend: "up" },
];

const REVIEW_QUEUE: ReviewItem[] = [
  {
    id: "queue-01",
    issue: "Live match flagged for toxic voice chat",
    user: "User_Guy07",
    contentType: "Live Stream",
    status: "pending",
    accent: "indigo",
  },
  {
    id: "queue-02",
    issue: "AI image blurred for explicit content risk",
    user: "GamerKing",
    contentType: "Image Upload",
    status: "flagged",
    accent: "rose",
  },
  {
    id: "queue-03",
    issue: "Profile update contains hateful slur",
    user: "SaltyT1",
    contentType: "Profile Update",
    status: "pending",
    accent: "amber",
  },
  {
    id: "queue-04",
    issue: "VOD removed for spam link blast",
    user: "AndyTop99",
    contentType: "Recorded Stream",
    status: "removed",
    accent: "teal",
  },
];

const RECENT_ALERTS: RecentAlert[] = [
  {
    id: "alert-01",
    label: "Hate Speech",
    stream: "SwiftSniper",
    creator: "SwiftSniper",
    flaggedAt: "12:23 PM",
    resolvedAt: "12:23 PM",
    accent: "rose",
  },
  {
    id: "alert-02",
    label: "Spam/Scam",
    stream: `"Free:Gift Cers.Link!"`,
    creator: "GamerKing",
    flaggedAt: "11:44 AM",
    resolvedAt: "11:50 AM",
    accent: "amber",
  },
  {
    id: "alert-03",
    label: "Bullying",
    stream: "Epic Monster Hunter",
    creator: "Epic Monster Hunter",
    flaggedAt: "10:50 AM",
    resolvedAt: "10:30 AM",
    accent: "blue",
  },
  {
    id: "alert-04",
    label: "Explicit Content",
    stream: "Co Op Maich",
    creator: "Co Op Maich",
    flaggedAt: "9:37 AM",
    resolvedAt: "9:37 AM",
    accent: "indigo",
  },
];

const SAFETY_CONTROLS: SafetyControl[] = [
  {
    id: "profanity",
    title: "Profanity Filter",
    description: "Auto-hide slurs and abusive language",
    enabled: true,
  },
  {
    id: "ai-image",
    title: "AI Image Filtering",
    description: "Scan uploads for gore, nudity, and violence",
    enabled: true,
  },
  {
    id: "spam",
    title: "Spam/Scam Detection",
    description: "Detect link baiting and repetitive blasts",
    enabled: true,
  },
  { id: "banlist", title: "Word Ban List", description: "28 blocked terms", actionLabel: "Manage" },
];

export const metadata: Metadata = {
  title: "Moderation & Safety - Capsules",
  description: "Automate protection and keep your community safe with Capsules.",
};

export default function ModerationStudioPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.page} data-surface="moderation">
        <header className={styles.pageHeader}>
          <div className={styles.pageTitles}>
            <p className={styles.eyebrow}>Moderation</p>
            <h1 className={styles.pageTitle}>Moderation &amp; Safety</h1>
            <p className={styles.pageLead}>Automate protection and keep your community safe.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" className={styles.primaryButton}>
              + Create Alert
            </button>
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.column} aria-label="Alerts and recent activity">
            <section className={styles.card} aria-label="Alerts summary">
              <header className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Alerts Summary</h2>
                <span className={styles.cardTag}>Today</span>
              </header>
              <div className={styles.statGrid}>
                {ALERT_METRICS.map((metric) => (
                  <div key={metric.id} className={styles.statCard}>
                    <div className={styles.statLabel}>{metric.label}</div>
                    <div className={styles.statValue}>{metric.value}</div>
                    <div className={styles.statDelta} data-trend={metric.trend}>
                      {metric.delta}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.card} aria-label="Recent alerts">
              <header className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Recent Alerts</h2>
                <button type="button" className={styles.linkButton}>
                  View all
                </button>
              </header>
              <div className={styles.tableHead}>
                <span>Alert</span>
                <span>Stream/Post</span>
                <span>Creator</span>
                <span className={styles.alignRight}>Flagged</span>
                <span className={styles.alignRight}>Resolved</span>
              </div>
              <ul className={styles.tableBody}>
                {RECENT_ALERTS.map((alert) => (
                  <li key={alert.id} className={styles.tableRow}>
                    <div className={styles.alertCell}>
                      <span className={styles.alertThumb} data-accent={alert.accent} />
                      <div className={styles.alertText}>
                        <div className={styles.alertLabel}>{alert.label}</div>
                      </div>
                    </div>
                    <div className={styles.subtle}>{alert.stream}</div>
                    <div className={styles.subtle}>{alert.creator}</div>
                    <div className={`${styles.subtle} ${styles.alignRight}`}>{alert.flaggedAt}</div>
                    <div className={`${styles.subtle} ${styles.alignRight}`}>{alert.resolvedAt}</div>
                  </li>
                ))}
              </ul>
            </section>
          </section>

          <section className={styles.column} aria-label="Content review center">
            <section className={`${styles.card} ${styles.queueCard}`} aria-label="Flagged content">
              <header className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Content Review Center</h2>
                  <p className={styles.cardSubtitle}>Flagged content for immediate review</p>
                </div>
                <button type="button" className={styles.filterButton}>
                  Recent
                </button>
              </header>
              <div className={styles.queueHeadings}>
                <span>Issue</span>
                <span>Content Type</span>
                <span className={styles.alignRight}>Status</span>
              </div>
              <ul className={styles.queueList}>
                {REVIEW_QUEUE.map((item) => (
                  <li key={item.id} className={styles.queueRow}>
                    <div className={styles.queueIssue}>
                      <span className={styles.queueThumb} data-accent={item.accent} />
                      <div>
                        <div className={styles.issueTitle}>{item.issue}</div>
                        <p className={styles.issueMeta}>{item.user}</p>
                      </div>
                    </div>
                    <div className={styles.queueType}>{item.contentType}</div>
                    <span className={styles.statusBadge} data-tone={item.status}>
                      {item.status === "pending"
                        ? "Pending"
                        : item.status === "flagged"
                          ? "Flagged"
                          : "Removed"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </section>

          <section className={styles.column} aria-label="Safety controls">
            <section className={styles.card} aria-label="Safety settings">
              <header className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Safety Settings</h2>
              </header>
              <ul className={styles.settingsList}>
                {SAFETY_CONTROLS.map((setting) => (
                  <li key={setting.id} className={styles.settingRow}>
                    <div>
                      <div className={styles.settingTitle}>{setting.title}</div>
                      {setting.description ? (
                        <p className={styles.settingHint}>{setting.description}</p>
                      ) : null}
                    </div>
                    {setting.actionLabel ? (
                      <button type="button" className={styles.manageButton}>
                        {setting.actionLabel}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.switch}
                        role="switch"
                        aria-checked={Boolean(setting.enabled)}
                      >
                        <span className={styles.switchTrack} data-state={setting.enabled ? "on" : "off"}>
                          <span className={styles.switchLabel}>{setting.enabled ? "ON" : "OFF"}</span>
                          <span className={styles.switchThumb} />
                        </span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.beaconCard} aria-label="Smart Beacon">
              <div>
                <div className={styles.beaconTitle}>Smart Beacon</div>
                <p className={styles.beaconHint}>
                  Continuous safety monitoring &amp; automatic keyword filtering
                </p>
              </div>
              <button type="button" className={styles.primaryButton}>
                + Create Alert
              </button>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}
