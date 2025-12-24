"use client";

import * as React from "react";
import { Brain, MagnifyingGlass, X } from "@phosphor-icons/react/dist/ssr";

import styles from "../styles";
import type { SearchOpenDetail, SearchSelectionPayload } from "@/types/search";

type ComposerToolbarProps = {
  disabled: boolean;
  onSearchSelect?: (payload: SearchSelectionPayload) => void;
  onClose: () => void;
  onSearchOpen?: () => void;
};

const SEARCH_EVENT_NAME = "capsules:search:open";

export function ComposerToolbar({
  disabled,
  onSearchSelect,
  onClose,
  onSearchOpen,
}: ComposerToolbarProps) {
  const handleSearchClick = React.useCallback(() => {
    if (typeof onSearchOpen === "function") {
      onSearchOpen();
      return;
    }
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
  }, [onSearchOpen, onSearchSelect]);

  return (
    <div className={styles.panelToolbar}>
      <div className={styles.toolbarBrandRow}>
        <div
          className={styles.memoryLogo}
          aria-hidden="true"
        >
          <Brain weight="duotone" />
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
        <button
          type="button"
          className={styles.closeIcon}
          onClick={onClose}
          aria-label="Close composer"
        >
          <X weight="bold" />
        </button>
      </div>
    </div>
  );
}
