import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./growth.page.module.css";

type TrendTone = "up" | "down" | "steady";

type GrowthMetric = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: TrendTone;
};

type SegmentMetric = {
  id: string;
  label: string;
  value: string;
  hint: string;
};

type ContentHighlightKind = "clip" | "post" | "event";

type ContentHighlight = {
  id: string;
  kind: ContentHighlightKind;
  title: string;
  detail: string;
};

type GrowthPlaybook = {
  id: string;
  title: string;
  hint: string;
  ctaLabel: string;
};

type GrowthTask = {
  id: string;
  title: string;
  hint: string;
  category: string;
};

const OVERVIEW_METRICS: GrowthMetric[] = [
  {
    id: "members",
    label: "Members",
    value: "2,430",
    detail: "+9.2% vs last 30 days",
    tone: "up",
  },
  {
    id: "active",
    label: "Active this week",
    value: "648",
    detail: "Steady engagement",
    tone: "steady",
  },
  {
    id: "posts",
    label: "Posts & clips",
    value: "312",
    detail: "+21% content volume",
    tone: "up",
  },
  {
    id: "events",
    label: "Streams & events",
    value: "11",
    detail: "Slightly fewer than last month",
    tone: "down",
  },
];

const SEGMENT_METRICS: SegmentMetric[] = [
  {
    id: "new",
    label: "New members",
    value: "184",
    hint: "Welcome flows, first wins, & orientation.",
  },
  {
    id: "lurkers",
    label: "Lurkers",
    value: "1,120",
    hint: "Low-friction polls and highlight recaps.",
  },
  {
    id: "regulars",
    label: "Regulars",
    value: "320",
    hint: "Co-host streams, community nights, & ladders.",
  },
  {
    id: "core",
    label: "Core",
    value: "42",
    hint: "Mods, staff, and most-engaged supporters.",
  },
];

const CONTENT_HIGHLIGHTS: ContentHighlight[] = [
  {
    id: "clip_01",
    kind: "clip",
    title: "Overtime clutch on Pearl",
    detail: "3.4x average watch time • viewers shared it 18 times.",
  },
  {
    id: "post_01",
    kind: "post",
    title: "\"Rate my crosshair\" poll",
    detail: "62% of lurkers engaged • great candidate for weekly polls.",
  },
  {
    id: "event_01",
    kind: "event",
    title: "Coaching VOD review night",
    detail: "Highest chat participation this month • schedule a recurring series.",
  },
];

const GROWTH_PLAYBOOKS: GrowthPlaybook[] = [
  {
    id: "playbook_lurker_to_regular",
    title: "&quot;Lurker to Regular&quot; arc",
    hint: "3-part sequence: low-pressure poll, highlight recap, and a casual community night.",
    ctaLabel: "Preview flow",
  },
  {
    id: "playbook_season_launch",
    title: "Season launch with ladders",
    hint: "Kick off a 4-week ladder, stream the finals, and auto-generate recaps.",
    ctaLabel: "Open ladder builder",
  },
  {
    id: "playbook_digest",
    title: "Weekly &quot;best of&quot; digest",
    hint: "Summarize top clips, posts, and VODs into a digest Capsule post.",
    ctaLabel: "Draft digest post",
  },
];

const GROWTH_TASKS: GrowthTask[] = [
  {
    id: "task_vod_review",
    title: "Schedule a community VOD review night",
    hint: "Use Coaching Insights clips and invite your regulars as co-hosts.",
    category: "Events",
  },
  {
    id: "task_low_friction_poll",
    title: "Post a low-friction poll",
    hint: "Target lurkers with a one-tap question tied to your main game.",
    category: "Engagement",
  },
  {
    id: "task_ladder_promo",
    title: "Promote your next ladder",
    hint: "Share a hype post with last season's champion clip as a teaser.",
    category: "Ladders",
  },
];

export const metadata: Metadata = {
  title: "Community Growth Studio - Capsules",
  description:
    "Understand your Capsule&apos;s health, see what content resonates, and get AI-powered playbooks to grow your community.",
};

export default function CommunityGrowthPage() {
  return (
    <AppPage activeNav="create" showPrompter layoutVariant="capsule">
      <div className={styles.shell} data-surface="growth">
        <header className={styles.header}>
            <div className={styles.headerMain}>
              <div className={styles.pill}>Growth Studio</div>
              <h1 className={styles.title}>Grow a thriving Capsule community</h1>
              <p className={styles.subtitle}>
                Track momentum, see what&apos;s working, and let AI turn your data into concrete campaigns, content
              ideas, and next steps for your members.
            </p>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>This week&apos;s trend</div>
              <div className={styles.metricValue}>+18%</div>
              <div className={styles.metricHint}>Active members vs last week</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>AI suggestions</div>
              <div className={styles.metricValue}>3 ready</div>
              <div className={styles.metricHint}>Campaigns to launch today</div>
            </div>
          </div>
        </header>

        <main className={styles.layout}>
          <section className={styles.columnPrimary} aria-label="Community overview and actions">
            <section className={styles.cardAccent} aria-label="Capsule overview">
              <header className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Capsule overview</h2>
                  <p className={styles.cardSubtitle}>
                    High-level health across members, posts, and live events. Use this to feel the pulse of
                    your community at a glance.
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
                  <span className={styles.miniTimelineLabel}>Engagement over time</span>
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

            <section className={styles.card} aria-label="Segments and top content">
              <div className={styles.cardRow}>
                <section className={styles.cardColumn} aria-label="Audience segments">
                  <header className={styles.cardHeaderStacked}>
                    <h2 className={styles.cardTitle}>Audience segments</h2>
                    <p className={styles.cardSubtitle}>
                      See who&apos;s joining, who&apos;s lurking, and who&apos;s driving the culture of your Capsule.
                    </p>
                  </header>
                  <div className={styles.segmentGrid}>
                    {SEGMENT_METRICS.map((segment) => (
                      <div key={segment.id} className={styles.segmentTile}>
                        <div className={styles.segmentLabel}>{segment.label}</div>
                        <div className={styles.segmentValue}>{segment.value}</div>
                        <p className={styles.segmentHint}>{segment.hint}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className={styles.cardColumn} aria-label="Top content">
                  <header className={styles.cardHeaderRow}>
                    <div>
                      <h2 className={styles.cardTitle}>Top content</h2>
                      <p className={styles.cardSubtitle}>
                        Posts, clips, and streams that are resonating with your community right now.
                      </p>
                    </div>
                    <button type="button" className={styles.chipButton}>
                      Generate more like this
                    </button>
                  </header>
                  <ul className={styles.contentList}>
                    {CONTENT_HIGHLIGHTS.map((item) => (
                      <li
                        key={item.id}
                        className={styles.contentItem}
                        data-kind={item.kind}
                        data-content-id={item.id}
                      >
                        <span className={styles.contentBadge}>{item.kind.toUpperCase()}</span>
                        <div className={styles.contentMeta}>
                          <div className={styles.contentTitle}>{item.title}</div>
                          <p className={styles.contentHint}>{item.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </section>
          </section>

          <section className={styles.columnSecondary} aria-label="AI playbooks and weekly actions">
            <section className={styles.card} aria-label="AI growth playbooks">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>AI growth playbooks</h2>
                <p className={styles.cardSubtitle}>
                  Capsules turns your data into ready-to-run campaigns across streams, ladders, and posts.
                </p>
              </header>
              <ul className={styles.playbookList}>
                {GROWTH_PLAYBOOKS.map((playbook) => (
                  <li
                    key={playbook.id}
                    className={styles.playbookItem}
                    data-playbook-id={playbook.id}
                  >
                    <div className={styles.playbookMeta}>
                      <div className={styles.playbookTitle}>{playbook.title}</div>
                      <p className={styles.playbookHint}>{playbook.hint}</p>
                    </div>
                    <button type="button" className={styles.playbookCta}>
                      {playbook.ctaLabel}
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.card} aria-label="This week&apos;s action list">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>This week&apos;s action list</h2>
                <p className={styles.cardSubtitle}>
                  A short list of high-impact tasks. Check them off as you go.
                </p>
              </header>
              <ul className={styles.taskList}>
                {GROWTH_TASKS.map((task) => (
                  <li key={task.id} className={styles.taskItem} data-task-id={task.id}>
                    <button type="button" className={styles.taskCheckbox} aria-hidden="true" />
                    <div className={styles.taskBody}>
                      <div className={styles.taskTitle}>{task.title}</div>
                      <p className={styles.taskHint}>{task.hint}</p>
                    </div>
                    <span className={styles.taskTag}>{task.category}</span>
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
