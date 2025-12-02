import type { Metadata } from "next";

import { AppPage } from "@/components/app-page";

import styles from "./growth.page.module.css";

export const metadata: Metadata = {
  title: "Community Growth Studio - Capsules",
  description:
    "Understand your Capsule’s health, see what content resonates, and get AI-powered playbooks to grow your community.",
};

export default function CommunityGrowthPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.shell} data-surface="growth">
        <header className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.pill}>Growth Studio</div>
            <h1 className={styles.title}>Grow a thriving Capsule community</h1>
            <p className={styles.subtitle}>
              Track momentum, see what&apos;s working, and let AI turn your data into concrete campaigns,
              content ideas, and next steps for your members.
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
            <div className={styles.cardAccent}>
              <div className={styles.cardHeaderRow}>
                <div>
                  <h2 className={styles.cardTitle}>Capsule overview</h2>
                  <p className={styles.cardSubtitle}>
                    High-level health across members, posts, and live events. Use this to feel the pulse
                    of your community at a glance.
                  </p>
                </div>
                <button type="button" className={styles.chipButton}>
                  Change Capsule
                </button>
              </div>
              <div className={styles.overviewGrid}>
                <div className={styles.metricTile}>
                  <div className={styles.metricTileLabel}>Members</div>
                  <div className={styles.metricTileValue}>2,430</div>
                  <div className={styles.metricTileTrend} data-trend="up">
                    +9.2% vs last 30 days
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricTileLabel}>Active this week</div>
                  <div className={styles.metricTileValue}>648</div>
                  <div className={styles.metricTileTrend} data-trend="steady">
                    Steady engagement
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricTileLabel}>Posts &amp; clips</div>
                  <div className={styles.metricTileValue}>312</div>
                  <div className={styles.metricTileTrend} data-trend="up">
                    +21% content volume
                  </div>
                </div>
                <div className={styles.metricTile}>
                  <div className={styles.metricTileLabel}>Streams &amp; events</div>
                  <div className={styles.metricTileValue}>11</div>
                  <div className={styles.metricTileTrend} data-trend="down">
                    Slightly fewer than last month
                  </div>
                </div>
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
                  <div className={styles.miniTimelineDot} data-pos="start" />
                  <div className={styles.miniTimelineDot} data-pos="mid" />
                  <div className={styles.miniTimelineDot} data-pos="peak" />
                  <div className={styles.miniTimelineDot} data-pos="end" />
                </div>
              </div>
            </div>

            <div className={styles.cardRow}>
              <section className={styles.card} aria-label="Audience segments">
                <header className={styles.cardHeaderRow}>
                  <div>
                    <h2 className={styles.cardTitle}>Audience segments</h2>
                    <p className={styles.cardSubtitle}>
                      See who&apos;s joining, who&apos;s lurking, and who&apos;s driving the culture of your
                      Capsule.
                    </p>
                  </div>
                  <button type="button" className={styles.chipButton}>
                    Ask AI for a playbook
                  </button>
                </header>
                <div className={styles.segmentGrid}>
                  <div className={styles.segmentTile}>
                    <div className={styles.segmentLabel}>New members</div>
                    <div className={styles.segmentValue}>184</div>
                    <p className={styles.segmentHint}>Welcome flows, first wins, &amp; orientation.</p>
                  </div>
                  <div className={styles.segmentTile}>
                    <div className={styles.segmentLabel}>Lurkers</div>
                    <div className={styles.segmentValue}>1,120</div>
                    <p className={styles.segmentHint}>Low-friction polls and highlight recaps.</p>
                  </div>
                  <div className={styles.segmentTile}>
                    <div className={styles.segmentLabel}>Regulars</div>
                    <div className={styles.segmentValue}>420</div>
                    <p className={styles.segmentHint}>Clubs, recurring events, and ladders.</p>
                  </div>
                  <div className={styles.segmentTile}>
                    <div className={styles.segmentLabel}>Core contributors</div>
                    <div className={styles.segmentValue}>36</div>
                    <p className={styles.segmentHint}>Mods, co-hosts, and collaborators.</p>
                  </div>
                </div>
              </section>

              <section className={styles.card} aria-label="Top content">
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
                  <li className={styles.contentItem}>
                    <div className={styles.contentBadge}>Clip</div>
                    <div className={styles.contentMeta}>
                      <div className={styles.contentTitle}>Overtime clutch on Pearl</div>
                      <p className={styles.contentHint}>
                        3.4× average watch time · viewers shared it 18 times.
                      </p>
                    </div>
                  </li>
                  <li className={styles.contentItem}>
                    <div className={styles.contentBadge}>Post</div>
                    <div className={styles.contentMeta}>
                      <div className={styles.contentTitle}>“Rate my crosshair” poll</div>
                      <p className={styles.contentHint}>
                        62% of lurkers engaged · great candidate for weekly polls.
                      </p>
                    </div>
                  </li>
                  <li className={styles.contentItem}>
                    <div className={styles.contentBadge}>Stream</div>
                    <div className={styles.contentMeta}>
                      <div className={styles.contentTitle}>Coaching VOD review night</div>
                      <p className={styles.contentHint}>
                        Highest chat participation this month · schedule a recurring series.
                      </p>
                    </div>
                  </li>
                </ul>
              </section>
            </div>
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
                <li className={styles.playbookItem}>
                  <div className={styles.playbookMeta}>
                    <div className={styles.playbookTitle}>“Lurker to Regular” arc</div>
                    <p className={styles.playbookHint}>
                      3-part sequence: low-pressure poll, highlight recap, and a casual community night.
                    </p>
                  </div>
                  <button type="button" className={styles.playbookCta}>
                    Preview flow
                  </button>
                </li>
                <li className={styles.playbookItem}>
                  <div className={styles.playbookMeta}>
                    <div className={styles.playbookTitle}>Season launch with ladders</div>
                    <p className={styles.playbookHint}>
                      Kick off a 4-week ladder, stream the finals, and auto-generate recaps.
                    </p>
                  </div>
                  <button type="button" className={styles.playbookCta}>
                    Open ladder builder
                  </button>
                </li>
                <li className={styles.playbookItem}>
                  <div className={styles.playbookMeta}>
                    <div className={styles.playbookTitle}>Weekly “best of” digest</div>
                    <p className={styles.playbookHint}>
                      Summarize top clips, posts, and VODs into a digest Capsule post.
                    </p>
                  </div>
                  <button type="button" className={styles.playbookCta}>
                    Draft digest post
                  </button>
                </li>
              </ul>
            </section>

            <section className={styles.card} aria-label="This week’s action list">
              <header className={styles.cardHeaderStacked}>
                <h2 className={styles.cardTitle}>This week&apos;s action list</h2>
                <p className={styles.cardSubtitle}>
                  A short list of high-impact tasks. Check them off as you go.
                </p>
              </header>
              <ul className={styles.taskList}>
                <li className={styles.taskItem}>
                  <button type="button" className={styles.taskCheckbox} aria-hidden="true" />
                  <div className={styles.taskBody}>
                    <div className={styles.taskTitle}>Schedule a community VOD review night</div>
                    <p className={styles.taskHint}>
                      Use Coaching Insights clips and invite your regulars as co-hosts.
                    </p>
                  </div>
                  <span className={styles.taskTag}>Events</span>
                </li>
                <li className={styles.taskItem}>
                  <button type="button" className={styles.taskCheckbox} aria-hidden="true" />
                  <div className={styles.taskBody}>
                    <div className={styles.taskTitle}>Post a low-friction poll</div>
                    <p className={styles.taskHint}>
                      Target lurkers with a one-tap question tied to your main game.
                    </p>
                  </div>
                  <span className={styles.taskTag}>Engagement</span>
                </li>
                <li className={styles.taskItem}>
                  <button type="button" className={styles.taskCheckbox} aria-hidden="true" />
                  <div className={styles.taskBody}>
                    <div className={styles.taskTitle}>Promote your next ladder</div>
                    <p className={styles.taskHint}>
                      Share a hype post with last season&apos;s champion clip as a teaser.
                    </p>
                  </div>
                  <span className={styles.taskTag}>Ladders</span>
                </li>
              </ul>
            </section>
          </section>
        </main>
      </div>
    </AppPage>
  );
}

