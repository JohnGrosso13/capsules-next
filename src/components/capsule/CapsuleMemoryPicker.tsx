"use client";

import * as React from "react";
import { ImagesSquare, ArrowClockwise, X } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleCustomizer.module.css";
import { Button } from "@/components/ui/button";
import type { CapsuleMemoryState, SelectedBanner } from "./hooks/useCapsuleCustomizerState";
import type { DisplayMemoryUpload } from "@/components/memory/uploads-types";

type CapsuleMemoryPickerProps = {
  open: boolean;
  processedMemories: DisplayMemoryUpload[];
  selectedBanner: SelectedBanner | null;
  state: Pick<CapsuleMemoryState, "loading" | "error" | "user">;
  onClose: () => void;
  onQuickPick: () => void;
  onRefresh: () => void;
  onPick: (memory: DisplayMemoryUpload) => void;
};

export function CapsuleMemoryPicker({
  open,
  processedMemories,
  selectedBanner,
  state,
  onClose,
  onQuickPick,
  onRefresh,
  onPick,
}: CapsuleMemoryPickerProps) {
  if (!open) return null;

  const { loading, error, user } = state;

  return (
    <div className={styles.memoryPickerOverlay} role="presentation" onClick={onClose}>
      <div
        id="memory-picker-dialog"
        className={styles.memoryPickerPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="memory-picker-heading"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={`${styles.closeButton} ${styles.memoryPickerClose}`}
          onClick={onClose}
          aria-label="Close memory picker"
        >
          <X size={18} weight="bold" />
        </button>
        <div className={styles.memorySection}>
          <div className={styles.memoryHeader}>
            <div className={styles.memoryTitleGroup}>
              <h3 id="memory-picker-heading">Memories</h3>
              <span>Use something you&apos;ve already saved</span>
            </div>
            <div className={styles.memoryActions}>
              <Button
                variant="ghost"
                size="sm"
                onClick={onQuickPick}
                leftIcon={<ImagesSquare size={16} weight="bold" />}
                disabled={!processedMemories.length}
              >
                Quick pick
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void onRefresh();
                }}
                leftIcon={<ArrowClockwise size={16} weight="bold" />}
                disabled={loading}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
          </div>
          <div className={styles.memoryPickerContent}>
            {!user ? (
              <p className={styles.memoryStatus}>Sign in to access your memories.</p>
            ) : error ? (
              <p className={styles.memoryStatus}>{error}</p>
            ) : !processedMemories.length ? (
              <p className={styles.memoryStatus}>
                {loading ? "Loading your memories..." : "No memories found yet."}
              </p>
            ) : (
              <div className={styles.memoryGrid}>
                {processedMemories.map((memory) => {
                  const selected =
                    selectedBanner?.kind === "memory" && selectedBanner.id === memory.id;
                  const alt =
                    memory.title?.trim() || memory.description?.trim() || "Capsule memory preview";
                  return (
                    <button
                      key={memory.id}
                      type="button"
                      className={styles.memoryCard}
                      data-selected={selected ? "true" : undefined}
                      onClick={() => onPick(memory)}
                      aria-label={`Use memory ${alt}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={memory.displayUrl} alt={alt} loading="lazy" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
