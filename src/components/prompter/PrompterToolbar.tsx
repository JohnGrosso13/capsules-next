"use client";

import * as React from "react";
import styles from "@/components/home.module.css";
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
  attachment: LocalAttachment | null;
  onClearAttachment: () => void;
  suggestedTools: SuggestedTool[];
  activeTool: PrompterToolKey | null;
  onSelectTool: (tool: PrompterToolKey) => void;
  onClearTool: () => void;
  showHint?: boolean;
  showAttachmentStatus?: boolean;
  showIntentMenu?: boolean;
  showVoiceButton?: boolean;
  showAttachmentButton?: boolean;
  multiline?: boolean;
  showTools?: boolean;
};

export function PrompterToolbar({
  inputRef,
  text,
  placeholder,
  onTextChange,
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
  attachment,
  onClearAttachment,
  suggestedTools,
  activeTool,
  onSelectTool,
  onClearTool,
  showHint = true,
  showAttachmentStatus = true,
  showIntentMenu = true,
  showVoiceButton = true,
  showAttachmentButton = true,
  multiline = false,
  showTools = true,
}: Props) {
  return (
    <>
      <PrompterInputBar
        inputRef={inputRef}
        value={text}
        placeholder={placeholder}
        onChange={onTextChange}
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
      />

      <div className={styles.intentControls}>
        {showHint && hint ? <span className={styles.intentHint}>{hint}</span> : null}
        {showAttachmentStatus && attachment ? (
          <span className={styles.attachmentChip} data-status={attachment.status}>
            <span className={styles.attachmentName}>{attachment.name}</span>
            {attachment.status === "uploading" ? (
              <span className={styles.attachmentStatus}>Uploading...</span>
            ) : attachment.status === "error" ? (
              <span className={styles.attachmentStatusError}>
                {attachment.error ?? "Upload failed"}
              </span>
            ) : (
              <span className={styles.attachmentStatus}>Attached</span>
            )}
            <button
              type="button"
              className={styles.attachmentRemove}
              onClick={onClearAttachment}
              aria-label="Remove attachment"
            >
              x
            </button>
          </span>
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
