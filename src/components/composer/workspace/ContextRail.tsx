import * as React from "react";
import { ClockCounterClockwise, FolderSimple, Lightbulb } from "@phosphor-icons/react/dist/ssr";

import type { Artifact } from "@/shared/types/artifacts";

import styles from "./composer-workspace.module.css";

export type WorkspaceListItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
};

type ContextRailProps = {
  artifact: Artifact | null;
  collapsed: boolean;
  open: boolean;
  recents: WorkspaceListItem[];
  references: WorkspaceListItem[];
  suggestions: string[];
  onSelectRecent?: (id: string) => void;
  onSelectReference?: (id: string) => void;
  onApplySuggestion?: (value: string) => void;
  onClose?: () => void;
};

export function ContextRail({
  artifact,
  collapsed,
  open,
  recents,
  references,
  suggestions,
  onSelectRecent,
  onSelectReference,
  onApplySuggestion,
  onClose,
}: ContextRailProps) {
  const title = artifact?.title ?? "Untitled artifact";
  const typeLabel = artifact?.artifactType ? artifact.artifactType.replace(/_/g, " ") : "";

  if (collapsed && !open) {
    return null;
  }

  return (
    <aside
      className={collapsed ? `${styles.contextRail} ${styles.contextRailCollapsed}`.trim() : styles.contextRail}
      data-open={open ? "true" : "false"}
      aria-label="Composer context"
    >
      <div className={styles.contextRailSection}>
        <div className={styles.contextRailSectionHeader}>Active draft</div>
        <div className={styles.contextRailList}>
          <button
            type="button"
            className={styles.suggestionChip}
            onClick={onClose}
            style={{ justifyContent: "flex-start", width: "100%" }}
          >
            {title}
          </button>
          {typeLabel ? <span className={styles.ghostMessage}>{typeLabel}</span> : null}
        </div>
      </div>

      {recents.length ? (
        <div className={styles.contextRailSection}>
          <div className={styles.contextRailSectionHeader}>
            <ClockCounterClockwise size={14} weight="bold" aria-hidden /> Recent drafts
          </div>
          <div className={styles.contextRailList}>
            {recents.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.suggestionChip}
                onClick={() => onSelectRecent?.(item.id)}
                aria-label={`Open draft ${item.title}`}
              >
                <span>{item.title}</span>
                {item.meta ? <span className={styles.ghostMessage}>{item.meta}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {references.length ? (
        <div className={styles.contextRailSection}>
          <div className={styles.contextRailSectionHeader}>
            <FolderSimple size={14} weight="bold" aria-hidden /> Related assets
          </div>
          <div className={styles.contextRailList}>
            {references.map((item) => (
              <button
                key={item.id}
                type="button"
                className={styles.suggestionChip}
                onClick={() => onSelectReference?.(item.id)}
                aria-label={`Open reference ${item.title}`}
              >
                <span>{item.title}</span>
                {item.meta ? <span className={styles.ghostMessage}>{item.meta}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {suggestions.length ? (
        <div className={styles.contextRailSection}>
          <div className={styles.contextRailSectionHeader}>
            <Lightbulb size={14} weight="bold" aria-hidden /> Suggestions
          </div>
          <div className={styles.contextRailList}>
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                className={styles.suggestionChip}
                onClick={() => onApplySuggestion?.(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
