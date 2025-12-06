import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./insights.page.module.css";

type SessionMetric = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

type FocusAreaTone = "focus" | "issue";

type FocusArea = {
  id: string;
  label: string;
  hint: string;
  tone: FocusAreaTone;
  progress: number;
};

type PracticeDrill = {
  id: string;
  title: string;
  hint: string;
  tag: string;
};

type SessionHistoryItem = {
  id: string;
  title: string;
  hint: string;
  badgeLabel: string;
  tone?: "recent";
};

const SESSION_METRICS: SessionMetric[] = [
  {
    id: "sessions",
    label: "Sessions reviewed",
    value: "24",
    hint: "Last 30 days",
  },
  {
    id: "focus",
    label: "Primary focus",
    value: "Decision-making",
    hint: "Confidence under pressure",
  },
];

const FOCUS_AREAS: FocusArea[] = [
  {
    id: "pace",
    label: "Pace & energy",
    hint: "You perform best when you give yourself a beat before big moments instead of rushing in.",
    tone: "focus",
    progress: 0.64,
  },
  {
    id: "routines",
    label: "Daily routines",
    hint: "You stick to a warmup 2–3 days per week. Extending that streak will make improvements more consistent.",
    tone: "focus",
    progress: 0.52,
  },
  {
    id: "communication",
    label: "Communication & reflection",
    hint: "You often notice what went wrong after the fact. Short written reflections right after sessions will help.",
    tone: "issue",
    progress: 0.38,
  },
];

const PRACTICE_DRILLS: PracticeDrill[] = [
  {
    id: "drill_anchor",
    title: "Session 1 – Warmup & focus check-in",
    hint: "10 minutes of warmup followed by a quick written intention for the session.",
    tag: "Warmup",
  },
  {
    id: "drill_checkpoints",
    title: "Session 2 – Decision checkpoints",
    hint: "Pick two moments where you pause and ask, “What matters most right now?” before you act.",
    tag: "Mindset",
  },
  {
    id: "drill_reflection",
    title: "Session 3 – Short reflection loop",
    hint: "After each game or block, jot down one win, one lesson, and one idea to try next time.",
    tag: "Reflection",
  },
];

const SESSION_HISTORY: SessionHistoryItem[] = [
  {
    id: "session_today",
    title: "Today – Ranked games",
    hint: "Focus: pacing & pressure moments",
    badgeLabel: "Today",
    tone: "recent",
  },
  {
    id: "session_midweek",
    title: "Midweek – Practice block",
    hint: "Focus: confidence & voice",
    badgeLabel: "2 days ago",
  },
  {
    id: "session_last_week",
    title: "Last week – Coaching session",
    hint: "Focus: body language & intensity",
    badgeLabel: "Last week",
  },
];

export const metadata: Metadata = {
  title: "Personal Coach Studio - Capsules",
  description:
    "Upload sessions or clips and let Capsules surface key moments, coaching notes, and a focused practice plan.",
};

export default function PersonalCoachPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="insights">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>Personal Coach</div>
            <h1 className={styles.title}>Turn your sessions into a personal coach</h1>
            <p className={styles.subtitle}>
              Drop in a VOD, recording, or clip set. Capsules tags your habits, celebrates your best moments,
              and turns everything into a simple practice plan you can actually follow.
            </p>
            <div className={styles.headerActions}>
              <button type="button" className={styles.primaryButton}>
                Analyze new session
              </button>
              <button type="button" className={styles.secondaryButton}>
                Import recent stream
              </button>
            </div>
          </div>
          <div className={styles.headerMeta}>
            {SESSION_METRICS.map((metric) => (
              <div key={metric.id} className={styles.metricCard}>
                <div className={styles.metricLabel}>{metric.label}</div>
                <div className={styles.metricValue}>{metric.value}</div>
                <div className={styles.metricHint}>{metric.hint}</div>
              </div>
            ))}
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Session insights and focus areas">
            <section className={styles.cardAccent} aria-label="Latest session review">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Latest session review</h2>
                  <p className={styles.cardSubtitle}>
                    A quick snapshot of how the session felt, where you showed up well, and where you leaked
                    energy or attention.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Change session
                </button>
              </header>

              <div className={styles.matchGrid}>
                <div className={styles.mapCard} aria-label="Timeline of energy and focus">
                  <div className={styles.mapHeader}>
                    <span className={styles.mapLabel}>Energy &amp; focus over time</span>
                    <span className={styles.mapScore}>3 blocks • 90 mins</span>
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
                    <span className={styles.legendLabel}>Peak focus moments</span>
                    <span className={styles.legendDot} data-kind="death" />
                    <span className={styles.legendLabel}>Energy dips</span>
                  </div>
                </div>

                <div className={styles.matchSummary}>
                  <div className={styles.summaryRow}>
                    <div className={styles.summaryLabel}>Overall momentum</div>
                    <div className={styles.summaryValue} data-tone="good">
                      +9.8
                    </div>
                  </div>
                  <p className={styles.summaryText}>
                    You do your best work once you&apos;re warmed up and committed to a plan. Things slip when
                    you try to multitask or switch goals mid-session.
                  </p>
                  <div className={styles.tagRow}>
                    <span className={styles.tag}>Pacing</span>
                    <span className={styles.tag}>Routines</span>
                    <span className={styles.tag}>Confidence</span>
                  </div>
                  <div className={styles.summarySubgrid}>
                    <div className={styles.summaryTile}>
                      <div className={styles.summaryLabel}>Best block</div>
                      <div className={styles.summaryMetric}>Block 2</div>
                      <p className={styles.summaryHint}>Deep focus, clear intentions.</p>
                    </div>
                    <div className={styles.summaryTile}>
                      <div className={styles.summaryLabel}>When you struggled</div>
                      <div className={styles.summaryMetric}>End of session</div>
                      <p className={styles.summaryHint}>Energy dip around the 70-minute mark.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.card} aria-label="Focus areas">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Focus areas</h2>
                <p className={styles.cardSubtitle}>
                  A short list of skills your coach is tracking over the next few sessions.
                </p>
              </header>
              <ul className={styles.focusList}>
                {FOCUS_AREAS.map((focus) => (
                  <li key={focus.id} className={styles.focusItem}>
                    <div className={styles.focusMeta}>
                      <div className={styles.focusLabel}>{focus.label}</div>
                      <p className={styles.focusHint}>{focus.hint}</p>
                    </div>
                    <div className={styles.focusMeter} data-tone={focus.tone}>
                      <span
                        className={styles.focusFill}
                        style={{ width: `${Math.round(focus.progress * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.card} aria-label="Practice plan">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>3-session practice plan</h2>
                <p className={styles.cardSubtitle}>
                  A simple plan you can run in a week: one focus per session, plus a checklist to keep things
                  realistic.
                </p>
              </header>
              <ul className={styles.planList}>
                {PRACTICE_DRILLS.map((drill) => (
                  <li key={drill.id} className={styles.planItem}>
                    <div className={styles.planMeta}>
                      <div className={styles.planTitle}>{drill.title}</div>
                      <p className={styles.planHint}>{drill.hint}</p>
                    </div>
                    <span className={styles.planTag}>{drill.tag}</span>
                  </li>
                ))}
              </ul>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="Session history">
            <section className={styles.card} aria-label="Session history">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>Session history</h2>
                <p className={styles.cardSubtitle}>
                  Recent sessions so you can see patterns across days, activities, and energy levels.
                </p>
              </header>
              <ul className={styles.sessionList}>
                {SESSION_HISTORY.map((session) => (
                  <li key={session.id} className={styles.sessionItem}>
                    <div className={styles.sessionMeta}>
                      <div className={styles.sessionTitle}>{session.title}</div>
                      <p className={styles.sessionHint}>{session.hint}</p>
                    </div>
                    <span
                      className={styles.sessionBadge}
                      data-tone={session.tone === "recent" ? "recent" : undefined}
                    >
                      {session.badgeLabel}
                    </span>
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
