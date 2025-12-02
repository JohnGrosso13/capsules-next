import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./insights.page.module.css";

export const metadata: Metadata = {
  title: "Gaming Insights Studio - Capsules",
  description:
    "Upload your matches and let Capsules surface key moments, coaching notes, and a focused practice plan.",
};

export default function GamingInsightsPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="insights">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>Gaming Insights</div>
            <h1 className={styles.title}>Turn your matches into a personal coach</h1>
            <p className={styles.subtitle}>
              Drop in a VOD or clip set. Capsules tags your mistakes, celebrates your best plays, and turns
              everything into a simple practice plan you can actually follow.
            </p>
            <div className={styles.headerActions}>
              <button type="button" className={styles.primaryButton}>
                Analyze new match
              </button>
              <button type="button" className={styles.secondaryButton}>
                Import recent stream
              </button>
            </div>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Sessions analyzed</div>
              <div className={styles.metricValue}>24</div>
              <div className={styles.metricHint}>Last 30 days</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Focus game</div>
              <div className={styles.metricValue}>VALORANT</div>
              <div className={styles.metricHint}>Controller · Ascendant lobby</div>
            </div>
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Match insights and moments">
            <section className={styles.cardAccent} aria-label="Match review">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Latest match review</h2>
                  <p className={styles.cardSubtitle}>
                    A quick snapshot of how the match felt, where you shined, and where you leaked rounds.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Change match
                </button>
              </header>

              <div className={styles.matchGrid}>
                <div className={styles.mapCard} aria-label="Heatmap of deaths and impact plays">
                  <div className={styles.mapHeader}>
                    <span className={styles.mapLabel}>Pearl · Defense half</span>
                    <span className={styles.mapScore}>7 - 5</span>
                  </div>
                  <div className={styles.mapCanvas} aria-hidden="true">
                    <div className={styles.mapGrid} />
                    <div className={styles.pathLine} />
                    <div className={styles.impactDot} data-intensity="high" />
                    <div className={styles.impactDot} data-intensity="medium" />
                    <div className={styles.impactDot} data-intensity="low" />
                  </div>
                  <div className={styles.mapLegend}>
                    <span className={styles.legendDot} data-kind="pick" />
                    <span className={styles.legendLabel}>High impact fights</span>
                    <span className={styles.legendDot} data-kind="death" />
                    <span className={styles.legendLabel}>Early deaths</span>
                  </div>
                </div>

                <div className={styles.matchSummary}>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>Round impact</div>
                    <div className={styles.summaryValue} data-tone="good">
                      +11.3
                    </div>
                  </div>
                  <p className={styles.summaryText}>
                    You won most rounds when you anchored B site and lost momentum when rotating early after
                    utility. Your best moments came from holding space and trusting your crosshair.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>Positioning</span>
                    <span className={styles.tag}>Utility timing</span>
                    <span className={styles.tag}>Trade discipline</span>
                  </div>
                  <div className={styles.timelineStrip} aria-hidden="true">
                    <div className={styles.timelineLabel}>Key moments</div>
                    <div className={styles.timelineMarkers}>
                      <span className={styles.timelineMarker} data-kind="clutch">
                        03:12
                      </span>
                      <span className={styles.timelineMarker} data-kind="mistake">
                        07:45
                      </span>
                      <span className={styles.timelineMarker} data-kind="setup">
                        11:08
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.card} aria-label="Decision timeline">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Decision timeline</h2>
                  <p className={styles.cardSubtitle}>
                    Capsules attaches coaching notes to specific timestamps so you know exactly what to
                    watch back.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Open in VOD player
                </button>
              </header>
              <ul className={styles.decisionList}>
                <li className={styles.decisionItem}>
                  <div className={styles.decisionTime}>02:48 · Round 3</div>
                  <div className={styles.decisionBody}>
                    <div className={styles.decisionTitle}>Swinging alone into mid</div>
                    <p className={styles.decisionHint}>
                      Your duo is 1.8 seconds behind. Hold the angle and let them take first contact to
                      avoid trading yourself out early.
                    </p>
                  </div>
                  <span className={styles.decisionTag} data-tone="issue">
                    Avoidable death
                  </span>
                </li>
                <li className={styles.decisionItem}>
                  <div className={styles.decisionTime}>06:21 · Round 7</div>
                  <div className={styles.decisionBody}>
                    <div className={styles.decisionTitle}>Perfect crossfire on B entry</div>
                    <p className={styles.decisionHint}>
                      You and your sentinel set up a clean crossfire that stopped the rush. This is a
                      pattern worth saving as a default.
                    </p>
                  </div>
                  <span className={styles.decisionTag} data-tone="good">
                    Save pattern
                  </span>
                </li>
                <li className={styles.decisionItem}>
                  <div className={styles.decisionTime}>10:14 · Round 12</div>
                  <div className={styles.decisionBody}>
                    <div className={styles.decisionTitle}>Rotating off utility sound</div>
                    <p className={styles.decisionHint}>
                      You left site after a single piece of utility. Consider holding one more second for
                      confirmation before giving up map control.
                    </p>
                  </div>
                  <span className={styles.decisionTag} data-tone="focus">
                    Review angle
                  </span>
                </li>
              </ul>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Focus areas and practice plan">
            <section className={styles.card} aria-label="Focus areas">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Focus areas</h2>
                <p className={styles.cardSubtitle}>
                  Your strengths and leaks for this match, ranked by how often they showed up in the VOD.
                </p>
              </header>
              <ul className={styles.focusList}>
                <li className={styles.focusItem}>
                  <div className={styles.focusMeta}>
                    <div className={styles.focusLabel}>Positioning &amp; off-angles</div>
                    <p className={styles.focusHint}>Strong · keep playing spots that force wide swings.</p>
                  </div>
                  <div className={styles.focusMeter} data-tone="good">
                    <span className={styles.focusFill} style={{ width: "78%" }} />
                  </div>
                </li>
                <li className={styles.focusItem}>
                  <div className={styles.focusMeta}>
                    <div className={styles.focusLabel}>Utility timing</div>
                    <p className={styles.focusHint}>
                      Mixed · great in executes, early on rotates. Practice holding until you see pressure.
                    </p>
                  </div>
                  <div className={styles.focusMeter} data-tone="focus">
                    <span className={styles.focusFill} style={{ width: "52%" }} />
                  </div>
                </li>
                <li className={styles.focusItem}>
                  <div className={styles.focusMeta}>
                    <div className={styles.focusLabel}>Communication &amp; pings</div>
                    <p className={styles.focusHint}>
                      Quiet in mid-round chaos. Shorter, earlier calls will help your team follow up.
                    </p>
                  </div>
                  <div className={styles.focusMeter} data-tone="issue">
                    <span className={styles.focusFill} style={{ width: "36%" }} />
                  </div>
                </li>
              </ul>
            </section>

            <section className={styles.card} aria-label="Practice plan">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>3-match practice plan</h2>
                <p className={styles.cardSubtitle}>
                  A short plan you can run in a single session: one skill per match, plus a checklist to
                  make sure you actually apply it.
                </p>
              </header>
              <ul className={styles.planList}>
                <li className={styles.planItem}>
                  <div className={styles.planMeta}>
                    <div className={styles.planTitle}>Match 1 · Anchor discipline</div>
                    <p className={styles.planHint}>
                      Stay on your first site until you have 2+ clear signals you&apos;re being hard faked.
                    </p>
                  </div>
                  <span className={styles.planTag}>Drill</span>
                </li>
                <li className={styles.planItem}>
                  <div className={styles.planMeta}>
                    <div className={styles.planTitle}>Match 2 · Utility checkpoints</div>
                    <p className={styles.planHint}>
                      Pre-decide two moments each round to hold utility for, instead of throwing on sound.
                    </p>
                  </div>
                  <span className={styles.planTag}>Routine</span>
                </li>
                <li className={styles.planItem}>
                  <div className={styles.planMeta}>
                    <div className={styles.planTitle}>Match 3 · Mic reps</div>
                    <p className={styles.planHint}>
                      Aim for one short call before contact and one after the fight resolves, every round.
                    </p>
                  </div>
                  <span className={styles.planTag}>Comms</span>
                </li>
              </ul>
            </section>

            <section className={styles.card} aria-label="Session history">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Session history</h2>
                <p className={styles.cardSubtitle}>
                  Recent sessions so you can see patterns across maps, roles, and ranks.
                </p>
              </header>
              <ul className={styles.sessionList}>
                <li className={styles.sessionItem}>
                  <div className={styles.sessionMeta}>
                    <div className={styles.sessionTitle}>Pearl · Ranked · Controller</div>
                    <p className={styles.sessionHint}>Anchor discipline · Utility timing</p>
                  </div>
                  <span className={styles.sessionBadge} data-tone="recent">
                    Today
                  </span>
                </li>
                <li className={styles.sessionItem}>
                  <div className={styles.sessionMeta}>
                    <div className={styles.sessionTitle}>Ascent · Scrim · Flex</div>
                    <p className={styles.sessionHint}>Trading · Mid-round calls</p>
                  </div>
                  <span className={styles.sessionBadge}>2 days ago</span>
                </li>
                <li className={styles.sessionItem}>
                  <div className={styles.sessionMeta}>
                    <div className={styles.sessionTitle}>Lotus · Ranked · Initiator</div>
                    <p className={styles.sessionHint}>Utility usage · Site execs</p>
                  </div>
                  <span className={styles.sessionBadge}>Last week</span>
                </li>
              </ul>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}

