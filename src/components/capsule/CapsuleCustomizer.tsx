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
  type CapsuleVariant,
} from "./hooks/useCapsuleCustomizerState";
import {
  CapsuleCustomizerProvider,
  useCapsuleCustomizerActions,
  useCapsuleCustomizerChat,
  useCapsuleCustomizerMemory,
  useCapsuleCustomizerMeta,
  useCapsuleCustomizerPreview,
  useCapsuleCustomizerSave,
  useCapsuleCustomizerVariants,
} from "./hooks/capsuleCustomizerContext";
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
  const variants = useCapsuleCustomizerVariants();

  const variantsSupported =
    meta.mode === "banner" ||
    meta.mode === "storeBanner" ||
    meta.mode === "logo" ||
    meta.mode === "avatar";

  const variantDescription =
    meta.mode === "avatar"
      ? "Swap between avatar takes or branch from an earlier edit."
      : meta.mode === "logo"
        ? "Compare logo explorations and revert to any saved version."
        : "Branch, compare, or roll back to earlier AI versions.";

  const truncate = React.useCallback((value: string, max = 72) => {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
  }, []);

  const humanize = React.useCallback((value: string) => {
    return value
      .split(/[\s_-]+/g)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, []);

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
          {variantsSupported ? (
            <div className={styles.variantSection} aria-labelledby="ai-versions-heading">
              <div className={styles.recentHeader}>
                <h3 id="ai-versions-heading">AI versions</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void variants.refresh();
                  }}
                  disabled={variants.loading}
                >
                  Refresh
                </Button>
              </div>
              <div className={styles.recentDescription}>{variantDescription}</div>
              <div className={styles.recentList} role="list">
                {variants.loading ? (
                  <p className={styles.recentHint}>Loading your saved versions…</p>
                ) : variants.error ? (
                  <p className={styles.recentHint}>{variants.error}</p>
                ) : variants.items.length ? (
                  variants.items.map((variant: CapsuleVariant) => {
                    const metadata = (variant.metadata ?? {}) as Record<string, unknown>;
                    const mode =
                      typeof metadata.mode === "string" && metadata.mode.trim().length
                        ? metadata.mode.trim().toLowerCase()
                        : "generate";
                    const stylePreset =
                      typeof metadata.stylePreset === "string" && metadata.stylePreset.trim().length
                        ? humanize(metadata.stylePreset.trim())
                        : null;
                    const providerRaw =
                      typeof metadata.provider === "string" && metadata.provider.trim().length
                        ? metadata.provider.trim().toLowerCase()
                        : null;
                    const provider =
                      providerRaw === "openai"
                        ? "OpenAI"
                        : providerRaw === "stability"
                          ? "Stability"
                          : providerRaw
                            ? humanize(providerRaw)
                            : null;
                    const resolvedPrompt =
                      typeof metadata.resolvedPrompt === "string" && metadata.resolvedPrompt.trim().length
                        ? metadata.resolvedPrompt.trim()
                        : null;
                    const userPrompt =
                      typeof metadata.userPrompt === "string" && metadata.userPrompt.trim().length
                        ? metadata.userPrompt.trim()
                        : null;
                    const snippetSource = resolvedPrompt || userPrompt || "";
                    const snippet = snippetSource.length ? `“${truncate(snippetSource, 68)}”` : null;
                    const detailParts = [
                      mode === "edit" ? "Edit" : "Generate",
                      stylePreset,
                      provider,
                    ].filter(Boolean) as string[];
                    const detail = detailParts.join(" • ");
                    const thumbUrl = variant.thumbUrl ?? variant.imageUrl;
                    const selected =
                      preview.selected?.kind === "memory" && preview.selected.id === variant.id;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        role="listitem"
                        className={styles.recentItem}
                        data-selected={selected ? "true" : undefined}
                        onClick={() => variants.select(variant)}
                        aria-label={`Switch to AI version ${variant.version}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl}
                          alt={`AI version ${variant.version}`}
                          className={styles.recentImage}
                          loading="lazy"
                        />
                        <div className={styles.recentMeta}>
                          <span className={styles.recentTitle}>{`Version ${variant.version}`}</span>
                          {detail ? <span className={styles.recentSubtle}>{detail}</span> : null}
                          {snippet ? <span className={styles.recentSubtle}>{snippet}</span> : null}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <p className={styles.recentHint}>
                    Versions appear here after you generate or edit with Capsule AI.
                  </p>
                )}
              </div>
            </div>
          ) : null}
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




