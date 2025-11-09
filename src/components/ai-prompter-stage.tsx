"use client";

import React from "react";

import styles from "./prompter/prompter.module.css";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { PrompterSuggestedActions } from "@/components/prompter/PrompterSuggestedActions";
import { PrompterToolbar } from "@/components/prompter/PrompterToolbar";
import { PrompterPreviewModal } from "@/components/prompter/PrompterPreviewModal";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { usePrompterStageController } from "@/components/prompter/hooks/usePrompterStageController";
import type { PrompterAction } from "@/components/prompter/hooks/usePrompterStageController";

const cssClass = (...keys: Array<keyof typeof styles>): string =>
  keys
    .map((key) => styles[key] ?? "")
    .filter((value) => value.length > 0)
    .join(" ")
    .trim();

type Props = {
  placeholder?: string;
  chips?: string[];
  statusMessage?: string | null;
  onAction?: (action: PrompterAction) => void;
  onHandoff?: (handoff: PrompterHandoff) => void;
  variant?: "default" | "bannerCustomizer";
};

export type { PrompterAttachment, PrompterAction } from "@/components/prompter/hooks/usePrompterStageController";

export function AiPrompterStage(props: Props) {
  const controller = usePrompterStageController(props);
  const {
    chips,
    variantConfig,
    resolvedPlaceholder,
    text,
    setText,
    menuOpen,
    setMenuOpen,
    menuRef,
    anchorRef,
    textRef,
    setManualTool,
    attachmentsEnabled,
    attachment,
    attachmentUploading,
    attachmentList,
    fileInputRef,
    handleAttachClick,
    handleAttachmentSelect,
    handlePasteAttachment,
    removeAttachment,
    handlePreviewAttachment,
    handleRetryAttachment,
    isDraggingFile,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    preview,
    closePreview,
    manualIntent,
    effectiveIntent,
    handleGenerate,
    handleSuggestedAction,
    suggestedTools,
    activeTool,
    applyManualIntent,
    buttonLabel,
    buttonDisabled,
    buttonVariant,
    hint,
    showHint,
    voiceSupported,
    voiceStatus,
    voiceButtonLabel,
    handleVoiceToggle,
  } = controller;

  const noop = React.useCallback(() => {}, []);

  const buttonClassName =
    buttonVariant === "style" ? cssClass("genBtn", "genBtnStyle") : cssClass("genBtn");

  return (
    <section
      className={styles.prompterStage}
      aria-label="AI Prompter"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-dropping={attachmentsEnabled && isDraggingFile ? "true" : undefined}
    >
      <div className={styles.prompter}>
        {attachmentsEnabled && isDraggingFile ? (
          <div className={styles.prompterDropOverlay} aria-hidden>
            <div className={styles.prompterDropCard}>
              <Plus size={28} weight="bold" className={styles.prompterDropIcon} />
              <span className={styles.prompterDropLabel}>Drop to attach</span>
            </div>
          </div>
        ) : null}
        <PrompterToolbar
          inputRef={textRef}
          text={text}
          placeholder={resolvedPlaceholder}
          onTextChange={setText}
          buttonLabel={buttonLabel}
          buttonClassName={buttonClassName}
          buttonDisabled={buttonDisabled}
          onGenerate={handleGenerate}
          dataIntent={String(effectiveIntent)}
          fileInputRef={fileInputRef}
          uploading={attachmentUploading}
          onAttachClick={handleAttachClick}
          onFileChange={handleAttachmentSelect}
          {...(attachmentsEnabled ? { onPaste: handlePasteAttachment } : {})}
          manualIntent={variantConfig.allowIntentMenu ? manualIntent : null}
          menuOpen={variantConfig.allowIntentMenu ? menuOpen : false}
          onToggleMenu={variantConfig.allowIntentMenu ? () => setMenuOpen((o) => !o) : noop}
          onSelectIntent={applyManualIntent}
          anchorRef={anchorRef}
          menuRef={menuRef}
          voiceSupported={voiceSupported}
          voiceStatus={voiceStatus}
          onVoiceToggle={handleVoiceToggle}
          voiceLabel={voiceButtonLabel}
          hint={hint}
          attachments={attachmentList}
          uploadingAttachment={attachmentUploading && attachment ? attachment : null}
          onRemoveAttachment={removeAttachment}
          {...(attachmentsEnabled ? { onRetryAttachment: handleRetryAttachment } : {})}
          {...(attachmentsEnabled ? { onPreviewAttachment: handlePreviewAttachment } : {})}
          suggestedTools={suggestedTools}
          activeTool={activeTool}
          onSelectTool={variantConfig.allowTools ? setManualTool : () => {}}
          onClearTool={variantConfig.allowTools ? () => setManualTool(null) : noop}
          showHint={showHint}
          showAttachmentStatus={attachmentsEnabled}
          showIntentMenu={variantConfig.allowIntentMenu}
          showVoiceButton={variantConfig.allowVoice}
          showAttachmentButton={attachmentsEnabled}
          multiline={variantConfig.multilineInput}
          showTools={variantConfig.allowTools}
        />

        <PrompterPreviewModal
          open={Boolean(preview)}
          url={preview?.url ?? null}
          mime={preview?.mime ?? null}
          name={preview?.name ?? null}
          onClose={closePreview}
        />

        <PrompterSuggestedActions actions={chips} onSelect={handleSuggestedAction} />
      </div>
    </section>
  );
}
