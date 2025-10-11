import type { Metadata } from "next";
import {
  ArrowBendUpRight,
  ArrowsClockwise,
  Broadcast,
  CalendarCheck,
  ChatCircleDots,
  Cpu,
  Gauge,
  Lightning,
  MicrophoneStage,
  PlugsConnected,
  Robot,
  ShieldCheck,
  SquaresFour,
  UsersThree,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";

import { AppPage } from "@/components/app-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import styles from "./ai-stream-dashboard.module.css";

export const metadata: Metadata = {
  title: "AI Stream Studio",
  description: "Launch a live broadcast with Capsules' co-pilot assisting every step.",
};

const chatSeed = [
  {
    id: "mod",
    author: "ModBot",
    badge: "MOD",
    message: "Title, tags, and safety filters look good. Ready when you are.",
    timestamp: "Now",
  },
  {
    id: "vip",
    author: "Mayu",
    badge: "VIP",
    message: "Pinned your sponsor talking points in Segment 2.",
    timestamp: "30s",
  },
  {
    id: "viewer",
    author: "newFollower_87",
    badge: null,
    message: "Just followed! Hyped for ranked grind tonight.",
    timestamp: "1m",
  },
] as const;

const checklist = [
  { id: "scene", label: "Scene transitions mapped", status: "done" as const },
  { id: "audio", label: "Mic levels balanced", status: "done" as const },
  { id: "alerts", label: "Alert triggers connected", status: "progress" as const },
  { id: "safety", label: "Auto-moderation rules", status: "pending" as const },
];

const upcomingSegments = [
  {
    id: "segment-1",
    title: "Warm-up & announcements",
    time: "Starts at 3:30 PM",
    details: "Sponsor shout + giveaway reminder",
  },
  {
    id: "segment-2",
    title: "Ranked Grind Queue",
    time: "Live goal: Diamond III",
    details: "Enable clutch cam overlay + hype track",
  },
  {
    id: "segment-3",
    title: "Community Q&A",
    time: "Planned at 6:45 PM",
    details: "Switch to Studio scene, slow chat mode",
  },
];

const assistantShortcuts = [
  { id: "clip", label: "Clip last 60s", icon: <VideoCamera size={18} weight="fill" /> },
  { id: "highlight", label: "Auto-highlight moment", icon: <Lightning size={18} weight="fill" /> },
  { id: "post", label: "Draft hype post", icon: <Robot size={18} weight="fill" /> },
  { id: "moderate", label: "Escalate mod queue", icon: <ShieldCheck size={18} weight="fill" /> },
];

const statSummary = [
  { id: "viewers", label: "Live Viewers", value: "0", sub: "Peak 0" },
  { id: "followers", label: "Followers Today", value: "+0", sub: "Goal +120" },
  { id: "bitrate", label: "Video Bitrate", value: "0 kbps", sub: "Target 6,500" },
  { id: "dropps", label: "Dropped Frames", value: "0.0%", sub: "Stable" },
];

export default function AiStreamStudioPage() {
  return (
    <AppPage activeNav="create" showPrompter={false} layoutVariant="capsule">
      <div className={styles.wrap}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <Badge size="sm" tone="brand" className={styles.heroBadge}>
              Beta
            </Badge>
            <h1 className={styles.heroTitle}>AI Stream Studio</h1>
            <p className={styles.heroSubtitle}>
              Bring your OBS scene, overlays, and audience together while Capsules co-pilots the
              workflow. Monitor health, engage chat, and ask the assistant to handle anything mid-stream.
            </p>
            <div className={styles.heroMeta}>
              <div>
                <span className={styles.heroMetaLabel}>Next broadcast</span>
                <span className={styles.heroMetaValue}>Today / 3:30 PM PT</span>
              </div>
              <div>
                <span className={styles.heroMetaLabel}>Co-host</span>
                <span className={styles.heroMetaValue}>ChatGPT (auto-mod + clips)</span>
              </div>
              <div>
                <span className={styles.heroMetaLabel}>Destinations</span>
                <span className={styles.heroMetaValue}>Twitch / YouTube / Capsules Live</span>
              </div>
            </div>
          </div>
          <div className={styles.heroActions}>
            <Button variant="outline" size="lg" leftIcon={<SquaresFour size={16} weight="bold" />}>
              Manage scenes
            </Button>
            <Button size="lg" leftIcon={<Broadcast size={18} weight="fill" />}>
              Go live preview
            </Button>
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.primaryColumn}>
            <article className={`${styles.card} ${styles.previewCard}`}>
              <header className={styles.previewHeader}>
                <div className={styles.previewStatus}>
                  <span className={styles.statusDot} data-state="offline" />
                  Offline / Stream key linked
                </div>
                <div className={styles.previewHeaderMeta}>
                  <Badge size="sm" tone="info">
                    Studio Check
                  </Badge>
                  <span className={styles.previewHeaderText}>All signals green</span>
                </div>
              </header>
              <div className={styles.previewCanvas}>
                <div className={styles.previewOverlay}>
                  <div className={styles.previewScene}>
                    <span>Main Gameplay</span>
                    <span>1080p / 60fps</span>
                  </div>
                  <div className={styles.previewIndicators}>
                    <span>
                      <MicrophoneStage size={16} weight="bold" />
                      Mic -12 dB
                    </span>
                    <span>
                      <PlugsConnected size={16} weight="bold" />
                      Sources synced
                    </span>
                  </div>
                </div>
              </div>
              <footer className={styles.previewFooter}>
                <div className={styles.previewFooterMetrics}>
                  <span>
                    <Gauge size={18} weight="bold" />
                    Bitrate: <strong>0 kbps</strong>
                  </span>
                  <span>
                    <Cpu size={18} weight="bold" />
                    CPU: <strong>12%</strong>
                  </span>
                  <span>
                    <ArrowsClockwise size={18} weight="bold" />
                    Drops: <strong>0.0%</strong>
                  </span>
                </div>
                <div className={styles.previewFooterActions}>
                  <Button variant="outline" size="sm">
                    Run systems check
                  </Button>
                  <Button size="sm">Start stream</Button>
                </div>
              </footer>
            </article>

            <article className={`${styles.card} ${styles.checklistCard}`}>
              <header className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Launch checklist</h2>
                  <p className={styles.sectionSubtitle}>
                    Capsules tracks each setup task and assigns the assistant automatically.
                  </p>
                </div>
                <Badge size="sm" tone="success" variant="soft">
                  2 completed
                </Badge>
              </header>
              <ul className={styles.checklist}>
                {checklist.map((item) => (
                  <li key={item.id} data-state={item.status}>
                    <span className={styles.checklistIcon} aria-hidden>
                      {item.status === "done" ? (
                        <ShieldCheck size={18} weight="fill" />
                      ) : item.status === "progress" ? (
                        <Lightning size={18} weight="fill" />
                      ) : (
                        <ArrowBendUpRight size={18} weight="bold" />
                      )}
                    </span>
                    <span className={styles.checklistLabel}>{item.label}</span>
                    <span className={styles.checklistStatus}>
                      {item.status === "done"
                        ? "Complete"
                        : item.status === "progress"
                        ? "Assistant in progress"
                        : "Ready to assign"}
                    </span>
                  </li>
                ))}
              </ul>
            </article>
          </div>

          <div className={styles.secondaryColumn}>
            <article className={`${styles.card} ${styles.chatCard}`}>
              <header className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Chat preview</h2>
                  <p className={styles.sectionSubtitle}>
                    Stage the conversation before you go live. Messages marked as spotlight can be
                    auto-surfaced.
                  </p>
                </div>
                <Badge size="sm" tone="info" variant="soft">
                  Auto-moderated
                </Badge>
              </header>
              <ul className={styles.chatList}>
                {chatSeed.map((entry) => (
                  <li key={entry.id}>
                    <div className={styles.chatMeta}>
                      <span className={styles.chatAuthor}>{entry.author}</span>
                      {entry.badge ? (
                        <Badge size="sm" tone="neutral" variant="outline">
                          {entry.badge}
                        </Badge>
                      ) : null}
                      <span className={styles.chatTimestamp}>{entry.timestamp}</span>
                    </div>
                    <p className={styles.chatMessage}>{entry.message}</p>
                  </li>
                ))}
              </ul>
            </article>

            <article className={`${styles.card} ${styles.scheduleCard}`}>
              <header className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Run of show</h2>
                  <p className={styles.sectionSubtitle}>
                    Keep track of upcoming segments, auto-trigger overlays, and sync your cues.
                  </p>
                </div>
                <Badge size="sm" tone="brand" variant="soft">
                  Linked to Calendar
                </Badge>
              </header>
              <ul className={styles.segmentList}>
                {upcomingSegments.map((segment) => (
                  <li key={segment.id}>
                    <div className={styles.segmentIcon} aria-hidden>
                      <CalendarCheck size={18} weight="bold" />
                    </div>
                    <div className={styles.segmentCopy}>
                      <h3>{segment.title}</h3>
                      <p>{segment.details}</p>
                    </div>
                    <span className={styles.segmentTime}>{segment.time}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className={`${styles.card} ${styles.statsCard}`}>
              <header className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Signal monitor</h2>
                  <p className={styles.sectionSubtitle}>
                    Live telemetry across each destination is mirrored here once you start.
                  </p>
                </div>
                <Badge size="sm" tone="danger" variant="soft">
                  Idle
                </Badge>
              </header>
              <div className={styles.statGrid}>
                {statSummary.map((stat) => (
                  <div key={stat.id} className={styles.statItem}>
                    <span className={styles.statLabel}>{stat.label}</span>
                    <span className={styles.statValue}>{stat.value}</span>
                    <span className={styles.statSub}>{stat.sub}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <aside className={styles.assistantColumn}>
            <article className={`${styles.card} ${styles.assistantCard}`}>
              <header className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>ChatGPT Co-pilot</h2>
                  <p className={styles.sectionSubtitle}>
                    Ask Capsules AI to moderate, clip, script, or automate while you stay focused.
                  </p>
                </div>
                <Badge size="sm" tone="success" variant="soft">
                  Standing by
                </Badge>
              </header>

              <div className={styles.assistantFeed}>
                <div className={styles.assistantEntry}>
                  <div className={styles.assistantAvatar} aria-hidden>
                    <Robot size={20} weight="fill" />
                  </div>
                  <div className={styles.assistantText}>
                    <strong>Capsules AI</strong>
                    <p>
                      I can auto-post a hype tweet when you go live, watch for toxic chat spikes, and
                      surface key moments. Want me to brief mods now?
                    </p>
                  </div>
                </div>
                <div className={styles.assistantEntry}>
                  <div className={styles.assistantAvatar} aria-hidden>
                    <ChatCircleDots size={20} weight="fill" />
                  </div>
                  <div className={styles.assistantText}>
                    <strong>Recent request</strong>
                    <p>&quot;Clip the ace from last stream and schedule for TikTok tomorrow at 9 AM.&quot;</p>
                  </div>
                </div>
              </div>

              <div className={styles.assistantShortcuts}>
                {assistantShortcuts.map((shortcut) => (
                  <button key={shortcut.id} type="button" className={styles.shortcutBtn}>
                    <span className={styles.shortcutIcon} aria-hidden>
                      {shortcut.icon}
                    </span>
                    {shortcut.label}
                  </button>
                ))}
              </div>

              <div className={styles.assistantComposer}>
                <textarea
                  className={styles.assistantTextarea}
                  placeholder="Ask ChatGPT to prep overlays, send a message, or recap strategy..."
                  rows={3}
                  spellCheck={false}
                  readOnly
                />
                <div className={styles.assistantComposerFooter}>
                  <div className={styles.assistantHandoff}>
                    <Badge size="sm" tone="info" variant="soft">
                      Automations Ready
                    </Badge>
                    <span>Auto-route requests to mods, social, or clip bots.</span>
                  </div>
                  <Button size="sm" disabled>
                    Submit (UI stub)
                  </Button>
                </div>
              </div>
            </article>

            <article className={`${styles.card} ${styles.destinationCard}`}>
              <header className={styles.sectionHeaderCompact}>
                <h2 className={styles.sectionTitle}>Destinations</h2>
                <Button variant="ghost" size="sm">
                  Manage
                </Button>
              </header>
              <ul className={styles.destinationList}>
                <li>
                  <span className={styles.destinationName}>
                    <Broadcast size={16} weight="fill" />
                    Twitch
                  </span>
                  <span className={styles.destinationStatus}>Ready</span>
                </li>
                <li>
                  <span className={styles.destinationName}>
                    <VideoCamera size={16} weight="fill" />
                    YouTube Live
                  </span>
                  <span className={styles.destinationStatus}>Ready</span>
                </li>
                <li>
                  <span className={styles.destinationName}>
                    <UsersThree size={16} weight="fill" />
                    Capsules Live Hub
                  </span>
                  <span className={styles.destinationStatus}>Preview</span>
                </li>
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </AppPage>
  );
}







