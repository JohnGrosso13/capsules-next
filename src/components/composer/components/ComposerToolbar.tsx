"use client";

import * as React from "react";
import {
  X,
  Sparkle,
  Brain,
  List,
  SidebarSimple,
  FileText,
  FolderSimple,
  MagnifyingGlass,
  Play,
  ImageSquare,
} from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";
import type { SearchOpenDetail, SearchSelectionPayload } from "@/types/search";
import {
  COMPOSER_IMAGE_QUALITY_OPTIONS,
  titleCaseComposerQuality,
} from "@/lib/composer/image-settings";

type ComposerToolbarProps = {
  activeKind: string;
  onSelectKind: (key: string) => void;
  onClose: () => void;
  disabled: boolean;
  smartContextEnabled: boolean;
  onToggleContext: () => void;
  contextActive: boolean;
  imageQuality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number];
  onQualityChange: (quality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]) => void;
  onMenuToggle?: () => void;
  mobileRailOpen?: boolean;
  onPreviewToggle?: () => void;
  previewOpen?: boolean;
  onSearchSelect?: (payload: SearchSelectionPayload) => void;
};

const SEARCH_EVENT_NAME = "capsules:search:open";

export function ComposerToolbar({
  activeKind,
  onSelectKind,
  onClose,
  disabled,
  smartContextEnabled,
  onToggleContext,
  contextActive,
  imageQuality,
  onQualityChange,
  onMenuToggle,
  mobileRailOpen,
  onPreviewToggle,
  previewOpen,
  onSearchSelect,
}: ComposerToolbarProps) {
  const handleSearchClick = React.useCallback(() => {
    if (typeof window === "undefined") return;
    const detail: SearchOpenDetail | undefined =
      typeof onSearchSelect === "function"
        ? { mode: "composer", onSelect: onSearchSelect }
        : undefined;
    window.dispatchEvent(
      detail
        ? new CustomEvent<SearchOpenDetail>(SEARCH_EVENT_NAME, { detail })
        : new CustomEvent(SEARCH_EVENT_NAME),
    );
  }, [onSearchSelect]);

  const cycleQuality = React.useCallback(() => {
    const options = COMPOSER_IMAGE_QUALITY_OPTIONS;
    const currentIndex = options.indexOf(imageQuality);
    const next = options[(currentIndex + 1) % options.length] ?? "standard";
    onQualityChange(next);
  }, [imageQuality, onQualityChange]);

  const modeOptions = React.useMemo(
    () => [
      { key: "text", label: "Text", Icon: FileText },
      { key: "image", label: "Image", Icon: ImageSquare },
      { key: "video", label: "Video", Icon: Play },
      { key: "poll", label: "Poll", Icon: List },
      { key: "project", label: "Project", Icon: FolderSimple },
    ],
    [],
  );

  return (
    <div className={styles.panelToolbar}>
      <div className={styles.toolbarHeading}>
        <div className={styles.toolbarBrandRow}>
          <div className={styles.memoryLogo} aria-hidden="true">
            AI
          </div>
          <div>
            <div className={styles.toolbarBadge}>Capsule Composer</div>
            <p className={styles.toolbarTitle}>Create in any mode</p>
            <p className={styles.toolbarSubtitle}>Search memories, pick a format, and ship fast.</p>
          </div>
        </div>
      </div>

      <div className={styles.headerSearch}>
        <button
          className={styles.toolbarSearchBtn}
          type="button"
          onClick={handleSearchClick}
          aria-label="Search memories"
          disabled={disabled}
        >
          <MagnifyingGlass />
          <span className={styles.toolbarSearchLabel}>Search memories</span>
        </button>
      </div>

      <div className={styles.toolbarModes} role="group" aria-label="Composer modes">
        {modeOptions.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            className={styles.modeToggle}
            data-selected={activeKind === key ? "true" : undefined}
            onClick={() => onSelectKind(key)}
            disabled={disabled}
          >
            <Icon size={16} weight={activeKind === key ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className={styles.headerActions}>
        <button
          type="button"
          className={styles.smartContextToggle}
          aria-pressed={contextActive}
          aria-label={contextActive ? "Turn off smart context" : "Turn on smart context"}
          onClick={onToggleContext}
          disabled={disabled}
          data-active={contextActive ? "true" : undefined}
        >
          <Brain weight={contextActive ? "fill" : "duotone"} />
          <span>{smartContextEnabled ? "Context on" : "Context off"}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarIconBtn}
          aria-label="Change image quality"
          onClick={cycleQuality}
          disabled={disabled}
        >
          <Sparkle />
          <span className={styles.toolbarIconLabel}>{titleCaseComposerQuality(imageQuality)}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarIconBtn}
          aria-pressed={previewOpen}
          aria-label={previewOpen ? "Hide preview" : "Show preview"}
          onClick={() => onPreviewToggle?.()}
          disabled={disabled}
        >
          <SidebarSimple weight={previewOpen ? "fill" : "duotone"} />
          <span className={styles.toolbarIconLabel}>{previewOpen ? "Hide preview" : "Show preview"}</span>
        </button>

        <button
          type="button"
          className={styles.toolbarIconBtn}
          aria-label="Toggle library sidebar"
          onClick={() => onMenuToggle?.()}
          disabled={disabled}
        >
          <SidebarSimple weight={mobileRailOpen ? "fill" : "duotone"} />
          <span className={styles.toolbarIconLabel}>Library</span>
        </button>

        <button
          type="button"
          className={styles.headerIconBtn}
          aria-label="Close Composer"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
    </div>
  );
}
