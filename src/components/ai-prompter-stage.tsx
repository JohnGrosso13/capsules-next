"use client";

import React from "react";

import styles from "./prompter/prompter.module.css";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { PrompterSuggestedActions } from "@/components/prompter/PrompterSuggestedActions";
import { PrompterToolbar } from "@/components/prompter/PrompterToolbar";
import { PrompterPreviewModal } from "@/components/prompter/PrompterPreviewModal";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { usePrompterStageController } from "@/components/prompter/hooks/usePrompterStageController";
import type { PrompterAction, PrompterChipOption } from "@/components/prompter/hooks/usePrompterStageController";

const cssClass = (...keys: Array<keyof typeof styles>): string =>
  keys
    .map((key) => styles[key] ?? "")
    .filter((value) => value.length > 0)
    .join(" ")
    .trim();

export type PrompterChip = string | PrompterChipOption;

type Props = {
  placeholder?: string;
  chips?: PrompterChip[];
  statusMessage?: string | null;
  onAction?: (action: PrompterAction) => void;
  onHandoff?: (handoff: PrompterHandoff) => void;
  variant?: "default" | "bannerCustomizer";
  showIntentMenu?: boolean;
  submitVariant?: "default" | "icon";
  surface?: string | null;
  showStatusRow?: boolean;
  showSuggestedActions?: boolean;
};

export type {
  PrompterAttachment,
  PrompterAction,
  PrompterChipOption,
} from "@/components/prompter/hooks/usePrompterStageController";

export function AiPrompterStage(props: Props) {
  const { showStatusRow = true, showSuggestedActions = true, ...rest } = props;
  const controller = usePrompterStageController(rest);
  const {
    chipOptions,
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
    manualPostMode,
    effectiveIntent,
    handleGenerate,
    handleSuggestedAction,
    suggestedTools,
    activeTool,
    applyManualIntent,
    buttonLabel,
    buttonDisabled,
    buttonVariant,
    composerLoading,
    composerLoadingProgress,
    hint,
    showHint,
    voiceSupported,
    voiceStatus,
    voiceButtonLabel,
    handleVoiceToggle,
    backgroundReadyNotice,
    backgroundReadyActive,
    composerOpen,
    resumeFromBackground,
    backgroundReminderVisible,
    backgroundPreference,
    dismissBackgroundReminder,
  } = controller;

  const noop = React.useCallback(() => {}, []);

  const allowIntentMenu =
    typeof props.showIntentMenu === "boolean" ? props.showIntentMenu : variantConfig.allowIntentMenu;
  const submitVariant = props.submitVariant ?? "default";
  const readyMode = Boolean(backgroundReadyActive && backgroundReadyNotice && !composerOpen);
  const [hideReminder, setHideReminder] = React.useState(false);
  React.useEffect(() => {
    if (!backgroundReminderVisible && hideReminder) {
      setHideReminder(false);
    }
  }, [backgroundReminderVisible, hideReminder]);
  const handleDismissReminder = React.useCallback(() => {
    dismissBackgroundReminder(hideReminder || !backgroundPreference.remindOnBackground);
    setHideReminder(false);
  }, [backgroundPreference.remindOnBackground, dismissBackgroundReminder, hideReminder]);
  const handleReadyResume = React.useCallback(() => {
    if (readyMode) {
      resumeFromBackground();
      return;
    }
    handleGenerate();
  }, [handleGenerate, readyMode, resumeFromBackground]);

  const buttonClassName =
    buttonVariant === "style" ? cssClass("genBtn", "genBtnStyle") : cssClass("genBtn");

  const handleEnterKey = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Enter") return;
      const isComposing =
        (event as unknown as { isComposing?: boolean }).isComposing ||
        (event.nativeEvent as { isComposing?: boolean })?.isComposing;
      if (isComposing) return;
      const hasModifier = event.altKey || event.ctrlKey || event.metaKey;
      const allowNewline = variantConfig.multilineInput && event.shiftKey;
      if (hasModifier || allowNewline) return;
      event.preventDefault();
      if (!buttonDisabled) {
        handleReadyResume();
      }
    },
    [buttonDisabled, handleReadyResume, variantConfig.multilineInput],
  );

  const resolvedShowHint = showStatusRow && showHint;

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
        {backgroundReminderVisible ? (
          <div className={styles.backgroundReminder} role="status" aria-live="polite">
            <div className={styles.backgroundReminderCopy}>
              <p className={styles.backgroundReminderTitle}>Running in the background</p>
              <p className={styles.backgroundReminderText}>
                We&apos;ll keep generating even if you close the composer.
              </p>
              <label className={styles.backgroundReminderCheckbox}>
                <input
                  type="checkbox"
                  checked={hideReminder || !backgroundPreference.remindOnBackground}
                  onChange={(event) => setHideReminder(event.target.checked)}
                />
                <span>Don&apos;t show again</span>
              </label>
            </div>
            <div className={styles.backgroundReminderActions}>
              <button
                type="button"
                className={styles.backgroundReminderButton}
                onClick={handleDismissReminder}
              >
                Got it
              </button>
            </div>
          </div>
        ) : null}
        <PrompterToolbar
          inputRef={textRef}
          text={text}
          placeholder={resolvedPlaceholder}
          onTextChange={setText}
          onKeyDown={handleEnterKey}
          buttonLabel={buttonLabel}
          buttonClassName={buttonClassName}
          buttonDisabled={buttonDisabled}
          onGenerate={handleReadyResume}
          dataIntent={String(effectiveIntent)}
          fileInputRef={fileInputRef}
          uploading={attachmentUploading}
          onAttachClick={handleAttachClick}
          onFileChange={handleAttachmentSelect}
          {...(attachmentsEnabled ? { onPaste: handlePasteAttachment } : {})}
          manualIntent={allowIntentMenu ? manualIntent : null}
          manualPostMode={allowIntentMenu ? manualPostMode : null}
          menuOpen={allowIntentMenu ? menuOpen : false}
          onToggleMenu={allowIntentMenu ? () => setMenuOpen((o) => !o) : noop}
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
          showHint={resolvedShowHint}
          showAttachmentStatus={attachmentsEnabled}
          composerLoading={composerLoading}
          composerLoadingProgress={composerLoadingProgress}
          showIntentMenu={allowIntentMenu}
          showVoiceButton={variantConfig.allowVoice}
          showAttachmentButton={attachmentsEnabled}
          multiline={variantConfig.multilineInput}
          showTools={variantConfig.allowTools}
          submitVariant={submitVariant}
        />

        <PrompterPreviewModal
          open={Boolean(preview)}
          url={preview?.url ?? null}
          mime={preview?.mime ?? null}
          name={preview?.name ?? null}
          onClose={closePreview}
        />

        {showSuggestedActions ? (
          <PrompterSuggestedActions actions={chipOptions} onSelect={handleSuggestedAction} />
        ) : null}
      </div>
    </section>
  );
}
