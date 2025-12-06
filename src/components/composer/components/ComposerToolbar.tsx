"use client";

import * as React from "react";
import {
  Brain,
  DotsThree,
  MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";
import menuStyles from "@/components/ui/context-menu.module.css";
import type { SearchOpenDetail, SearchSelectionPayload } from "@/types/search";
import {
  COMPOSER_IMAGE_QUALITY_OPTIONS,
  titleCaseComposerQuality,
} from "@/lib/composer/image-settings";

type ComposerToolbarProps = {
  onClose: () => void;
  disabled: boolean;
  smartContextEnabled: boolean;
  onToggleContext: () => void;
  contextActive: boolean;
  imageQuality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number];
  onQualityChange: (quality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]) => void;
  onSearchSelect?: (payload: SearchSelectionPayload) => void;
};

const SEARCH_EVENT_NAME = "capsules:search:open";

export function ComposerToolbar({
  onClose,
  disabled,
  smartContextEnabled,
  onToggleContext,
  contextActive,
  imageQuality,
  onQualityChange,
  onSearchSelect,
}: ComposerToolbarProps) {
  const [optionsOpen, setOptionsOpen] = React.useState(false);
  const optionsRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!optionsOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (optionsRef.current && target && !optionsRef.current.contains(target)) {
        setOptionsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOptionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [optionsOpen]);

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

  const handleToggleOptions = React.useCallback(() => {
    if (disabled) return;
    setOptionsOpen((open) => !open);
  }, [disabled]);

  const handleToggleContext = React.useCallback(() => {
    if (disabled) return;
    onToggleContext();
  }, [disabled, onToggleContext]);

  const handleSelectQuality = React.useCallback(
    (quality: (typeof COMPOSER_IMAGE_QUALITY_OPTIONS)[number]) => {
      if (disabled) return;
      if (quality === imageQuality) return;
      onQualityChange(quality);
      setOptionsOpen(false);
    },
    [disabled, imageQuality, onQualityChange],
  );

  return (
    <div className={styles.panelToolbar}>
      <div className={styles.toolbarBrandRow}>
        <div
          className={styles.memoryLogo}
          data-active={contextActive ? "true" : undefined}
          aria-hidden="true"
        >
          <Brain weight={contextActive ? "fill" : "duotone"} />
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

      <div className={styles.headerActions}>
        <div className={styles.toolbarOptions} ref={optionsRef}>
          <button
            type="button"
            className={styles.headerIconBtn}
            aria-haspopup="menu"
            aria-expanded={optionsOpen}
            aria-label="Open composer options"
            onClick={handleToggleOptions}
            disabled={disabled}
          >
            <DotsThree weight="bold" />
          </button>
          {optionsOpen ? (
            <div
              className={`${menuStyles.menu} ${styles.toolbarOptionsMenu}`.trim()}
              role="menu"
            >
              <div className={menuStyles.sectionLabel}>Composer options</div>
              <button
                type="button"
                className={menuStyles.item}
                role="menuitemcheckbox"
                aria-checked={smartContextEnabled}
                aria-label={smartContextEnabled ? "Turn off context" : "Turn on context"}
                onClick={handleToggleContext}
                disabled={disabled}
                aria-disabled={disabled}
                data-active={contextActive ? "true" : undefined}
              >
                <Brain weight={contextActive ? "fill" : "duotone"} />
                <span>{smartContextEnabled ? "Context on" : "Context off"}</span>
              </button>
              <div className={menuStyles.separator} aria-hidden="true" />
              <div className={menuStyles.sectionLabel}>Image quality</div>
              {COMPOSER_IMAGE_QUALITY_OPTIONS.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={menuStyles.item}
                  role="menuitemradio"
                  aria-checked={imageQuality === quality}
                  data-active={imageQuality === quality ? "true" : undefined}
                  onClick={() => handleSelectQuality(quality)}
                  disabled={disabled}
                  aria-disabled={disabled}
                >
                  <span>{titleCaseComposerQuality(quality)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
