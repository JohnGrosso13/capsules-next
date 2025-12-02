import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./moderation.page.module.css";

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
            <h1 className={styles.title}>Keep your Capsule safe and welcoming</h1>
            <p className={styles.subtitle}>
              Capsules already scans posts and comments. This view gives you a human-readable queue, simple
              policy controls, and a pulse on what your community is actually seeing.
            </p>
            <div className={styles.headerActions}>
              <button type="button" className={styles.primaryButton}>
                Review queue
              </button>
              <button type="button" className={styles.secondaryButton}>
                Adjust safety profile
              </button>
            </div>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Pending review</div>
              <div className={styles.metricValue}>6 items</div>
              <div className={styles.metricHint}>Across posts, comments, and DMs</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Auto-blocked (24h)</div>
              <div className={styles.metricValue}>2</div>
              <div className={styles.metricHint}>Severe violations caught by AI</div>
            </div>
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Flagged content and policies">
            <section className={styles.cardAccent} aria-label="Flagged content queue">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Flagged content queue</h2>
                  <p className={styles.cardSubtitle}>
                    A consolidated view of items that Capsules held for you: decide what stays, what goes,
                    and what becomes a teachable moment.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Queue settings
                </button>
              </header>
              <ul className={styles.flagList}>
                <li className={styles.flagItem}>
                  <span className={styles.flagType}>Post</span>
                  <div className={styles.flagBody}>
                    <div className={styles.flagSnippet}>
                      “You&apos;re actually terrible, uninstall already.”
                    </div>
                    <p className={styles.flagHint}>
                      Detected as targeted harassment toward another member in match recap thread.
                    </p>
                    <div className={styles.flagTags}>
                      <span className={styles.flagTag} data-tone="issue">
                        Harassment
                      </span>
                      <span className={styles.flagTag}>Toxicity</span>
                    </div>
                  </div>
                  <span className={styles.flagStatus} data-tone="review">
                    Needs review
                  </span>
                </li>
                <li className={styles.flagItem}>
                  <span className={styles.flagType}>Comment</span>
                  <div className={styles.flagBody}>
                    <div className={styles.flagSnippet}>
                      “Can we talk? I&apos;ve been feeling really low lately…”
                    </div>
                    <p className={styles.flagHint}>
                      Possible self-harm risk. Consider reaching out privately or escalating to a mod.
                    </p>
                    <div className={styles.flagTags}>
                      <span className={styles.flagTag} data-tone="urgent">
                        Self-harm
                      </span>
                      <span className={styles.flagTag}>Support</span>
                    </div>
                  </div>
                  <span className={styles.flagStatus} data-tone="urgent">
                    Priority
                  </span>
                </li>
                <li className={styles.flagItem}>
                  <span className={styles.flagType}>Message</span>
                  <div className={styles.flagBody}>
                    <div className={styles.flagSnippet}>
                      “DM me for &lsquo;boosting services&apos; — cheap wins, no risk.”
                    </div>
                    <p className={styles.flagHint}>
                      Likely spam / boosting solicitation. Similar messages flagged in the past week.
                    </p>
                    <div className={styles.flagTags}>
                      <span className={styles.flagTag}>Spam</span>
                      <span className={styles.flagTag}>Scam risk</span>
                    </div>
                  </div>
                  <span className={styles.flagStatus} data-tone="blocked">
                    Auto-blocked
                  </span>
                </li>
              </ul>
            </section>

            <section className={styles.card} aria-label="Safety profile and filters">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Safety profile &amp; filters</h2>
                  <p className={styles.cardSubtitle}>
                    Start from a preset, then fine-tune how strict Capsules should be for this community.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Preview policy
                </button>
              </header>
              <div className={styles.presetsRow}>
                <button type="button" className={styles.presetChip} data-state="active">
                  Family friendly
                </button>
                <button type="button" className={styles.presetChip}>
                  Mature but respectful
                </button>
                <button type="button" className={styles.presetChip}>
                  Custom
                </button>
              </div>
              <div className={styles.filterGrid}>
                <div className={styles.filterTile}>
                  <div className={styles.filterLabel}>Harassment &amp; hate</div>
                  <p className={styles.filterHint}>Strict · auto-block slurs and threats.</p>
                </div>
                <div className={styles.filterTile}>
                  <div className={styles.filterLabel}>Sexual content</div>
                  <p className={styles.filterHint}>Balanced · block NSFW, allow PG-13 jokes.</p>
                </div>
                <div className={styles.filterTile}>
                  <div className={styles.filterLabel}>Violence &amp; gore</div>
                  <p className={styles.filterHint}>Balanced · okay for game clips, not depictions.</p>
                </div>
                <div className={styles.filterTile}>
                  <div className={styles.filterLabel}>Self-harm</div>
                  <p className={styles.filterHint}>Strict · always escalate to review.</p>
                </div>
                <div className={styles.filterTile}>
                  <div className={styles.filterLabel}>Illicit behavior</div>
                  <p className={styles.filterHint}>Strict · block promotion of cheats or scams.</p>
                </div>
              </div>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Safety insights and incident log">
            <section className={styles.card} aria-label="Safety insights">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Safety insights</h2>
                <p className={styles.cardSubtitle}>
                  See how often Capsules is stepping in, which categories fire most, and whether things are
                  getting better or worse.
                </p>
              </header>
              <div className={styles.insightsChart} aria-hidden="true">
                <div className={styles.insightsGlow} />
                <div className={styles.insightsBars}>
                  <div className={styles.insightsBar} data-kind="warn" />
                  <div className={styles.insightsBar} data-kind="warn" />
                  <div className={styles.insightsBar} data-kind="block" />
                  <div className={styles.insightsBar} data-kind="warn" />
                  <div className={styles.insightsBar} data-kind="block" />
                </div>
                <div className={styles.insightsAxis}>
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                </div>
              </div>
              <div className={styles.insightsRows}>
                <div className={styles.insightRow}>
                  <span className={styles.insightLabel}>Top category</span>
                  <span className={styles.insightValue}>Harassment &amp; toxicity</span>
                </div>
                <div className={styles.insightRow}>
                  <span className={styles.insightLabel}>Spike detected</span>
                  <span className={styles.insightValue}>Post-match salt after scrim night</span>
                </div>
                <div className={styles.insightRow}>
                  <span className={styles.insightLabel}>Policy impact</span>
                  <span className={styles.insightValue}>Auto-blocked spam down 68% vs last week</span>
                </div>
              </div>
            </section>

            <section className={styles.card} aria-label="Incident log">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Incident log</h2>
                <p className={styles.cardSubtitle}>
                  A short trail of what happened, what Capsules did, and what you decided to do next.
                </p>
              </header>
              <ul className={styles.incidentList}>
                <li className={styles.incidentItem}>
                  <div className={styles.incidentMeta}>
                    <div className={styles.incidentTitle}>Toxic post in match recap thread</div>
                    <p className={styles.incidentHint}>
                      AI blocked the post. You edited the wording and published a softer version.
                    </p>
                  </div>
                  <div className={styles.incidentBadges}>
                    <span className={styles.incidentBadge} data-tone="blocked">
                      Blocked
                    </span>
                    <span className={styles.incidentBadge}>Edited &amp; released</span>
                  </div>
                </li>
                <li className={styles.incidentItem}>
                  <div className={styles.incidentMeta}>
                    <div className={styles.incidentTitle}>DM flagged for self-harm concern</div>
                    <p className={styles.incidentHint}>
                      AI escalated to review. You responded with resources and promoted a trusted mod.
                    </p>
                  </div>
                  <div className={styles.incidentBadges}>
                    <span className={styles.incidentBadge} data-tone="urgent">
                      Priority
                    </span>
                    <span className={styles.incidentBadge}>Followed up</span>
                  </div>
                </li>
                <li className={styles.incidentItem}>
                  <div className={styles.incidentMeta}>
                    <div className={styles.incidentTitle}>Spam linking &ldquo;boosting services&rdquo;</div>
                    <p className={styles.incidentHint}>
                      Repeated DM blasts from a new account. Capsules auto-blocked and banned the sender.
                    </p>
                  </div>
                  <div className={styles.incidentBadges}>
                    <span className={styles.incidentBadge} data-tone="blocked">
                      Auto-blocked
                    </span>
                    <span className={styles.incidentBadge}>Account removed</span>
                  </div>
                </li>
              </ul>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}

