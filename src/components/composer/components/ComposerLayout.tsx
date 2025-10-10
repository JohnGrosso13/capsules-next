"use client";

import * as React from "react";
import { List } from "@phosphor-icons/react/dist/ssr";

import styles from "../../ai-composer.module.css";

import type { ComposerLayoutState } from "../hooks/useComposerFormReducer";

type ComposerLayoutProps = {
  columnsRef: React.RefObject<HTMLDivElement | null>;
  mainRef: React.RefObject<HTMLDivElement | null>;
  layout: ComposerLayoutState;
  previewOpen: boolean;
  leftRail: React.ReactNode;
  mainContent: React.ReactNode;
  previewContent?: React.ReactNode;
  mobileRailOpen: boolean;
  onToggleMobileRail: () => void;
  mobileMenu?: React.ReactNode;
  onLeftResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  onRightResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
  onBottomResizeStart: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export function ComposerLayout({
  columnsRef,
  mainRef,
  layout,
  previewOpen,
  leftRail,
  mainContent,
  previewContent,
  mobileRailOpen,
  onToggleMobileRail,
  mobileMenu,
  onLeftResizeStart,
  onRightResizeStart,
  onBottomResizeStart,
}: ComposerLayoutProps) {
  return (
    <>
      <button
        type="button"
        className={styles.mobileRailTrigger}
        aria-label="Open composer menu"
        aria-haspopup="menu"
        aria-expanded={mobileRailOpen}
        onClick={onToggleMobileRail}
      >
        <List size={18} weight="bold" />
      </button>

      <div
        ref={columnsRef}
        className={styles.columns}
        data-preview={previewOpen ? "open" : "closed"}
        style={{
          gridTemplateColumns: previewOpen
            ? `${layout.leftWidth}px minmax(0, 1fr) ${layout.rightWidth}px`
            : `${layout.leftWidth}px minmax(0, 1fr)`,
        }}
      >
        <aside className={styles.rail} aria-label="Conversation navigation">
          {leftRail}
        </aside>

        <section
          ref={mainRef}
          className={styles.mainColumn}
          aria-label="Chat thread"
          style={{ gridTemplateRows: `minmax(0, 1fr) ${layout.bottomHeight}px` }}
        >
          <div
            className={styles.rowResizer}
            role="separator"
            aria-orientation="horizontal"
            data-active={layout.drag?.kind === "bottom" ? "true" : undefined}
            style={{ top: Math.max(32, layout.mainHeight - layout.bottomHeight - 3) }}
            onMouseDown={onBottomResizeStart}
          />
          {mainContent}
        </section>

        {previewOpen ? (
          <aside className={styles.previewRail} aria-label="Post preview">
            {previewContent}
          </aside>
        ) : null}

        <div
          className={styles.colResizer}
          role="separator"
          aria-orientation="vertical"
          data-active={layout.drag?.kind === "left" ? "true" : undefined}
          style={{ left: layout.leftWidth }}
          onMouseDown={onLeftResizeStart}
        />

        {previewOpen ? (
          <div
            className={styles.colResizer}
            role="separator"
            aria-orientation="vertical"
            data-active={layout.drag?.kind === "right" ? "true" : undefined}
            style={{ left: `calc(100% - ${layout.rightWidth}px)` }}
            onMouseDown={onRightResizeStart}
          />
        ) : null}
      </div>

      {mobileRailOpen ? mobileMenu ?? null : null}
    </>
  );
}
