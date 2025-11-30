"use client";

import * as React from "react";

import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { LiveChatRail } from "@/components/live/LiveChatRail";
import type { CapsuleSummary } from "@/server/capsules/service";
import MuxPlayer from "@mux/mux-player-react";
import { Paperclip, Microphone, CaretDown } from "@phosphor-icons/react/dist/ssr";

import { AiStreamCapsuleGate } from "../AiStreamCapsuleGate";
import {
  StudioNotificationBanner,
  type StudioNotification,
} from "../StudioNotificationBanner";
import styles from "@/app/(authenticated)/create/ai-stream/ai-stream.page.module.css";
import type { StreamOverview } from "@/types/ai-stream";
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
  overviewError?: string | null;
  actionBusy: "ensure" | "rotate" | null;
  uptimeSeconds: number | null;
  notification?: StudioNotification | null;
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
  overviewError: overviewErrorMessage,
  actionBusy,
  uptimeSeconds,
  notification,
  onEnsureStream,
  onNavigateToEncoder,
}: LiveStudioTabProps) {
  const encoderBannerClassName = styles.encoderBanner ?? "";

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
      style={{ height: "var(--studio-track-height)", minHeight: "var(--studio-track-height)", overflow: "visible" }}
    >
      <Panel defaultSize={50} minSize={44} collapsible={false}>
        <PanelGroup
          key={autoSaveIds.leftColumn}
          direction="vertical"
          className={styles.panelColumn ?? ""}
          autoSaveId={autoSaveIds.leftColumn}
          storage={panelStorage}
        >
          <Panel defaultSize={50} minSize={42} collapsible={false}>
            <div className={styles.panelSection}>
              {notification ? (
                <StudioNotificationBanner
                  notification={notification}
                  className={encoderBannerClassName}
                />
              ) : null}
              <div className={`${styles.previewPanel} ${styles.panelCard}`}>
                <div className={styles.previewHeader}>
                  <div>
                    <div className={styles.previewTitle}>{selectedCapsule.name}</div>
                    <div className={styles.previewSubtitle}>
                      {streamOverview
                        ? `Status: ${streamOverview.health.status}`
                      : overviewLoading
                        ? "Checking Mux live stream..."
                        : "Mux live stream not yet configured."}
                    </div>
                    {overviewErrorMessage ? (
                      <div className={styles.previewSubtitle}>{overviewErrorMessage}</div>
                    ) : null}
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
                        {streamOverview ? streamOverview.health.latencyMode ?? "standard" : "--"}
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
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} />

          <Panel defaultSize={12} minSize={8} collapsible={false}>
            <div className={styles.panelSection}>
              <div className={`${styles.quickActionsCard} ${styles.panelCard}`}>
                <div className={styles.quickActionsInline}>
                  {["Stream health", "Edit stream info", "Open encoder", "Refresh stats"].map((item) => (
                    <button key={item} type="button" className={styles.quickActionButton} disabled>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleHorizontal}`} />

          <Panel defaultSize={38} minSize={28} collapsible={false}>
            <div className={styles.panelSection}>
              <div className={`${styles.stageManagerCard} ${styles.panelCard}`}>
                <header className={styles.stageManagerHeader}>
                  <div>
                    <div className={styles.stageManagerTitle}>Stage manager</div>
                    <div className={styles.stageManagerSubtitle}>
                      AI prompts and intent chips to drive your stream without leaving preview.
                    </div>
                  </div>
                  <Button variant="ghost" size="xs" disabled>
                    Pop out
                  </Button>
                </header>
                <div className={styles.stageManagerFooter}>
                  <div className={styles.stageManagerSuggestions}>
                    {[
                      "Clip the last 30 seconds",
                      "Save that last game in Memories",
                      "Drop a poll in chat",
                      "Post something engaging in chat",
                    ].map((item) => (
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
                        Ask Capsule AI: clip last 30s, save a memory, drop a poll, post to chat...
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
                </div>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} />

      <Panel defaultSize={22} minSize={18} collapsible={false}>
        <div className={styles.panelSection}>
          <div className={`${styles.resourceCard} ${styles.panelCard}`}>
            <header className={styles.resourceHeader}>
              <div className={styles.resourceTitle}>Activity feed</div>
              <div className={styles.resourceHeaderActions}>
                <div className={styles.collaboratorPresence} aria-hidden>
                  <span className={styles.collaboratorPresenceDot} />
                  <span className={styles.collaboratorPresenceLabel}>On comms: 3</span>
                </div>
                <Button variant="ghost" size="xs" disabled>
                  Filter
                </Button>
              </div>
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

      <PanelResizeHandle className={`${styles.resizeHandle} ${styles.resizeHandleVertical}`} />

      <Panel defaultSize={28} minSize={18} collapsible={false}>
        <div className={styles.panelSection}>
          <div className={`${styles.chatPanelCard} ${styles.panelCard}`}>
            <div className={styles.chatRailShell}>
              <LiveChatRail
                capsuleId={selectedCapsule.id}
                capsuleName={selectedCapsule.name}
                status="waiting"
              />
            </div>
          </div>
        </div>
      </Panel>
    </PanelGroup>
  );
}



