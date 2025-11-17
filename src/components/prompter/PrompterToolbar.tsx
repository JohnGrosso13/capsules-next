"use client";

import * as React from "react";
import styles from "./prompter.module.css";
import { Brain, Paperclip } from "@phosphor-icons/react/dist/ssr";
import type { PromptIntent } from "@/lib/ai/intent";
import type { RecognitionStatus } from "@/hooks/useSpeechRecognition";

import { PrompterInputBar } from "@/components/prompter/PrompterInputBar";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";
import type { PrompterToolKey } from "@/components/prompter/tools";

type SuggestedTool = {
  key: PrompterToolKey;
  label: string;
};

type Props = {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  text: string;
  placeholder: string;
  onTextChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  buttonLabel: string;
  buttonClassName: string;
  buttonDisabled: boolean;
  onGenerate: () => void;
  dataIntent: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  uploading: boolean;
  onAttachClick: () => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  manualIntent: PromptIntent | null;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onSelectIntent: (intent: PromptIntent | null) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  voiceSupported: boolean;
  voiceStatus: RecognitionStatus;
  onVoiceToggle: () => void;
  voiceLabel: string;
  hint: string | null;
  attachments: LocalAttachment[];
  uploadingAttachment?: LocalAttachment | null;
  onRemoveAttachment: (id: string) => void;
  onPreviewAttachment?: (id: string) => void;
  onRetryAttachment?: (attachment: LocalAttachment) => void;
  suggestedTools: SuggestedTool[];
  activeTool: PrompterToolKey | null;
  onSelectTool: (tool: PrompterToolKey) => void;
  onClearTool: () => void;
  showHint?: boolean;
  showAttachmentStatus?: boolean;
  showIntentMenu?: boolean;
  showVoiceButton?: boolean;
  showAttachmentButton?: boolean;
  composerLoading?: boolean;
  composerLoadingProgress?: number;
  multiline?: boolean;
  showTools?: boolean;
  submitVariant?: "default" | "icon";
};

export function PrompterToolbar({
  inputRef,
  text,
  placeholder,
  onTextChange,
  onKeyDown,
  onPaste,
  buttonLabel,
  buttonClassName,
  buttonDisabled,
  onGenerate,
  dataIntent,
  fileInputRef,
  uploading,
  onAttachClick,
  onFileChange,
  manualIntent,
  menuOpen,
  onToggleMenu,
  onSelectIntent,
  anchorRef,
  menuRef,
  voiceSupported,
  voiceStatus,
  onVoiceToggle,
  voiceLabel,
  hint,
  attachments,
  uploadingAttachment,
  onRemoveAttachment,
  onPreviewAttachment,
  onRetryAttachment,
  suggestedTools,
  activeTool,
  onSelectTool,
  onClearTool,
  showHint = true,
  showAttachmentStatus = true,
  showIntentMenu = true,
  showVoiceButton = true,
  showAttachmentButton = true,
  composerLoading = false,
  composerLoadingProgress = 0,
  multiline = false,
  showTools = true,
  submitVariant = "default",
}: Props) {
  const isVoiceActive = voiceStatus === "listening" || voiceStatus === "stopping";
  const brainProgress = Math.max(0, Math.min(100, Math.round(composerLoadingProgress || 0)));
  return (
    <>
      <PrompterInputBar
        inputRef={inputRef}
        value={text}
        placeholder={placeholder}
        onChange={onTextChange}
        {...(onKeyDown ? { onKeyDown } : {})}
        {...(onPaste ? { onPaste } : {})}
        buttonLabel={buttonLabel}
        buttonClassName={buttonClassName}
        buttonDisabled={buttonDisabled}
        onGenerate={onGenerate}
        dataIntent={dataIntent}
        fileInputRef={fileInputRef}
        uploading={uploading}
        onAttachClick={onAttachClick}
        onFileChange={onFileChange}
        manualIntent={manualIntent}
        menuOpen={menuOpen}
        onToggleMenu={onToggleMenu}
        onSelect={onSelectIntent}
        anchorRef={anchorRef}
        menuRef={menuRef}
        voiceSupported={voiceSupported}
        voiceStatus={voiceStatus}
        onVoiceToggle={onVoiceToggle}
        voiceLabel={voiceLabel}
        showAttachmentButton={showAttachmentButton}
        showVoiceButton={showVoiceButton}
        showIntentMenu={showIntentMenu}
        multiline={multiline}
        submitVariant={submitVariant}
      />

      <div className={styles.statusRow} role="status" aria-live="polite">
        {showHint && (hint || composerLoading) ? (
          <span
            className={styles.statusHint}
            data-active={uploading || isVoiceActive || (uploadingAttachment ? "true" : undefined)}
          >
            <span className={styles.statusLine}>
              {composerLoading ? (
                <span
                  className={styles.statusBrain}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={brainProgress}
                  aria-label="Generating your visual"
                >
                  <span className={styles.brainWrap}>
                    <Brain className={styles.brainBase} size={20} weight="duotone" />
                    <span
                      className={styles.brainFillClip}
                      style={{ height: `${Math.max(8, brainProgress)}%` }}
                    >
                      <Brain className={styles.brainFill} size={20} weight="fill" />
                    </span>
                  </span>
                </span>
              ) : (
                <span className={styles.statusDot} aria-hidden />
              )}
              <span className={styles.statusText}>{hint ?? "Working on it..."}</span>
            </span>
            {uploadingAttachment ? (
              <span className={styles.statusUploadExtras}>
                <span className={styles.progressTrack} aria-hidden>
                  <span
                    className={styles.progressBar}
                    style={{
                      width: `${Math.round(
                        Math.min(Math.max(uploadingAttachment.progress ?? 0, 0), 1) * 100,
                      )}%`,
                    }}
                  />
                </span>
                <button
                  type="button"
                  className={styles.attachmentActionButton}
                  onClick={() => onRemoveAttachment(uploadingAttachment.id)}
                  aria-label="Cancel upload"
                  title="Cancel upload"
                >
                  Cancel
                </button>
              </span>
            ) : null}
          </span>
        ) : (
          <span />
        )}

        {showAttachmentStatus ? (
          <div className={styles.attachmentStrip} aria-label="Attachments">
            {attachments.map((att) => (
              <span key={att.id} className={styles.attachmentCard} data-status={att.status}>
                {att.status === "uploading" ? (
                  <span className={styles.attachThumb} aria-hidden>
                    <span className={styles.brainWrap}>
                      <Brain className={styles.brainBase} size={20} weight="duotone" />
                      <span
                        className={styles.brainFillClip}
                        style={{ height: `${Math.round((att.progress || 0) * 100)}%` }}
                      >
                        <Brain className={styles.brainFill} size={20} weight="fill" />
                      </span>
                    </span>
                  </span>
                ) : att.url && att.status === "ready" ? (
                  <button
                    type="button"
                    className={styles.attachThumb}
                    onClick={() => onPreviewAttachment?.(att.id)}
                    aria-label={`Preview ${att.name}`}
                  >
                    {att.thumbUrl || att.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(att.thumbUrl ?? undefined) || undefined} alt="" className={styles.attachThumbImg} />
                    ) : (
                      <Paperclip className={styles.attachThumbIcon} size={18} weight="duotone" />
                    )}
                  </button>
                ) : (
                  <span className={styles.attachThumb} aria-hidden>
                    {att.thumbUrl || att.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={(att.thumbUrl ?? undefined) || undefined} alt="" className={styles.attachThumbImg} />
                    ) : (
                      <Paperclip className={styles.attachThumbIcon} size={18} weight="duotone" />
                    )}
                  </span>
                )}
                <span className={styles.attachMeta}>
                  {att.url && att.status === "ready" ? (
                    <button
                      type="button"
                      className={styles.attachmentName}
                      title={att.name}
                      onClick={() => onPreviewAttachment?.(att.id)}
                    >
                      {att.name}
                    </button>
                  ) : (
                    <span className={styles.attachmentName} title={att.name}>
                      {att.name}
                    </span>
                  )}
                  <span className={att.status === "error" ? styles.attachmentStatusError : styles.attachmentStatus}>
                    {(() => {
                      if (att.status === "error") {
                        return att.error ?? "Upload failed";
                      }
                      if (att.status === "uploading") {
                        if (att.phase === "finalizing") {
                          return "Finishing upload...";
                        }
                        const pct = Math.round(Math.min(Math.max(att.progress ?? 0, 0), 1) * 100);
                        return `Uploading ${pct}%`;
                      }
                      return "Attached";
                    })()}
                  </span>
                  {att.status === "error" ? (
                    <span className={styles.attachmentActions}>
                      {att.originalFile && onRetryAttachment ? (
                        <button
                          type="button"
                          className={styles.attachmentActionButton}
                          onClick={() => onRetryAttachment(att)}
                          aria-label={`Retry upload for ${att.name}`}
                          title="Retry upload"
                        >
                          Retry
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={styles.attachmentActionButton}
                        onClick={() => onRemoveAttachment(att.id)}
                        aria-label={`Remove ${att.name}`}
                        title="Remove attachment"
                      >
                        Remove
                      </button>
                    </span>
                  ) : null}
                  {att.status === "ready" ? (
                    <span className={styles.attachmentActions}>
                      <button
                        type="button"
                        className={styles.attachmentActionButton}
                        onClick={() => onRemoveAttachment(att.id)}
                        aria-label={`Remove ${att.name}`}
                        title="Remove attachment"
                      >
                        Remove
                      </button>
                    </span>
                  ) : null}
                  {att.status === "uploading" ? (
                    <span className={styles.progressTrack} aria-hidden>
                      <span
                        className={styles.progressBar}
                        style={{
                          width: `${Math.round(Math.min(Math.max(att.progress ?? 0, 0), 1) * 100)}%`,
                        }}
                      />
                    </span>
                  ) : null}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {showTools && suggestedTools.length ? (
        <div className={styles.chips}>
          {suggestedTools.map((tool) => (
            <button
              key={tool.key}
              className={styles.chip}
              type="button"
              onClick={() => onSelectTool(tool.key)}
              data-active={activeTool === tool.key || undefined}
              aria-pressed={activeTool === tool.key}
              title={tool.label}
            >
              {tool.label}
            </button>
          ))}
          {activeTool ? (
            <button
              type="button"
              className={styles.chip}
              onClick={onClearTool}
              aria-label="Clear tool override"
            >
              Clear tool
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
