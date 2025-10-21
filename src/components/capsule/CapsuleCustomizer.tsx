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
import { CapsuleBannerPreview } from "./CapsuleBannerPreview";
import { CapsuleAssetActions } from "./CapsuleAssetActions";
import { CapsuleMemoryPicker } from "./CapsuleMemoryPicker";

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


function CapsuleCustomizer(props: CapsuleCustomizerProps) {
  const state = useCapsuleCustomizerState(props);
  const {
    open,
    mode,
    promptChips,
    assetLabel,
    headerTitle,
    headerSubtitle,
    prompterPlaceholder,
    stageAriaLabel,
    footerDefaultHint,
    recentDescription,
    previewAlt,
    normalizedName,
    chat,
    memory,
    preview,
    uploads,
    save,
    handleClose,
    overlayClick,
    describeSelection,
  } = state;

  if (!open) return null;

  const { messages, busy, prompterSession, onPrompterAction, onBannerSelect, logRef } = chat;
  const saveLabel =
    mode === "tile"
      ? "Save tile"
      : mode === "logo"
        ? "Save logo"
        : mode === "avatar"
          ? "Save avatar"
          : mode === "storeBanner"
            ? "Save store banner"
            : "Save banner";

  return (
    <div className={styles.overlay} role="presentation" onClick={overlayClick}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capsule-customizer-heading"
      >
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id="capsule-customizer-heading">{headerTitle}</h2>
            <p>{headerSubtitle}</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label={`Close ${assetLabel} customizer`}
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
            <div className={styles.recentDescription}>{recentDescription}</div>
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
            <div ref={logRef} className={styles.chatLog} aria-live="polite">
              {messages.map((message) => (
                <ChatMessageBubble key={message.id} message={message} onBannerSelect={onBannerSelect} />
              ))}
              {busy ? (
                <div className={styles.chatTyping} aria-live="polite">
                  Capsule AI is thinking...
                </div>
              ) : null}
            </div>

            <div className={styles.prompterDock}>
              <div className={styles.prompterWrap}>
                <AiPrompterStage
                key={prompterSession}
                placeholder={prompterPlaceholder}
                chips={[]}
                statusMessage={null}
                onAction={onPrompterAction}
                variant="bannerCustomizer"
              />
              </div>

              <div className={styles.intentChips}>
                {promptChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={styles.intentChip}
                    onClick={() =>
                      onPrompterAction({
                        kind: "generate",
                        text: chip,
                        raw: chip,
                      })
                    }
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className={styles.previewColumn}>
            <div className={styles.previewPanel}>
              <CapsuleBannerPreview
                mode={mode}
                stageRef={preview.stageRef}
                imageRef={preview.imageRef}
                selectedBanner={preview.selected}
                previewOffset={preview.previewOffset}
                previewScale={preview.previewScale}
                previewAlt={previewAlt}
                normalizedName={normalizedName}
                isDragging={preview.isDragging}
                previewPannable={preview.previewPannable}
                stageAriaLabel={stageAriaLabel}
                onPointerDown={preview.onPointerDown}
                onImageLoad={preview.onImageLoad}
              />
              <CapsuleAssetActions
                onUploadClick={uploads.onUploadClick}
                onOpenMemoryPicker={memory.openPicker}
                fileInputRef={uploads.fileInputRef}
                memoryButtonRef={memory.buttonRef}
                onFileChange={uploads.onFileChange}
                memoryPickerOpen={memory.isPickerOpen}
              />
            </div>
          </section>
        </div>

        <CapsuleMemoryPicker
          open={memory.isPickerOpen}
          processedMemories={memory.processedMemories}
          selectedBanner={preview.selected}
          state={{ loading: memory.loading, error: memory.error, user: memory.user }}
          onClose={memory.closePicker}
          onQuickPick={memory.onQuickPick}
          onRefresh={memory.refresh}
          onPick={memory.onPickMemory}
        />

        <footer className={styles.footer}>
          <div className={styles.footerStatus} role="status">
            {save.error ? (
              <span className={styles.footerError}>{save.error}</span>
            ) : preview.selected ? (
              describeSelection(preview.selected)
            ) : (
              footerDefaultHint
            )}
          </div>
          <div className={styles.footerActions}>
            <Button variant="ghost" size="sm" onClick={handleClose}>
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




