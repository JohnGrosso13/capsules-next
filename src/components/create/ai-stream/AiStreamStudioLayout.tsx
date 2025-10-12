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
        <div className={styles.studioMain}>
          <div className={styles.previewPanel}>
            <div className={styles.previewHeader}>
              <div>
                <div className={styles.previewTitle}>Program Preview</div>
                <div className={styles.shellCardSubtitle}>
                  Routed to {selectedCapsule.name}
                </div>
              </div>
              <Button variant="gradient" size="sm" disabled>
                Go live (preview)
              </Button>
            </div>
            <div className={styles.previewFrame}>Program Feed</div>
            <div className={styles.previewHeader}>
              <span className={styles.previewStatus}>
                <span aria-hidden>●</span> AI health monitor
              </span>
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
            <div className={styles.studioControlGrid}>
              <div className={styles.studioControlChip}>
                <span className={styles.studioControlLabel}>Scene</span>
                AI selects layout per segment
              </div>
              <div className={styles.studioControlChip}>
                <span className={styles.studioControlLabel}>Overlays</span>
                Lower-thirds &amp; sponsor cadence
              </div>
              <div className={styles.studioControlChip}>
                <span className={styles.studioControlLabel}>Chat</span>
                Highlights, polls, and mod queue
              </div>
              <div className={styles.studioControlChip}>
                <span className={styles.studioControlLabel}>Recording</span>
                Auto VOD &amp; live clipping
              </div>
            </div>
          </div>
        </div>
        <aside className={styles.studioSidebar}>
          <div className={styles.shellCard}>
            <div className={styles.shellCardTitle}>Pre-live checklist</div>
            <div className={styles.shellCardSubtitle}>
              Studio will confirm these before the countdown hits zero.
            </div>
            <ul className={styles.shellList}>
              <li className={styles.shellListItem}>
                Camera &amp; mic permissions
                <span className={styles.shellBadge}>Auto</span>
              </li>
              <li className={styles.shellListItem}>
                Scene &amp; overlay sanity check
                <span className={styles.shellBadge}>AI</span>
              </li>
              <li className={styles.shellListItem}>
                Simulcast destinations ready
                <span className={styles.shellBadge}>Mux</span>
              </li>
            </ul>
          </div>
          <div className={styles.shellCard}>
            <div className={styles.shellCardTitle}>Live signals</div>
            <div className={styles.shellCardSubtitle}>
              Health, engagement, and crew notes update during the show.
            </div>
            <ul className={styles.shellList}>
              <li className={styles.shellListItem}>
                Bitrate / dropped frames
                <span className={styles.shellBadge}>0 issues</span>
              </li>
              <li className={styles.shellListItem}>
                Chat heat index
                <span className={styles.shellBadge}>Warming up</span>
              </li>
              <li className={styles.shellListItem}>
                AI crew alerts
                <span className={styles.shellBadge}>Queued</span>
              </li>
            </ul>
          </div>
        </aside>
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
            “Queue the sponsor slate in 2 minutes and remind me to plug the merch drop.”
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
