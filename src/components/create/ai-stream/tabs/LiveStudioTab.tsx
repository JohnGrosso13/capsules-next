"use client";

import * as React from "react";

import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { LiveChatRail } from "@/components/live/LiveChatRail";
import type { CapsuleSummary } from "@/server/capsules/service";
import MuxPlayer from "@mux/mux-player-react";
import { Paperclip, Microphone, CaretDown } from "@phosphor-icons/react/dist/ssr";

import { AiStreamCapsuleGate } from "../AiStreamCapsuleGate";
import styles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import type { StreamOverview } from "../useAiStreamStudioStore";
import { formatDuration, formatTimestamp } from "../formatUtils";

type PanelGroupStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  flush?: () => void | Promise<void>;
  cancel?: () => void;
};

type AutoSaveIds = {
  main: string;
  leftColumn: string;
  rightColumn: string;
};

type LiveStudioTabProps = {
  selectorOpen: boolean;
  selectedCapsule: CapsuleSummary | null;
  capsules: CapsuleSummary[];
  onCapsuleChange: (capsule: CapsuleSummary | null) => void;
  autoSaveIds: AutoSaveIds;
  panelStorage: PanelGroupStorageLike;
  streamOverview: StreamOverview | null;
  overviewLoading: boolean;
  overviewError: string | null;
  actionBusy: "ensure" | "rotate" | null;
  uptimeSeconds: number | null;
  onEnsureStream: () => void;
  onNavigateToEncoder: () => void;
};

export function LiveStudioTab({
  selectorOpen,
  selectedCapsule,
  capsules,
  onCapsuleChange,
  autoSaveIds,
  panelStorage,
  streamOverview,
  overviewLoading,
  overviewError,
  actionBusy,
  uptimeSeconds,
  onEnsureStream,
  onNavigateToEncoder,
}: LiveStudioTabProps) {
  if (selectorOpen || !selectedCapsule) {
    return (
      <AiStreamCapsuleGate
        capsules={capsules}
        selectedCapsule={selectedCapsule}
        onSelectionChange={onCapsuleChange}
      />
    );
  }

  return (
    <PanelGroup
      key={autoSaveIds.main}
      direction="horizontal"
      className={styles.studioLayout ?? ""}
      autoSaveId={autoSaveIds.main}
      storage={panelStorage}
      style={{ height: "auto", minHeight: "var(--studio-track-height)", overflow: "visible" }}
    >
      <Panel defaultSize={50} minSize={44} collapsible={false}>
        <PanelGroup
          key={autoSaveIds.leftColumn}
          direction="vertical"
          className={styles.panelColumn ?? ""}
          autoSaveId={autoSaveIds.leftColumn}
          storage={panelStorage}
        >
          <Panel defaultSize={58} minSize={46} collapsible={false}>
            <div className={styles.panelSection}>
              <div className={`${styles.previewPanel} ${styles.panelCard}`}>
                <div className={styles.previewHeader}>
                  <div>
                    <div className={styles.previewTitle}>{selectedCapsule.name}</div>
                    <div className={styles.previewSubtitle}>
                      {streamOverview
                        ? `Status: ${streamOverview.liveStream.status}`
                        : overviewLoading
                          ? "Checking Mux live stream..."
                          : "Mux live stream not yet configured."}
                    </div>
                    {overviewError ? <div className={styles.previewError}>{overviewError}</div> : null}
                  </div>
                  <div className={styles.previewActions}>
                    <Button variant="outline" size="sm" onClick={onNavigateToEncoder}>
                      Encoder settings
                    </Button>
                    <Button variant="gradient" size="sm" disabled>
                      Go live
                    </Button>
                  </div>
                </div>
                <div className={styles.previewFrame}>
                  {overviewLoading ? (
                    <div className={styles.previewPlaceholder}>Loading stream preview...</div>
                  ) : streamOverview?.playback.playbackId ? (
                    <MuxPlayer
                      playbackId={streamOverview.playback.playbackId ?? undefined}
                      streamType="live"
                      metadata={{
                        video_title: `${selectedCapsule.name} live preview`,
                      }}
                      style={{ width: "100%", height: "100%", borderRadius: "18px" }}
                    />
                  ) : (
                    <div className={styles.previewEmpty}>
                      <p>Set up your stream in the Encoder tab to preview playback here.</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onEnsureStream}
                        disabled={actionBusy === "ensure" || overviewLoading}
                      >
                        {actionBusy === "ensure" ? "Preparing..." : "Set up streaming"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className={styles.previewFooter}>
                  <div className={styles.previewStats}>
                    <div className={styles.previewStat}>
                      <span className={styles.previewStatLabel}>Uptime</span>
                      <span className={styles.previewStatValue}>{formatDuration(uptimeSeconds)}</span>
                    </div>
                    <div className={styles.previewStat}>
                      <span className={styles.previewStatLabel}>Latency</span>
                      <span className={styles.previewStatValue}>
                        {streamOverview
                          ? streamOverview.liveStream.latencyMode ??
                            (streamOverview.liveStream.isLowLatency ? "low" : "standard")
                          : "--"}
                      </span>
                    </div>
                    <div className={styles.previewStat}>
                      <span className={styles.previewStatLabel}>Last active</span>
                      <span className={styles.previewStatValue}>
                        {formatTimestamp(streamOverview?.liveStream.lastActiveAt)}
                      </span>
                    </div>
                    <div className={styles.previewStat}>
                      <span className={styles.previewStatLabel}>Last seen</span>
                      <span className={styles.previewStatValue}>
                        {formatTimestamp(streamOverview?.liveStream.lastSeenAt)}
                      </span>
                    </div>
                  </div>
                  <div className={styles.previewMeta}>
                    <div>
                      <span className={styles.previewMetaLabel}>Primary ingest</span>
                      <span className={styles.previewMetaValue}>
                        {streamOverview?.ingest.primary ?? "rtmps://global-live.mux.com:443/app"}
                      </span>
                    </div>
                    <div>
                      <span className={styles.previewMetaLabel}>Stream key</span>
                      <span className={styles.previewMetaValue}>{streamOverview?.ingest.streamKey ?? "--"}</span>
                    </div>
                    <div>
                      <span className={styles.previewMetaLabel}>Playback ID</span>
                      <span className={styles.previewMetaValue}>
                        {streamOverview?.playback.playbackId ?? "--"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} />

          <Panel defaultSize={42} minSize={28} collapsible={false}>
            <div className={styles.panelSection}>
              <div className={`${styles.stageManagerCard} ${styles.panelCard}`}>
                <header className={styles.stageManagerHeader}>
                  <div>
                    <div className={styles.stageManagerTitle}>Stage manager</div>
                    <div className={styles.stageManagerSubtitle}>
                      Scene cues, AI prompts, and quick actions coordinated in one timeline.
                    </div>
                  </div>
                  <Button variant="ghost" size="xs" disabled>
                    Timeline
                  </Button>
                </header>
                <div className={styles.stageManagerEvents}>
                  <div className={styles.stageManagerEvent}>
                    <span className={styles.stageManagerEventTime}>+00</span>
                    <div className={styles.stageManagerEventBody}>
                      <strong>Welcome teaser</strong>
                      <p>60-second intro with host on camera. Slide deck is primed and overlays are synced.</p>
                    </div>
                  </div>
                  <div className={styles.stageManagerEvent}>
                    <span className={styles.stageManagerEventTime}>+05</span>
                    <div className={styles.stageManagerEventBody}>
                      <strong>Invite guest speaker</strong>
                      <p>Queue split-screen layout and drop guest bio lower-third.</p>
                    </div>
                  </div>
                  <div className={styles.stageManagerEvent}>
                    <span className={styles.stageManagerEventTime}>+12</span>
                    <div className={styles.stageManagerEventBody}>
                      <strong>Community prompt</strong>
                      <p>Run poll about feature wishlist. AI will surface top responses for wrap-up.</p>
                    </div>
                  </div>
                </div>
                <div className={styles.stageManagerThread}>
                  <div className={styles.stageManagerMessage}>
                    <span className={styles.stageManagerAuthor}>Stage manager</span>
                    <p>
                      Want me to prep a sponsor segment once the demo wraps? I can ready the CTA overlay and chat
                      reminder.
                    </p>
                  </div>
                  <div className={styles.stageManagerMessageSelf}>
                    <span className={styles.stageManagerAuthor}>You</span>
                    <p>Yes - schedule it for the 18 minute mark if engagement is high.</p>
                  </div>
                </div>
                <footer className={styles.stageManagerFooter}>
                  <div className={styles.stageManagerSuggestions}>
                    {["Draft outro talking points", "Prep Q&A handoff", "Summarize chat sentiment"].map((item) => (
                      <button key={item} type="button" className={styles.stageManagerSuggestion} disabled>
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className={styles.stageManagerComposer}>
                    <div className={styles.stageManagerPrompter} aria-hidden>
                      <button className={styles.stageManagerPrompterIcon} type="button" disabled>
                        <Paperclip size={18} weight="duotone" />
                      </button>
                      <span className={styles.stageManagerPrompterPlaceholder}>
                        Ask your Capsule AI to create anything...
                      </span>
                      <div className={styles.stageManagerPrompterActions}>
                        <button className={styles.stageManagerPrompterIcon} type="button" disabled>
                          <Microphone size={18} weight="duotone" />
                        </button>
                        <button className={styles.stageManagerPrompterPrimary} type="button" disabled>
                          Generate
                        </button>
                        <button className={styles.stageManagerPrompterCaret} type="button" disabled>
                          <CaretDown size={14} weight="bold" />
                        </button>
                      </div>
                    </div>
                  </div>
                </footer>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} />

      <Panel defaultSize={12} minSize={11} collapsible={false}>
        <PanelGroup
          key={autoSaveIds.rightColumn}
          direction="vertical"
          className={styles.panelColumn ?? ""}
          autoSaveId={autoSaveIds.rightColumn}
          storage={panelStorage}
        >
          <Panel defaultSize={60} minSize={18} collapsible={false}>
            <div className={styles.panelSection}>
              <div className={`${styles.resourceCard} ${styles.panelCard}`}>
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
            </div>
          </Panel>

          <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} />

          <Panel defaultSize={40} minSize={24} collapsible={false}>
            <div className={styles.panelSection}>
              <div className={`${styles.collaboratorCard} ${styles.panelCard}`}>
                <header className={styles.sectionHeader}>
                  <div className={styles.shellCardTitle}>Live collaborators</div>
                  <Button variant="ghost" size="xs" disabled>
                    Invite
                  </Button>
                </header>
                <ul className={styles.collaboratorList}>
                  <li className={styles.collaboratorItem}>
                    <div className={styles.collaboratorMeta}>
                      <span className={styles.collaboratorName}>Avery</span>
                      <span className={styles.collaboratorRole}>Producer</span>
                    </div>
                    <span className={`${styles.collaboratorStatus} ${styles.collaboratorStatusActive}`}>
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
                    <span className={`${styles.collaboratorStatus} ${styles.collaboratorStatusAway}`}>
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
            </div>
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} />

      <Panel defaultSize={20} minSize={14} collapsible={false}>
        <div className={styles.panelSection}>
          <div className={styles.chatRailShell}>
            <LiveChatRail capsuleId={selectedCapsule.id} capsuleName={selectedCapsule.name} status="waiting" />
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}
