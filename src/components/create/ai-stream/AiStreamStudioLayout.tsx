"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { CapsuleSummary } from "@/server/capsules/service";

import { AiStreamCapsuleGate } from "./AiStreamCapsuleGate";
import styles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import capTheme from "@/app/(authenticated)/capsule/capsule.module.css";
import { Broadcast, SquaresFour, Storefront } from "@phosphor-icons/react/dist/ssr";

type StudioTab = "studio" | "producer" | "encoder";

const TAB_ITEMS: Array<{ id: StudioTab; label: string; icon: React.ReactNode }> = [
  {
    id: "studio",
    label: "Live Studio",
    icon: <Broadcast size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "producer",
    label: "Producer Console",
    icon: <SquaresFour size={18} weight="bold" className={capTheme.tabIcon} />,
  },
  {
    id: "encoder",
    label: "External Encoder",
    icon: <Storefront size={18} weight="bold" className={capTheme.tabIcon} />,
  },
];

const TAB_SET = new Set<StudioTab>(TAB_ITEMS.map((item) => item.id));

type AiStreamStudioLayoutProps = {
  capsules: CapsuleSummary[];
  initialView?: StudioTab;
};

function normalizeTab(value: string | null | undefined, fallback: StudioTab): StudioTab {
  if (!value) return fallback;
  const maybe = value.toLowerCase() as StudioTab;
  if (TAB_SET.has(maybe)) {
    return maybe;
  }
  return fallback;
}

export function AiStreamStudioLayout({
  capsules,
  initialView = "studio",
}: AiStreamStudioLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = React.useMemo(() => searchParams?.toString() ?? "", [searchParams]);

  const initialTab = React.useMemo(
    () => normalizeTab(initialView, "studio"),
    [initialView],
  );
  const [activeTab, setActiveTab] = React.useState<StudioTab>(initialTab);

  const [selectedCapsuleId, setSelectedCapsuleId] = React.useState<string | null>(null);

  const selectedCapsule = React.useMemo(() => {
    if (!selectedCapsuleId) return null;
    return capsules.find((capsule) => capsule.id === selectedCapsuleId) ?? null;
  }, [capsules, selectedCapsuleId]);

  const [selectorOpen, setSelectorOpen] = React.useState(true);

  const queryView = React.useMemo(() => {
    const param = searchParams?.get("view") ?? null;
    return normalizeTab(param, "studio");
  }, [searchParams]);

  const queryCapsuleId = React.useMemo(() => {
    const param = searchParams?.get("capsuleId") ?? null;
    if (!param) return null;
    return capsules.some((capsule) => capsule.id === param) ? param : null;
  }, [capsules, searchParams]);

  React.useEffect(() => {
    const normalized = normalizeTab(queryView, initialTab);
    setActiveTab(normalized);
  }, [initialTab, queryView]);

  React.useEffect(() => {
    if (queryCapsuleId === null) {
      setSelectedCapsuleId(null);
      setSelectorOpen(true);
      return;
    }
    setSelectedCapsuleId(queryCapsuleId);
    setSelectorOpen(false);
  }, [queryCapsuleId]);

  const hasSwitchParam = React.useMemo(() => {
    return searchParams?.has("switch") ?? false;
  }, [searchParams]);

  React.useEffect(() => {
    if (!hasSwitchParam) return;
    setSelectedCapsuleId(null);
    setSelectorOpen(true);
  }, [hasSwitchParam]);

  const updateUrl = React.useCallback(
    (nextTab: StudioTab) => {
      if (!pathname) return;
      const params = new URLSearchParams(searchParamsString);
      if (nextTab === "studio") {
        params.delete("view");
      } else {
        params.set("view", nextTab);
      }

      params.delete("switch");

      const nextSearch = params.toString();
      if (nextSearch === searchParamsString) return;
      const nextHref = nextSearch.length ? `${pathname}?${nextSearch}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const handleTabChange = React.useCallback(
    (nextValue: string) => {
      const normalized = normalizeTab(nextValue, activeTab);
      if (normalized === activeTab) return;
      setActiveTab(normalized);
      updateUrl(normalized);
    },
    [activeTab, updateUrl],
  );

  const syncSelectorSearchParams = React.useCallback(
    (capsuleId: string | null, reopenSelector: boolean) => {
      if (!pathname) return;
      const params = new URLSearchParams(searchParamsString);
      if (capsuleId) {
        params.set("capsuleId", capsuleId);
        params.delete("switch");
      } else {
        params.delete("capsuleId");
        if (reopenSelector) {
          params.set("switch", "1");
        } else {
          params.delete("switch");
        }
      }
      const nextSearch = params.toString();
      if (nextSearch === searchParamsString) return;
      const nextHref = nextSearch.length ? `${pathname}?${nextSearch}` : pathname;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleCapsuleSwitch = () => {
      setSelectedCapsuleId(null);
      setSelectorOpen(true);
      syncSelectorSearchParams(null, true);
    };
    window.addEventListener("capsule:switch", handleCapsuleSwitch);
    return () => {
      window.removeEventListener("capsule:switch", handleCapsuleSwitch);
    };
  }, [syncSelectorSearchParams]);

  const handleCapsuleChange = React.useCallback(
    (capsule: CapsuleSummary | null) => {
      const capsuleId = capsule?.id ?? null;
      setSelectedCapsuleId(capsuleId);
      const shouldReopenSelector = !capsuleId;
      setSelectorOpen(shouldReopenSelector);
      syncSelectorSearchParams(capsuleId, shouldReopenSelector);
    },
    [syncSelectorSearchParams],
  );

  const renderStudioContent = () => {
    if (selectorOpen || !selectedCapsule) {
      return (
        <>
          <AiStreamCapsuleGate
            capsules={capsules}
            selectedCapsule={selectedCapsule}
            onSelectionChange={handleCapsuleChange}
          />
        </>
      );
    }

    return (
      <div className={styles.studioLayout}>
        <section className={styles.liveColumn} aria-label="Live preview and controls">
          <div className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <div>
                <div className={styles.previewTitle}>Live Program Feed</div>
                <div className={styles.previewSubtitle}>
                  Routed to {selectedCapsule.name}
                </div>
              </div>
              <div className={styles.previewActions}>
                <Button variant="outline" size="sm" disabled>
                  Stream settings
                </Button>
                <Button variant="gradient" size="sm" disabled>
                  Go live
                </Button>
              </div>
            </div>
            <div className={styles.previewFrame}>Program Preview</div>
            <div className={styles.previewFooter}>
              <div className={styles.previewStats}>
                <div className={styles.previewStat}>
                  <span className={styles.previewStatLabel}>Uptime</span>
                  <span className={styles.previewStatValue}>00:00:00</span>
                </div>
                <div className={styles.previewStat}>
                  <span className={styles.previewStatLabel}>Viewers</span>
                  <span className={styles.previewStatValue}>0</span>
                </div>
                <div className={styles.previewStat}>
                  <span className={styles.previewStatLabel}>Bitrate</span>
                  <span className={styles.previewStatValue}>--</span>
                </div>
              </div>
              <div className={styles.controlToolbar}>
                <Button variant="outline" size="sm" disabled>
                  Camera
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Microphone
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Share screen
                </Button>
              </div>
            </div>
          </div>

          <div className={styles.quickActionsCard}>
            <div className={styles.quickActionsHeader}>
              <div>
                <div className={styles.quickActionsTitle}>Quick controls</div>
                <div className={styles.quickActionsSubtitle}>
                  On-the-fly adjustments for your Capsule audience.
                </div>
              </div>
              <Button variant="ghost" size="xs" disabled>
                Customize
              </Button>
            </div>
            <div className={styles.quickActionsGrid}>
              {["Edit stream info", "Launch raid", "Run promo", "Drop poll"].map((action) => (
                <button key={action} type="button" className={styles.quickActionButton} disabled>
                  {action}
                </button>
              ))}
              <button type="button" className={styles.quickActionButton} disabled>
                Add action
              </button>
            </div>
          </div>

          <div className={styles.signalCard}>
            <div className={styles.signalHeader}>
              <div className={styles.signalTitle}>Live telemetry</div>
              <span className={styles.signalPill}>AI monitor</span>
            </div>
            <ul className={styles.signalList}>
              <li>
                <span>Bitrate &amp; dropped frames</span>
                <strong>Stable</strong>
              </li>
              <li>
                <span>Audience sentiment</span>
                <strong>Calm</strong>
              </li>
              <li>
                <span>Highlights queued</span>
                <strong>3 clips</strong>
              </li>
            </ul>
          </div>
        </section>

        <section className={styles.assistantColumn} aria-label="AI stage manager">
          <div className={styles.stageManagerCard}>
            <header className={styles.stageManagerHeader}>
              <div>
                <div className={styles.stageManagerTitle}>AI stage manager</div>
                <div className={styles.stageManagerSubtitle}>
                  Guides show pacing, sponsor beats, and guest handoffs.
                </div>
              </div>
              <Button variant="ghost" size="xs" disabled>
                View run of show
              </Button>
            </header>
            <div className={styles.stageManagerTimeline}>
              <div className={styles.stageManagerEvent}>
                <span className={styles.stageManagerEventTime}>Now</span>
                <div className={styles.stageManagerEventBody}>
                  <strong>Open with origin story</strong>
                  <p>
                    60-second intro with host on camera. Slide deck is primed and overlays are synced.
                  </p>
                </div>
              </div>
              <div className={styles.stageManagerEvent}>
                <span className={styles.stageManagerEventTime}>+05</span>
                <div className={styles.stageManagerEventBody}>
                  <strong>Invite guest speaker</strong>
                  <p>
                    Queue split-screen layout and drop guest bio lower-third.
                  </p>
                </div>
              </div>
              <div className={styles.stageManagerEvent}>
                <span className={styles.stageManagerEventTime}>+12</span>
                <div className={styles.stageManagerEventBody}>
                  <strong>Community prompt</strong>
                  <p>
                    Run poll about feature wishlist. AI will surface top responses for wrap-up.
                  </p>
                </div>
              </div>
            </div>
            <div className={styles.stageManagerThread}>
              <div className={styles.stageManagerMessage}>
                <span className={styles.stageManagerAuthor}>Stage manager</span>
                <p>
                  Want me to prep a sponsor segment once the demo wraps? I can ready the CTA overlay
                  and chat reminder.
                </p>
              </div>
              <div className={styles.stageManagerMessageSelf}>
                <span className={styles.stageManagerAuthor}>You</span>
                <p>
                  Yes - schedule it for the 18 minute mark if engagement is high.
                </p>
              </div>
            </div>
            <footer className={styles.stageManagerFooter}>
              <div className={styles.stageManagerSuggestions}>
                {["Draft outro talking points", "Prep Q&A handoff", "Summarize chat sentiment"].map(
                  (item) => (
                    <button
                      key={item}
                      type="button"
                      className={styles.stageManagerSuggestion}
                      disabled
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
              <div className={styles.stageManagerComposer}>
                <input
                  className={styles.stageManagerInput}
                  placeholder="Ask your AI crew for support..."
                  disabled
                />
                <Button variant="gradient" size="sm" disabled>
                  Send
                </Button>
              </div>
            </footer>
          </div>
        </section>

        <section className={styles.resourceColumn} aria-label="Live resources">
          <div className={styles.resourceCard}>
            <header className={styles.resourceHeader}>
              <div className={styles.resourceTitle}>Activity feed</div>
              <Button variant="ghost" size="xs" disabled>
                Filter
              </Button>
            </header>
            <ul className={styles.resourceList}>
              <li>
                <span className={styles.resourceTime}>00:15</span>
                <div>
                  <strong>luna_dev followed</strong>
                  <p>Auto thank-you message queued in chat.</p>
                </div>
              </li>
              <li>
                <span className={styles.resourceTime}>00:09</span>
                <div>
                  <strong>crowdsource tipped $15</strong>
                  <p>Overlay shout-out scheduled after current segment.</p>
                </div>
              </li>
              <li>
                <span className={styles.resourceTime}>00:03</span>
                <div>
                  <strong>Clip ready</strong>
                  <p>AI clipped &quot;Live coding reveal&quot; for instant share.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className={styles.resourceCard}>
            <header className={styles.resourceHeader}>
              <div className={styles.resourceTitle}>Audience chat</div>
              <Button variant="ghost" size="xs" disabled>
                Pop out
              </Button>
            </header>
            <div className={styles.chatTranscript}>
              <div className={styles.chatMessage}>
                <span className={styles.chatAuthor}>mod-bot</span>
                <p>Be kind - AI will auto flag anything off-topic.</p>
              </div>
              <div className={styles.chatMessage}>
                <span className={styles.chatAuthor}>streamfan42</span>
                <p>This layout looks slick! Any tips for mobile folks?</p>
              </div>
              <div className={styles.chatMessage}>
                <span className={styles.chatAuthor}>crew-sam</span>
                <p>Guest ready in green room. Handing off when you&apos;re set.</p>
              </div>
            </div>
            <div className={styles.chatComposer}>
              <input className={styles.chatInput} placeholder="Message the crowd..." disabled />
              <Button variant="outline" size="sm" disabled>
                Chat
              </Button>
            </div>
          </div>

          <div className={styles.resourceCard}>
            <header className={styles.resourceHeader}>
              <div className={styles.resourceTitle}>Collaborators</div>
              <Button variant="ghost" size="xs" disabled>
                Invite
              </Button>
            </header>
            <ul className={styles.collaboratorList}>
              <li className={styles.collaboratorItem}>
                <div className={styles.collaboratorMeta}>
                  <span className={styles.collaboratorName}>Sam Reynolds</span>
                  <span className={styles.collaboratorRole}>Producer</span>
                </div>
                <span
                  className={`${styles.collaboratorStatus} ${styles.collaboratorStatusOnline}`}
                >
                  On comms
                </span>
              </li>
              <li className={styles.collaboratorItem}>
                <div className={styles.collaboratorMeta}>
                  <span className={styles.collaboratorName}>Jess Patel</span>
                  <span className={styles.collaboratorRole}>Moderator</span>
                </div>
                <span className={`${styles.collaboratorStatus} ${styles.collaboratorStatusIdle}`}>
                  Reviewing queue
                </span>
              </li>
              <li className={styles.collaboratorItem}>
                <div className={styles.collaboratorMeta}>
                  <span className={styles.collaboratorName}>Aria</span>
                  <span className={styles.collaboratorRole}>AI writer</span>
                </div>
                <span
                  className={`${styles.collaboratorStatus} ${styles.collaboratorStatusAway}`}
                >
                  Updating recap
                </span>
              </li>
            </ul>
            <footer className={styles.collaboratorFooter}>
              <Button variant="ghost" size="xs" disabled>
                Manage collaborators
              </Button>
            </footer>
          </div>
        </section>
      </div>
    );
  };

  const renderProducerContent = () => {
    if (!selectedCapsule) {
      return (
        <div className={styles.noticeCard}>
          <h3>Pick a Capsule to unlock Producer tools</h3>
          <p>
            Once you choose a destination, we&apos;ll populate AI scene controls, cue playlists, and
            automation templates tailored to that Capsule.
          </p>
        </div>
      );
    }

    return (
      <div className={styles.producerLayout}>
        <div className={styles.producerColumn}>
          <div className={styles.shellCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.shellCardTitle}>Scene stack</div>
              <Button variant="outline" size="sm" disabled>
                + New Scene
              </Button>
            </div>
            <ul className={styles.sceneList}>
              <li className={styles.sceneItem}>
                <div className={styles.sceneItemTitle}>Main stage</div>
                <div className={styles.sceneItemMeta}>AI camera framing • host + guest</div>
              </li>
              <li className={styles.sceneItem}>
                <div className={styles.sceneItemTitle}>Clips &amp; react</div>
                <div className={styles.sceneItemMeta}>Picture-in-picture • sponsor lower-third</div>
              </li>
              <li className={styles.sceneItem}>
                <div className={styles.sceneItemTitle}>Q&amp;A wrap</div>
                <div className={styles.sceneItemMeta}>Chat overlay • poll recap</div>
              </li>
            </ul>
          </div>
        </div>
        <div className={styles.timelineCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.shellCardTitle}>Run of show timeline</div>
            <Button variant="outline" size="sm" disabled>
              Add cue
            </Button>
          </div>
          <div className={styles.shellCardSubtitle}>
            Arrange segments, sponsor reads, and automation triggers. AI producer can auto-fire cues.
          </div>
          <div className={styles.timelineRail}>
            <div className={styles.timelineRow} />
            <div className={styles.timelineRow} />
            <div className={styles.timelineRow} />
          </div>
        </div>
        <div className={styles.assistantCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.shellCardTitle}>AI copilot</div>
            <Button variant="outline" size="sm" disabled>
              Open chat
            </Button>
          </div>
          <ul className={styles.assistantList}>
            <li>Summaries live chat into beat-by-beat show notes.</li>
            <li>Suggests follow-up questions and polls in real time.</li>
            <li>Flags moments for instant clips &amp; VOD chapters.</li>
          </ul>
          <div className={styles.assistantPrompt}>
            &quot;Queue the sponsor slate in 2 minutes and remind me to plug the merch drop.&quot;
          </div>
        </div>
      </div>
    );
  };

  const renderEncoderContent = () => {
    if (!selectedCapsule) {
      return (
        <div className={styles.noticeCard}>
          <h3>Choose a Capsule to set up external encoders</h3>
          <p>
            We&apos;ll generate RTMP credentials, latency profiles, and simulcast targets specific to
            your selected Capsule once it&apos;s chosen.
          </p>
        </div>
      );
    }
    return (
      <div className={styles.encoderLayout}>
        <div className={styles.encoderGrid}>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Stream keys</div>
            <div className={styles.encoderSectionSubtitle}>
              Generate capsule-wide or event-specific keys. Regeneration will revoke existing sessions.
            </div>
            <ul className={styles.encoderList}>
              <li className={styles.encoderRow}>
                Primary RTMP
                <span className={styles.encoderAction}>Copy</span>
              </li>
              <li className={styles.encoderRow}>
                Backup ingest
                <span className={styles.encoderAction}>Copy</span>
              </li>
              <li className={styles.encoderRow}>
                WebRTC token
                <span className={styles.encoderAction}>Rotate</span>
              </li>
            </ul>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Latency &amp; encoding</div>
            <div className={styles.encoderSectionSubtitle}>
              Choose the balance between real-time interaction and stability. We&apos;ll surface
              recommended OBS settings.
            </div>
            <ul className={styles.encoderList}>
              <li className={styles.encoderRow}>
                Mode: Ultra-low latency
                <span className={styles.encoderAction}>Adjust</span>
              </li>
              <li className={styles.encoderRow}>
                Bitrate target: 6 Mbps
                <span className={styles.encoderAction}>Edit</span>
              </li>
              <li className={styles.encoderRow}>
                Keyframe interval: 2s
                <span className={styles.encoderAction}>Edit</span>
              </li>
            </ul>
          </section>
          <section className={styles.encoderSection}>
            <div className={styles.encoderSectionTitle}>Simulcast</div>
            <div className={styles.encoderSectionSubtitle}>
              Link additional destinations. AI producer can coordinate platform-specific calls to action.
            </div>
            <ul className={styles.encoderList}>
              <li className={styles.encoderRow}>
                Twitch channel
                <span className={styles.encoderAction}>Authorize</span>
              </li>
              <li className={styles.encoderRow}>
                YouTube event
                <span className={styles.encoderAction}>Link</span>
              </li>
              <li className={styles.encoderRow}>
                Custom RTMP
                <span className={styles.encoderAction}>Add</span>
              </li>
            </ul>
          </section>
        </div>
        <section className={styles.encoderSection}>
          <div className={styles.encoderSectionTitle}>Reliability &amp; recording plan</div>
          <div className={styles.encoderSectionSubtitle}>
            Configure Mux alerting, cloud backups, and local capture reminders so your crew is always
            covered.
          </div>
          <div className={styles.encoderChecklist}>
            <div className={styles.encoderChecklistItem}>
              Primary / backup ingest health monitoring
            </div>
            <div className={styles.encoderChecklistItem}>Cloud asset recording to Capsule library</div>
            <div className={styles.encoderChecklistItem}>
              Local recording reminders for OBS operators
            </div>
            <div className={styles.encoderChecklistItem}>Webhook pings to moderators &amp; crew</div>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className={styles.shellWrap}>
      <header className={styles.navBar}>
        <div className={capTheme.tabStrip} role="tablist" aria-label="AI Stream Studio sections">
          {TAB_ITEMS.map((tab) => {
            const isActive = activeTab === tab.id;
            const btnClass = isActive ? `${capTheme.tab} ${capTheme.tabActive}` : capTheme.tab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={btnClass}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className={styles.contentArea}>
        {activeTab === "studio"
          ? renderStudioContent()
          : activeTab === "producer"
            ? renderProducerContent()
            : renderEncoderContent()}
      </main>
    </div>
  );
}
