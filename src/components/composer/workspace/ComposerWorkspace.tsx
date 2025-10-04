"use client";

import * as React from "react";
import { ChatsCircle, SidebarSimple } from "@phosphor-icons/react/dist/ssr";

import { useComposerArtifact, ComposerArtifactProvider } from "@/hooks/useComposerArtifact";
import type { FocusedSlotRef } from "@/hooks/useComposerArtifact";
import { useWorkspaceShortcuts } from "@/hooks/useWorkspaceShortcuts";
import type { ComposerEventBus } from "@/lib/composer/event-bus";
import type { Artifact } from "@/shared/types/artifacts";

import { ArtifactCanvas } from "./ArtifactCanvas";
import { ChatControlPanel } from "./ChatControlPanel";
import { ContextRail, type WorkspaceListItem } from "./ContextRail";
import styles from "./composer-workspace.module.css";

type ComposerWorkspaceProps = {
  artifact: Artifact | null;
  eventBus?: ComposerEventBus | null;
  recents?: WorkspaceListItem[];
  references?: WorkspaceListItem[];
  suggestions?: string[];
  onSelectRecent?: (id: string) => void;
  onSelectReference?: (id: string) => void;
  onApplySuggestion?: (value: string) => void;
  onSendMessage?: (value: string) => Promise<void> | void;
};

type ComposerWorkspaceInnerProps = ComposerWorkspaceProps;

function useMediaQuery(query: string): boolean {
  const getMatch = React.useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const [matches, setMatches] = React.useState(getMatch);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia(query);
    const handler = () => setMatches(mediaQuery.matches);
    handler();
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [query, getMatch]);

  return matches;
}

function ComposerWorkspaceInner({
  artifact,
  recents,
  references,
  suggestions,
  onSelectRecent,
  onSelectReference,
  onApplySuggestion,
  onSendMessage,
}: ComposerWorkspaceInnerProps) {
  const {
    artifact: currentArtifact,
    viewState,
    selectedBlockId,
    focusedSlot,
    pendingChanges,
    lastStatus,
    selectBlock,
    setFocusedSlot,
  } = useComposerArtifact({ artifact, autoHydrate: true });

  const [railCollapsed, setRailCollapsed] = React.useState(true);
  const [railOverlayOpen, setRailOverlayOpen] = React.useState(false);
  const [chatCollapsed, setChatCollapsed] = React.useState(false);
  const [chatOverlayOpen, setChatOverlayOpen] = React.useState(true);

  const isRailOverlay = useMediaQuery("(max-width: 1439px)");
  const isChatOverlay = useMediaQuery("(max-width: 1199px)");

  React.useEffect(() => {
    if (isRailOverlay) {
      setRailCollapsed(true);
    } else {
      setRailOverlayOpen(false);
    }
  }, [isRailOverlay]);

  React.useEffect(() => {
    if (isChatOverlay) {
      setChatCollapsed(true);
      setChatOverlayOpen(false);
    } else {
      setChatCollapsed(false);
      setChatOverlayOpen(true);
    }
  }, [isChatOverlay]);

  const handleToggleContext = React.useCallback(() => {
    if (isRailOverlay) {
      setRailOverlayOpen((prev) => !prev);
    } else {
      setRailCollapsed((prev) => !prev);
    }
  }, [isRailOverlay]);

  const handleToggleChat = React.useCallback(() => {
    if (isChatOverlay) {
      setChatOverlayOpen((prev) => !prev);
    } else {
      setChatCollapsed((prev) => !prev);
    }
  }, [isChatOverlay]);

  useWorkspaceShortcuts({
    onToggleContextRail: handleToggleContext,
    onToggleChat: handleToggleChat,
  });

  const focus: FocusedSlotRef = React.useMemo(
    () => ({
      blockId: focusedSlot?.blockId ?? selectedBlockId,
      slotId: focusedSlot?.slotId ?? null,
    }),
    [focusedSlot, selectedBlockId],
  );

  const resolvedRecents: WorkspaceListItem[] = React.useMemo(() => {
    if (recents) return recents;
    const related = currentArtifact?.context?.relatedArtifactIds ?? [];
    return related.map((id) => ({
      id,
      title: `Artifact ${id.slice(0, 6)}`,
      meta: "Linked",
    }));
  }, [recents, currentArtifact]);

  const resolvedReferences: WorkspaceListItem[] = React.useMemo(() => {
    if (references) return references;
    const assets = currentArtifact?.context?.relatedAssetIds ?? [];
    return assets.map((id) => ({
      id,
      title: `Asset ${id.slice(0, 6)}`,
      meta: "From memory",
    }));
  }, [references, currentArtifact]);

  const resolvedSuggestions = React.useMemo(() => {
    if (suggestions && suggestions.length) return suggestions;
    return [
      "Branch this artifact",
      "Highlight the main CTA",
      "Suggest supporting visuals",
    ];
  }, [suggestions]);

  return (
    <div className={styles.workspace}>
      <header className={styles.workspaceHeader}>
        <div className={styles.workspaceHeaderGroup}>
          <button
            type="button"
            className={styles.suggestionChip}
            onClick={handleToggleContext}
            aria-pressed={isRailOverlay ? railOverlayOpen : !railCollapsed}
          >
            <SidebarSimple size={16} weight="bold" aria-hidden />
            Context
          </button>
          <button
            type="button"
            className={styles.suggestionChip}
            onClick={handleToggleChat}
            aria-pressed={isChatOverlay ? chatOverlayOpen : !chatCollapsed}
          >
            <ChatsCircle size={16} weight="bold" aria-hidden />
            Chat
          </button>
        </div>
      </header>
      <div
        className={styles.workspaceBody}
        data-context={railCollapsed ? "collapsed" : "expanded"}
        data-chat={chatCollapsed ? "collapsed" : "expanded"}
      >
        <ContextRail
          artifact={currentArtifact}
          collapsed={railCollapsed}
          open={railOverlayOpen}
          recents={resolvedRecents}
          references={resolvedReferences}
          suggestions={resolvedSuggestions}
          onSelectRecent={onSelectRecent}
          onSelectReference={onSelectReference}
          onApplySuggestion={onApplySuggestion}
          onClose={() => setRailOverlayOpen(false)}
        />
        <div className={styles.canvasColumn}>
          <ArtifactCanvas
            artifact={currentArtifact}
            focus={focus}
            viewState={viewState}
            pendingChanges={pendingChanges}
            onSelectBlock={selectBlock}
            onFocusSlot={(blockId, slotId) => setFocusedSlot({ blockId, slotId })}
          />
        </div>
        <ChatControlPanel
          viewState={viewState}
          pendingChanges={pendingChanges}
          lastStatus={lastStatus}
          open={isChatOverlay ? chatOverlayOpen : true}
          collapsed={chatCollapsed}
          suggestions={resolvedSuggestions}
          onToggle={handleToggleChat}
          onSendMessage={onSendMessage}
        />
      </div>
    </div>
  );
}

export function ComposerWorkspace(props: ComposerWorkspaceProps) {
  const { artifact, eventBus, ...rest } = props;
  return (
    <ComposerArtifactProvider eventBus={eventBus}>
      <ComposerWorkspaceInner artifact={artifact} {...rest} />
    </ComposerArtifactProvider>
  );
}
