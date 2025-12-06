import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./moderation.page.module.css";

type ModerationContentType = "post" | "comment" | "message" | "upload" | "live";
type ModerationQueueStatus = "needs_review" | "priority" | "auto_blocked";

type ModerationQueueItem = {
  id: string;
  contentType: ModerationContentType;
  capsuleName: string;
  actorHandle: string;
  snippet: string;
  reason: string;
  tags: string[];
  status: ModerationQueueStatus;
};

type ModerationDecisionItem = {
  id: string;
  title: string;
  detail: string;
  primaryOutcome: string;
  secondaryOutcome?: string;
  tone?: "blocked" | "urgent";
};

const QUEUE_STATUS_LABEL: Record<ModerationQueueStatus, string> = {
  needs_review: "Needs review",
  priority: "Priority",
  auto_blocked: "Auto-blocked",
};

const QUEUE_STATUS_TONE: Record<ModerationQueueStatus, "review" | "urgent" | "blocked"> = {
  needs_review: "review",
  priority: "urgent",
  auto_blocked: "blocked",
};

const MOCK_QUEUE: ModerationQueueItem[] = [
  {
    id: "evt_01",
    contentType: "post",
    capsuleName: "Match recap thread",
    actorHandle: "@clutch-or-crash",
    snippet: `"You're actually terrible, uninstall already."`,
    reason: "Targeted harassment toward another member, high toxicity score.",
    tags: ["Harassment", "Toxicity"],
    status: "needs_review",
  },
  {
    id: "evt_02",
    contentType: "comment",
    capsuleName: "Daily check-in",
    actorHandle: "@softqueue",
    snippet: `"Can we talk? I've been feeling really low lately."`,
    reason: "Language associated with self-harm risk. Model recommends escalation.",
    tags: ["Self-harm", "Support"],
    status: "priority",
  },
  {
    id: "evt_03",
    contentType: "message",
    capsuleName: "DMs",
    actorHandle: "@ranked-boosts",
    snippet: `"DM me for 'boosting services' — cheap wins, no risk."`,
    reason: "Likely spam and boosting solicitation. Pattern matches past violations.",
    tags: ["Spam", "Scam risk"],
    status: "auto_blocked",
  },
];

const MOCK_DECISIONS: ModerationDecisionItem[] = [
  {
    id: "evt_10",
    title: "Toxic post in match recap thread",
    detail: "AI blocked the post. You softened the wording and re-published.",
    primaryOutcome: "Blocked",
    secondaryOutcome: "Edited & released",
    tone: "blocked",
  },
  {
    id: "evt_11",
    title: "DM flagged for self-harm concern",
    detail: "AI escalated to review. You responded with resources and promoted a trusted mod.",
    primaryOutcome: "Priority",
    secondaryOutcome: "Followed up",
    tone: "urgent",
  },
  {
    id: "evt_12",
    title: "Spam linking “boosting services”",
    detail: "Repeated DM blasts from a new account. Capsules auto-blocked and banned the sender.",
    primaryOutcome: "Auto-blocked",
    secondaryOutcome: "Account removed",
    tone: "blocked",
  },
];

const pendingCount = MOCK_QUEUE.filter((item) => item.status !== "auto_blocked").length;
const autoBlockedCount = MOCK_QUEUE.filter((item) => item.status === "auto_blocked").length;

export const metadata: Metadata = {
  title: "Moderation & Safety Studio - Capsules",
  description:
    "Review flagged posts, tune safety policies, and keep your Capsule feeling welcoming without slowing down conversation.",
};

export default function ModerationStudioPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="moderation">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>Moderation &amp; Safety</div>
            <h1 className={styles.title}>Moderation Studio</h1>
            <p className={styles.subtitle}>
              A focused queue for model flags and moderator actions. Review edge cases, override AI, and keep
              your Capsule feeling welcoming.
            </p>
            <div className={styles.headerActions}>
              <button type="button" className={styles.primaryButton}>
                Open full queue
              </button>
              <button type="button" className={styles.secondaryButton}>
                Configure rules
              </button>
            </div>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Pending review</div>
              <div className={styles.metricValue}>{pendingCount} item{pendingCount === 1 ? "" : "s"}</div>
              <div className={styles.metricHint}>Across posts, comments, and DMs</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Auto-blocked (24h)</div>
              <div className={styles.metricValue}>{autoBlockedCount}</div>
              <div className={styles.metricHint}>Severe violations caught by AI</div>
            </div>
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Moderation queue">
            <section className={styles.cardAccent} aria-label="Flagged content queue">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Queue preview</h2>
                  <p className={styles.cardSubtitle}>
                    Items Capsules held for review. When this wires to your data, each row will map to a{" "}
                    <code>moderation_events</code> record.
                  </p>
                </div>
                <div className={styles.queueHeaderMeta}>
                  <span className={styles.queueBadge}>Realtime view</span>
                  <button type="button" className={styles.chipButton}>
                    Queue settings
                  </button>
                </div>
              </header>

              <div className={styles.queueFilters} aria-label="Queue filters">
                <div className={styles.queueFilterGroup} aria-label="Content types">
                  <button type="button" className={styles.filterChip} data-state="active">
                    All types
                  </button>
                  <button type="button" className={styles.filterChip}>
                    Posts
                  </button>
                  <button type="button" className={styles.filterChip}>
                    Comments
                  </button>
                  <button type="button" className={styles.filterChip}>
                    Messages
                  </button>
                  <button type="button" className={styles.filterChip}>
                    Uploads
                  </button>
                  <button type="button" className={styles.filterChip}>
                    Live
                  </button>
                </div>
                <div className={styles.queueFilterGroup} aria-label="Decision state">
                  <button type="button" className={styles.filterChip}>
                    Needs review
                  </button>
                  <button type="button" className={styles.filterChip}>
                    Auto-blocked
                  </button>
                  <button type="button" className={styles.filterChip}>
                    Allowed
                  </button>
                </div>
              </div>

              <ul className={styles.flagList}>
                {MOCK_QUEUE.map((item) => (
                  <li
                    key={item.id}
                    className={styles.flagItem}
                    data-event-id={item.id}
                    data-content-type={item.contentType}
                    data-status={item.status}
                  >
                    <div className={styles.flagTypeColumn}>
                      <span className={styles.flagType}>{item.contentType.toUpperCase()}</span>
                      <span className={styles.flagMeta}>{item.capsuleName}</span>
                    </div>
                    <div className={styles.flagBody}>
                      <div className={styles.flagSnippet}>{item.snippet}</div>
                      <p className={styles.flagHint}>
                        {item.reason} Reported by <span className={styles.flagActor}>{item.actorHandle}</span>.
                      </p>
                      <div className={styles.flagTags}>
                        {item.tags.map((tag) => (
                          <span key={tag} className={styles.flagTag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className={styles.flagActionsColumn}>
                      <span className={styles.flagStatus} data-tone={QUEUE_STATUS_TONE[item.status]}>
                        {QUEUE_STATUS_LABEL[item.status]}
                      </span>
                      <div className={styles.flagActions}>
                        <button type="button" className={styles.queueAction} disabled>
                          Allow
                        </button>
                        <button type="button" className={styles.queueAction} disabled>
                          Remove
                        </button>
                        <button type="button" className={styles.queueActionSecondary} disabled>
                          Open details
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Overview and audit trail">
            <section className={styles.card} aria-label="Moderation overview">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Moderation overview</h2>
                <p className={styles.cardSubtitle}>
                  High-level picture of how Capsules is stepping in and where humans are spending time.
                </p>
              </header>
              <dl className={styles.overviewGrid}>
                <div className={styles.overviewItem}>
                  <dt className={styles.overviewLabel}>Open for review</dt>
                  <dd className={styles.overviewValue}>{pendingCount}</dd>
                </div>
                <div className={styles.overviewItem}>
                  <dt className={styles.overviewLabel}>Auto-blocked last 24h</dt>
                  <dd className={styles.overviewValue}>{autoBlockedCount}</dd>
                </div>
                <div className={styles.overviewItem}>
                  <dt className={styles.overviewLabel}>Top category</dt>
                  <dd className={styles.overviewValue}>Harassment &amp; toxicity</dd>
                </div>
                <div className={styles.overviewItem}>
                  <dt className={styles.overviewLabel}>Spike detected</dt>
                  <dd className={styles.overviewValue}>Post-match salt after scrim night</dd>
                </div>
              </dl>
            </section>

            <section className={styles.card} aria-label="Recent decisions">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Recent decisions</h2>
                <p className={styles.cardSubtitle}>
                  A short audit trail of what happened, what Capsules did, and what you decided next.
                </p>
              </header>
              <ul className={styles.incidentList}>
                {MOCK_DECISIONS.map((item) => (
                  <li key={item.id} className={styles.incidentItem}>
                    <div className={styles.incidentMeta}>
                      <div className={styles.incidentTitle}>{item.title}</div>
                      <p className={styles.incidentHint}>{item.detail}</p>
                    </div>
                    <div className={styles.incidentBadges}>
                      <span
                        className={styles.incidentBadge}
                        data-tone={
                          item.tone === "blocked" ? "blocked" : item.tone === "urgent" ? "urgent" : undefined
                        }
                      >
                        {item.primaryOutcome}
                      </span>
                      {item.secondaryOutcome ? (
                        <span className={styles.incidentBadge}>{item.secondaryOutcome}</span>
                      ) : null}
                    </div>
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
