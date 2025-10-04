import * as React from "react";

import type {
  Artifact,
  ArtifactBlock,
  ArtifactSlot,
  ComposerViewState,
  PendingComposerChange,
} from "@/shared/types/artifacts";

import styles from "./composer-workspace.module.css";

type ArtifactCanvasProps = {
  artifact: Artifact | null;
  focus: { blockId: string | null; slotId: string | null };
  viewState: ComposerViewState;
  pendingChanges: PendingComposerChange[];
  onSelectBlock?: (blockId: string) => void;
  onFocusSlot?: (blockId: string, slotId: string) => void;
};

type RenderBlockOptions = {
  depth: number;
  focus: { blockId: string | null; slotId: string | null };
  onSelectBlock?: (blockId: string) => void;
  onFocusSlot?: (blockId: string, slotId: string) => void;
};

function titleFromBlock(block: ArtifactBlock): string {
  if (block.label) return block.label;
  return block.type.replace(/\./g, " -> ");
}

function renderSlot(blockId: string, slotId: string, slot: ArtifactSlot, options: RenderBlockOptions) {
  return (
    <button
      key={slotId}
      type="button"
      className={styles.canvasSlotCard}
      onClick={() => options.onFocusSlot?.(blockId, slotId)}
    >
      <span className={styles.canvasSlotStatus}>{slotId}</span>
      {slot.value ? (
        <span>
          {slot.value.kind === "text"
            ? slot.value.content.slice(0, 160)
            : slot.value.kind === "media"
              ? slot.value.altText ?? slot.value.url
              : slot.value.kind === "poll"
                ? `${slot.value.options.length} poll options`
                : slot.value.kind === "data"
                  ? `${Object.keys(slot.value.schema).length} data fields`
                  : slot.value.kind === "collection"
                    ? `${slot.value.items.length} items`
                    : slot.value.kind === "action"
                      ? slot.value.label
                      : "Slot value"}
        </span>
      ) : (
        <span className={styles.ghostMessage}>Empty slot</span>
      )}
      <span className={styles.ghostMessage}>{slot.status.toUpperCase()}</span>
    </button>
  );
}

function renderBlock(block: ArtifactBlock, options: RenderBlockOptions): React.ReactNode {
  const slots = Object.entries(block.slots ?? {});
  const isFocused = block.id === options.focus.blockId;
  return (
    <article key={block.id} className={styles.canvasBlock} data-state={isFocused ? "focus" : undefined}>
      <header className={styles.canvasBlockHeader}>
        <button type="button" className={styles.suggestionChip} onClick={() => options.onSelectBlock?.(block.id)}>
          {titleFromBlock(block)}
        </button>
        <span className={styles.ghostMessage}>#{block.id.slice(0, 6)}</span>
      </header>
      <div className={styles.canvasSlots}>
        {slots.length
          ? slots.map(([slotId, slot]) => renderSlot(block.id, slotId, slot, options))
          : <div className={styles.ghostMessage}>No slots defined</div>}
      </div>
      {block.children?.length ? (
        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {block.children.map((child) => renderBlock(child, { ...options, depth: options.depth + 1 }))}
        </div>
      ) : null}
    </article>
  );
}

export function ArtifactCanvas({ artifact, focus, viewState, pendingChanges, onSelectBlock, onFocusSlot }: ArtifactCanvasProps) {
  const blockList = artifact?.blocks ?? [];
  const hasPending = pendingChanges.some((change) => !change.persisted);

  return (
    <section className={styles.canvasSurface} aria-label="Artifact canvas">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <div className={styles.workspaceHeaderTitle}>{artifact?.title ?? "Untitled artifact"}</div>
          <div className={styles.ghostMessage}>
            Version {artifact?.version ?? 1} | Status {artifact?.status ?? "draft"} | View {viewState}
          </div>
        </div>
        {hasPending ? (
          <span className={styles.suggestionChip} style={{ background: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.2)" }}>
            Pending changes...
          </span>
        ) : null}
      </header>
      <div className={styles.canvasColumn}>
        {blockList.length ? (
          blockList.map((block) =>
            renderBlock(block, {
              depth: 0,
              focus,
              onSelectBlock,
              onFocusSlot,
            }),
          )
        ) : (
          <div className={styles.ghostMessage}>No blocks yet. Use the chat to request the first section.</div>
        )}
      </div>
    </section>
  );
}
