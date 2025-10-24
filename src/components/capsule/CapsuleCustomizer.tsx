"use client";

import * as React from "react";
import { X } from "@phosphor-icons/react/dist/ssr";

import styles from "./CapsuleCustomizer.module.css";
import { AiPrompterStage } from "@/components/ai-prompter-stage";
import { Button } from "@/components/ui/button";
import {
  useCapsuleCustomizerState,
  type CapsuleCustomizerMode,
  type CapsuleCustomizerSaveResult,
  type ChatMessage,
  type ChatBannerOption,
} from "./hooks/useCapsuleCustomizerState";
import {
  CapsuleCustomizerProvider,
  useCapsuleCustomizerActions,
  useCapsuleCustomizerChat,
  useCapsuleCustomizerMemory,
  useCapsuleCustomizerMeta,
  useCapsuleCustomizerPreview,
  useCapsuleCustomizerSave,
  useCapsuleCustomizerStylesState,
} from "./hooks/capsuleCustomizerContext";
import { CapsuleBannerPreview } from "./CapsuleBannerPreview";
import { CapsuleAssetActions } from "./CapsuleAssetActions";
import { CapsuleMemoryPicker } from "./CapsuleMemoryPicker";
import { CAPSULE_STYLE_CATEGORIES, type CapsuleStyleCategory } from "@/shared/capsule-style";

type CapsuleCustomizerProps = {
  open?: boolean;
  capsuleId?: string | null;
  capsuleName?: string | null;
  onClose: () => void;
  onSaved?: (result: CapsuleCustomizerSaveResult) => void;
  mode?: CapsuleCustomizerMode;
};


function ChatMessageBubble({
  message,
  onBannerSelect,
}: {
  message: ChatMessage;
  onBannerSelect: (option: ChatBannerOption) => void;
}) {
  return (
    <div className={styles.chatMessage} data-role={message.role}>
      <span className={styles.chatAvatar} aria-hidden>
        {message.role === "assistant" ? "AI" : "You"}
      </span>
      <div className={styles.chatBubble}>
        {message.content}
        {message.bannerOptions && message.bannerOptions.length ? (
          <div className={styles.chatBannerGallery} role="list">
            {message.bannerOptions.map((option, index) => (
              <button
                key={option.id}
                type="button"
                className={styles.chatBannerOption}
                onClick={() => onBannerSelect(option)}
                role="listitem"
                aria-label={`Add banner option ${index + 1} to selection`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={option.previewUrl}
                  alt={`Banner concept ${index + 1}`}
                  className={styles.chatBannerImage}
                  loading="lazy"
                />
                <span className={styles.chatBannerOptionOverlay}>Add to banner</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}


const styleCategoryLabels: Record<CapsuleStyleCategory, string> = {
  palette: "Palette",
  lighting: "Lighting",
  medium: "Medium",
  mood: "Mood",
};

function CapsuleStyleControls() {
  const styleState = useCapsuleCustomizerStylesState();
  const { optionsByCategory, selection, setSelection, resetSelection, summary } = styleState;

  const helperText =
    summary.length > 0
      ? summary
      : "Defaults active — your prompt still leads. Adjust any row to enrich or quiet Capsule cues.";

  return (
    <section className={styles.styleControls} aria-label="Style modifiers">
      <div className={styles.styleControlsHeader}>
        <span className={styles.styleControlsTitle}>Style modifiers</span>
        <Button variant="ghost" size="xs" onClick={resetSelection}>
          Reset
        </Button>
      </div>
      <p className={styles.styleControlsSummary}>{helperText}</p>
      <div className={styles.styleControlsGrid}>
        {(CAPSULE_STYLE_CATEGORIES as readonly CapsuleStyleCategory[]).map((category) => {
          const options = optionsByCategory[category] ?? [];
          if (!options.length) return null;
          const label = styleCategoryLabels[category];
          return (
            <div key={category} className={styles.styleControlGroup}>
              <span className={styles.styleControlLabel}>{label}</span>
              <div className={styles.styleControlOptions} role="group" aria-label={`${label} options`}>
                {options.map((option) => {
                  const active = selection[category] === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={styles.styleControlOption}
                      data-active={active ? "true" : undefined}
                      aria-pressed={active}
                      onClick={() => setSelection(category, option.id)}
                    >
                      <span className={styles.styleControlOptionLabel}>{option.label}</span>
                      {option.description ? (
                        <span className={styles.styleControlOptionHint}>{option.description}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CapsuleCustomizer(props: CapsuleCustomizerProps) {
  const { open, ...contextValue } = useCapsuleCustomizerState(props);

  if (!open) return null;

  return (
    <CapsuleCustomizerProvider value={contextValue}>
      <CapsuleCustomizerContent />
    </CapsuleCustomizerProvider>
  );
}

function CapsuleCustomizerContent() {
  const meta = useCapsuleCustomizerMeta();
  const chat = useCapsuleCustomizerChat();
  const memory = useCapsuleCustomizerMemory();
  const preview = useCapsuleCustomizerPreview();
  const save = useCapsuleCustomizerSave();
  const actions = useCapsuleCustomizerActions();

  const saveLabel =
    meta.mode === "tile"
      ? "Save tile"
      : meta.mode === "logo"
        ? "Save logo"
        : meta.mode === "avatar"
          ? "Save avatar"
          : meta.mode === "storeBanner"
            ? "Save store banner"
            : "Save banner";

  return (
    <div className={styles.overlay} role="presentation" onClick={actions.overlayClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capsule-customizer-heading"
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="capsule-customizer-heading">{meta.headerTitle}</h2>
            <p>{meta.headerSubtitle}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={actions.handleClose}
            aria-label={`Close ${meta.assetLabel} customizer`}
          >
            <X size={18} weight="bold" />
          </button>
        </header>

        <div className={styles.content}>
          <section className={styles.recentColumn} aria-labelledby="recent-banners-heading">
            <div className={styles.recentHeader}>
              <h3 id="recent-banners-heading">Recent</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={memory.openPicker}
                aria-haspopup="dialog"
                aria-expanded={memory.isPickerOpen}
                aria-controls="memory-picker-dialog"
              >
                View all memories
              </Button>
            </div>
            <div className={styles.recentDescription}>{meta.recentDescription}</div>
            <div className={styles.recentList} role="list">
              {!memory.user ? (
                <p className={styles.recentHint}>Sign in to see recent memories.</p>
              ) : memory.loading ? (
                <p className={styles.recentHint}>Loading your recent memories...</p>
              ) : memory.error ? (
                <p className={styles.recentHint}>{memory.error}</p>
              ) : memory.recentMemories.length ? (
                memory.recentMemories.map((memoryItem) => {
                  const alt =
                    memoryItem.title?.trim() ||
                    memoryItem.description?.trim() ||
                    "Capsule memory preview";
                  const selected =
                    preview.selected?.kind === "memory" && preview.selected.id === memoryItem.id;
                  return (
                    <button
                      key={memoryItem.id}
                      type="button"
                      role="listitem"
                      className={styles.recentItem}
                      data-selected={selected ? "true" : undefined}
                      onClick={() => memory.onSelectMemory(memoryItem)}
                      aria-label={`Use memory ${alt}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={memoryItem.displayUrl}
                        alt={alt}
                        className={styles.recentImage}
                        loading="lazy"
                      />
                      <div className={styles.recentMeta}>
                        <span className={styles.recentTitle}>{alt}</span>
                        <span className={styles.recentSubtle}>Memory</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className={styles.recentHint}>
                  Generate, upload, or pick a memory to see it surface here.
                </p>
              )}
            </div>
          </section>

          <section className={styles.chatColumn}>
            <div ref={chat.logRef} className={styles.chatLog} aria-live="polite">
              {chat.messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  onBannerSelect={chat.onBannerSelect}
                />
              ))}
              {chat.busy ? (
                <div className={styles.chatTyping} aria-live="polite">
                  Capsule AI is thinking...
                </div>
              ) : null}
            </div>

            <div className={styles.prompterDock}>
              <div className={styles.prompterWrap}>
                <AiPrompterStage
                  key={chat.prompterSession}
                  placeholder={meta.prompterPlaceholder}
                  chips={[]}
                  statusMessage={null}
                  onAction={chat.onPrompterAction}
                  variant="bannerCustomizer"
                />
                <CapsuleStyleControls />
              </div>
            </div>
          </section>

          <section className={styles.previewColumn}>
            <div className={styles.previewPanel}>
              <CapsuleBannerPreview />
              <CapsuleAssetActions />
            </div>
          </section>
        </div>

        <CapsuleMemoryPicker />

        <footer className={styles.footer}>
          <div className={styles.footerStatus} role="status">
            {save.error ? (
              <span className={styles.footerError}>{save.error}</span>
            ) : preview.selected ? (
              actions.describeSelection(preview.selected)
            ) : (
              meta.footerDefaultHint
            )}
          </div>
          <div className={styles.footerActions}>
            <Button variant="ghost" size="sm" onClick={actions.handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                void save.onSave();
              }}
              disabled={!preview.selected || preview.selected.kind === "ai" || save.pending}
              loading={save.pending}
            >
              {saveLabel}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function CapsuleBannerCustomizer(props: CapsuleCustomizerProps) {
  return <CapsuleCustomizer {...props} mode={props.mode ?? "banner"} />;
}

export function CapsuleStoreBannerCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="storeBanner" />;
}

export function CapsuleTileCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="tile" />;
}

export function CapsuleLogoCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="logo" />;
}

export function ProfileAvatarCustomizer(props: Omit<CapsuleCustomizerProps, "mode">) {
  return <CapsuleCustomizer {...props} mode="avatar" />;
}

export { CapsuleCustomizer };
export type { CapsuleCustomizerSaveResult, CapsuleCustomizerMode, CapsuleCustomizerProps };

