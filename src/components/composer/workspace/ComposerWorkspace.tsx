"use client";

import * as React from "react";
import { ChatsCircle, SidebarSimple } from "@phosphor-icons/react/dist/ssr";

import { useComposerArtifact, ComposerArtifactProvider } from "@/hooks/useComposerArtifact";
import type { FocusedSlotRef } from "@/hooks/useComposerArtifact";
import { useWorkspaceShortcuts } from "@/hooks/useWorkspaceShortcuts";
import { safeRandomUUID } from "@/lib/random";
import type { ComposerEventBus } from "@/lib/composer/event-bus";
import type { Artifact, ArtifactBlock } from "@/shared/types/artifacts";

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
  onClose?: () => void;
};

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

function firstSlotId(block: ArtifactBlock | null | undefined): string | null {
  if (!block) return null;
  const entries = Object.keys(block.slots ?? {});
  return entries.length ? entries[0] : null;
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
  onClose,
}: ComposerWorkspaceProps) {
  const {
    artifact: currentArtifact,
    viewState,
    selectedBlockId,
    focusedSlot,
    pendingChanges,
    lastStatus,
    selectBlock,
    setFocusedSlot,
    setViewState,
    emitEvent,
    markPendingPersisted,
    clearPending,
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

  const focus: FocusedSlotRef = React.useMemo(
    () => ({
      blockId: focusedSlot?.blockId ?? selectedBlockId,
      slotId: focusedSlot?.slotId ?? null,
    }),
    [focusedSlot, selectedBlockId],
  );

  const blocks = React.useMemo(() => currentArtifact?.blocks ?? [], [currentArtifact]);

  const ensureTargetBlock = React.useCallback((): ArtifactBlock | null => {
    if (!currentArtifact) return null;
    if (blocks.length) {
      const focused = blocks.find((block) => block.id === focus.blockId);
      return focused ?? blocks[0];
    }
    const seedBlock: ArtifactBlock = {
      id: safeRandomUUID(),
      type: "text.rich",
      label: "Body",
      state: { mode: "active" },
      slots: {
        body: {
          id: "body",
          kind: "text",
          status: "ready",
          value: {
            kind: "text",
            content: "",
            format: "markdown",
          },
        },
      },
    };
    emitEvent("insert_block", { artifactId: currentArtifact.id, block: seedBlock });
    return seedBlock;
  }, [blocks, currentArtifact, emitEvent, focus.blockId]);

  const handleAddMediaSlot = React.useCallback(() => {
    if (!currentArtifact) return;
    const target = ensureTargetBlock();
    if (!target) return;
    const slotId = `media_${Date.now().toString(36)}`;
    emitEvent("update_slot", {
      artifactId: currentArtifact.id,
      blockId: target.id,
      slotId,
      patch: {
        kind: "media",
        status: "empty",
      },
    });
    selectBlock(target.id);
    setFocusedSlot({ blockId: target.id, slotId });
    setViewState("focusing-slot");
    if (isChatOverlay) setChatOverlayOpen(true);
  }, [currentArtifact, ensureTargetBlock, emitEvent, isChatOverlay, selectBlock, setFocusedSlot, setViewState]);

  const handleRequestMediaUpload = React.useCallback(
    (blockId: string, slotId: string) => {
      if (!currentArtifact) return;
      emitEvent("update_slot", {
        artifactId: currentArtifact.id,
        blockId,
        slotId,
        patch: {
          status: "pending",
          value: {
            kind: "media",
            url: "",
            altText: "Awaiting upload",
            descriptors: { source: "upload" },
          },
          provenance: {
            source: "upload",
            createdAt: new Date().toISOString(),
          },
        },
      });
      setViewState("drafting");
    },
    [currentArtifact, emitEvent, setViewState],
  );

  const handleRequestMediaGenerate = React.useCallback(
    (blockId: string, slotId: string) => {
      if (!currentArtifact) return;
      emitEvent("update_slot", {
        artifactId: currentArtifact.id,
        blockId,
        slotId,
        patch: {
          status: "pending",
          value: {
            kind: "media",
            url: "",
            altText: "Generating preview",
            descriptors: { source: "ai" },
          },
          provenance: {
            source: "ai",
            createdAt: new Date().toISOString(),
          },
        },
      });
      setViewState("drafting");
    },
    [currentArtifact, emitEvent, setViewState],
  );

  const handleAcceptChange = React.useCallback((timestamp: number) => {
    markPendingPersisted([timestamp]);
    setViewState("drafting");
  }, [markPendingPersisted, setViewState]);

  const handleDiscardChange = React.useCallback((timestamp: number) => {
    clearPending([timestamp]);
    setViewState("drafting");
  }, [clearPending, setViewState]);

  const handleFocusNextBlock = React.useCallback(() => {
    if (!blocks.length) return;
    const currentIndex = blocks.findIndex((block) => block.id === focus.blockId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % blocks.length : 0;
    const nextBlock = blocks[nextIndex];
    selectBlock(nextBlock.id);
    const slotId = firstSlotId(nextBlock);
    if (slotId) {
      setFocusedSlot({ blockId: nextBlock.id, slotId });
    } else {
      setFocusedSlot(null);
    }
    setViewState("drafting");
  }, [blocks, focus.blockId, selectBlock, setFocusedSlot, setViewState]);

  const handleFocusPreviousBlock = React.useCallback(() => {
    if (!blocks.length) return;
    const currentIndex = blocks.findIndex((block) => block.id === focus.blockId);
    const prevIndex = currentIndex >= 0 ? (currentIndex - 1 + blocks.length) % blocks.length : blocks.length - 1;
    const prevBlock = blocks[prevIndex];
    selectBlock(prevBlock.id);
    const slotId = firstSlotId(prevBlock);
    if (slotId) {
      setFocusedSlot({ blockId: prevBlock.id, slotId });
    } else {
      setFocusedSlot(null);
    }
    setViewState("drafting");
  }, [blocks, focus.blockId, selectBlock, setFocusedSlot, setViewState]);

  useWorkspaceShortcuts({
    onToggleContextRail: handleToggleContext,
    onToggleChat: handleToggleChat,
    onFocusNextBlock: handleFocusNextBlock,
    onFocusPreviousBlock: handleFocusPreviousBlock,
  });

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
        {onClose ? (
          <div className={styles.workspaceHeaderActions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Close
            </button>
          </div>
        ) : null}
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
            onRequestMediaUpload={handleRequestMediaUpload}
            onRequestMediaGenerate={handleRequestMediaGenerate}
          />
        </div>
        <ChatControlPanel
          viewState={viewState}
          pendingChanges={pendingChanges}
          lastStatus={lastStatus}
          open={isChatOverlay ? chatOverlayOpen : true}
          collapsed={chatCollapsed}
          suggestions={resolvedSuggestions}
          onToggle={isChatOverlay ? handleToggleChat : undefined}
          onSendMessage={onSendMessage}
          onAddMediaSlot={handleAddMediaSlot}
          onAcceptChange={handleAcceptChange}
          onDiscardChange={handleDiscardChange}
        />
      </div>
    </div>
  );
}

export function ComposerWorkspace({ artifact, eventBus, ...rest }: ComposerWorkspaceProps) {
  return (
    <ComposerArtifactProvider eventBus={eventBus}>
      <ComposerWorkspaceInner artifact={artifact} {...rest} />
    </ComposerArtifactProvider>
  );
}

