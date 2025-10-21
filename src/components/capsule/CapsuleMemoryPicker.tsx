"use client";

import * as React from "react";
import { ImagesSquare, ArrowClockwise, X } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleCustomizer.module.css";
import { Button } from "@/components/ui/button";
import {
  useCapsuleCustomizerMemory,
  useCapsuleCustomizerPreview,
} from "./hooks/capsuleCustomizerContext";

export function CapsuleMemoryPicker() {
  const memory = useCapsuleCustomizerMemory();
  const preview = useCapsuleCustomizerPreview();

  if (!memory.isPickerOpen) return null;

  const { loading, error, user } = memory;

  return (
    <div className={styles.memoryPickerOverlay} role="presentation" onClick={memory.closePicker}>
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
          onClick={memory.closePicker}
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
                onClick={memory.onQuickPick}
                leftIcon={<ImagesSquare size={16} weight="bold" />}
                disabled={!memory.processedMemories.length}
              >
                Quick pick
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void memory.refresh();
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
            ) : !memory.processedMemories.length ? (
              <p className={styles.memoryStatus}>
                {loading ? "Loading your memories..." : "No memories found yet."}
              </p>
            ) : (
              <div className={styles.memoryGrid}>
                {memory.processedMemories.map((memoryItem) => {
                  const selected =
                    preview.selected?.kind === "memory" && preview.selected.id === memoryItem.id;
                  const alt =
                    memoryItem.title?.trim() ||
                    memoryItem.description?.trim() ||
                    "Capsule memory preview";
                  return (
                    <button
                      key={memoryItem.id}
                      type="button"
                      className={styles.memoryCard}
                      data-selected={selected ? "true" : undefined}
                      onClick={() => memory.onPickMemory(memoryItem)}
                      aria-label={`Use memory ${alt}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={memoryItem.displayUrl} alt={alt} loading="lazy" />
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
