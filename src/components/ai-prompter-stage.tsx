"use client";

import React from "react";

import { intentLabel, type PromptIntent } from "@/lib/ai/intent";
import { navHint } from "@/lib/ai/nav";
import type { ComposerMode } from "@/lib/ai/nav";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";

import styles from "./prompter/prompter.module.css";
import { PrompterSuggestedActions } from "@/components/prompter/PrompterSuggestedActions";
import { PrompterToolbar } from "@/components/prompter/PrompterToolbar";
import { usePrompterVoice } from "@/components/prompter/usePrompterVoice";
import { detectSuggestedTools, type PrompterToolKey } from "@/components/prompter/tools";
import { PrompterPreviewModal } from "@/components/prompter/PrompterPreviewModal";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { usePrompterContext } from "@/components/prompter/hooks/usePrompterContext";
import { usePrompterIntent } from "@/components/prompter/hooks/usePrompterIntent";
import { usePrompterAttachments } from "@/components/prompter/hooks/usePrompterAttachments";
import { usePrompterActions } from "@/components/prompter/hooks/usePrompterActions";
import {
  DEFAULT_PROMPTER_PLACEHOLDER,
  DEFAULT_PROMPTER_CHIPS,
  truncatePrompterText,
} from "@/lib/prompter/actions";

const cssClass = (...keys: Array<keyof typeof styles>): string =>
  keys
    .map((key) => styles[key] ?? "")
    .filter((value) => value.length > 0)
    .join(" ")
    .trim();

export type PrompterAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null | undefined;
  storageKey?: string | null;
  sessionId?: string | null;
  role?: "reference" | "output";
  source?: "user" | "memory" | "upload" | "ai";
  excerpt?: string | null;
};

export type PrompterAction =
  | { kind: "post_manual"; content: string; raw: string; attachments?: PrompterAttachment[] }
  | {
      kind: "post_ai";
      prompt: string;
      mode: ComposerMode;
      raw: string;
      attachments?: PrompterAttachment[];
    }
  | { kind: "generate"; text: string; raw: string; attachments?: PrompterAttachment[] }
  | { kind: "style"; prompt: string; raw: string; attachments?: PrompterAttachment[] }
  | { kind: "tool_logo"; prompt: string; raw: string; attachments?: PrompterAttachment[] }
  | { kind: "tool_poll"; prompt: string; raw: string; attachments?: PrompterAttachment[] }
  | { kind: "tool_image_edit"; prompt: string; raw: string; attachments?: PrompterAttachment[] };

type Props = {
  placeholder?: string;
  chips?: string[];
  statusMessage?: string | null;
  onAction?: (action: PrompterAction) => void;
  onHandoff?: (handoff: PrompterHandoff) => void;
  variant?: "default" | "bannerCustomizer";
};

// Attachment upload behavior extracted to hook

export function AiPrompterStage({
  placeholder = DEFAULT_PROMPTER_PLACEHOLDER,
  chips = DEFAULT_PROMPTER_CHIPS,
  statusMessage = null,
  onAction,
  onHandoff,
  variant = "default",
}: Props) {
  const {
    composerContext,
    activeCapsuleId,
    userEnvelope,
    variantConfig,
    resolvedPlaceholder,
    localStatus,
    showLocalStatus,
  } = usePrompterContext(placeholder, variant);

  const noop = React.useCallback(() => {}, []);
  const noopSelectTool = React.useCallback((_tool: PrompterToolKey) => {}, []);

  const [text, setText] = React.useState("");
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const textRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [manualTool, setManualTool] = React.useState<PrompterToolKey | null>(null);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);

  const attachments = usePrompterAttachments({
    enabled: variantConfig.allowAttachments,
    capsuleId: activeCapsuleId,
    enableDragAndDrop: variantConfig.enableDragAndDrop,
  });

  const {
    attachmentsEnabled,
    attachment,
    readyAttachment,
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
    clearAllAttachments,
    preview,
    closePreview,
    hasReadyAttachment,
  } = attachments;

  const trimmed = text.trim();
  const hasAttachment = attachmentsEnabled && hasReadyAttachment;
  const attachmentMime = hasAttachment ? readyAttachment?.mimeType ?? null : null;

  const {
    autoIntent,
    manualIntent,
    setManualIntent,
    navTarget,
    postPlan,
    effectiveIntent,
    buttonBusy,
  } = usePrompterIntent({
    text,
    allowNavigation: variantConfig.allowNavigation,
    forceIntent: variantConfig.forceIntent,
    hasAttachment,
  });

  React.useEffect(() => {
    if (!variantConfig.allowIntentMenu && manualIntent !== null) {
      setManualIntent(null);
    }
  }, [variantConfig.allowIntentMenu, manualIntent, setManualIntent]);

  React.useEffect(() => {
    if (!variantConfig.allowTools && manualTool !== null) {
      setManualTool(null);
    }
  }, [variantConfig.allowTools, manualTool]);

  React.useEffect(() => {
    if (!variantConfig.allowIntentMenu && menuOpen) {
      setMenuOpen(false);
    }
  }, [variantConfig.allowIntentMenu, menuOpen]);

  const saveVoiceTranscript = React.useCallback(
    async (textValue: string) => {
      if (!textValue || !userEnvelope) return;
      try {
        const language =
          typeof window !== "undefined" && typeof window.navigator?.language === "string"
            ? window.navigator.language
            : null;
        await fetch("/api/memory/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            text: textValue,
            language,
            capsuleId: activeCapsuleId,
            user: userEnvelope,
          }),
        });
      } catch (error) {
        console.error("Voice transcript memory error", error);
      }
    },
    [activeCapsuleId, userEnvelope],
  );

  React.useEffect(() => {
    if (!variantConfig.multilineInput) return;
    const element = textRef.current;
    if (element instanceof HTMLTextAreaElement) {
      element.style.height = "auto";
      const minHeight = 56;
      const maxHeight = 220;
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, element.scrollHeight));
      element.style.height = `${nextHeight}px`;
    }
  }, [variantConfig.multilineInput, trimmed]);

  const suggestedTools = React.useMemo(
    () =>
      variantConfig.allowTools
        ? detectSuggestedTools(trimmed, { hasAttachment, attachmentMime }).filter((s) =>
            // Limit to currently enabled tools
            ["poll", "logo", "image_edit"].includes(s.key),
          )
        : [],
    [trimmed, hasAttachment, attachmentMime, variantConfig.allowTools],
  );
  const activeTool = variantConfig.allowTools ? manualTool : null;

  const navigateReady = effectiveIntent === "navigate" && navTarget !== null;

  const buttonLabel =
    variantConfig.forceButtonLabel ??
    (navigateReady
      ? "Go"
      : postPlan.mode === "manual"
        ? "Post"
        : postPlan.mode === "ai"
          ? "Draft"
          : buttonBusy
            ? "Analyzing..."
            : intentLabel(effectiveIntent));

  const buttonClassName: string =
    effectiveIntent === "style" ? cssClass("genBtn", "genBtnStyle") : cssClass("genBtn");

  const buttonDisabled =
    attachmentUploading ||
    (!hasAttachment && trimmed.length === 0) ||
    (effectiveIntent === "navigate" && !navTarget) ||
    (postPlan.mode === "manual" && (!postPlan.content || !postPlan.content.trim()));

  const { handleGenerate, handleSuggestedAction } = usePrompterActions({
    text,
    textRef,
    setText,
    setManualIntent,
    manualTool,
    suggestedTools,
    variantConfig,
    navTarget,
    postPlan,
    effectiveIntent,
    closeMenu,
    ...(onAction ? { onAction } : {}),
    ...(onHandoff ? { onHandoff } : {}),
    showLocalStatus,
    attachmentState: {
      attachmentList,
      readyAttachment,
      attachmentUploading,
      clearAllAttachments,
    },
  });

  React.useEffect(() => {
    if (!variantConfig.allowIntentMenu || !menuOpen) return;

    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      const insideAnchor = anchorRef.current?.contains(target) ?? false;
      const insideMenu = menuRef.current?.contains(target) ?? false;
      if (!insideAnchor && !insideMenu) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen, variantConfig.allowIntentMenu]);

  // Attachment handlers provided by hook

  const voiceControls = usePrompterVoice({
    currentText: trimmed,
    buttonBusy,
    onTranscript: setText,
    onSubmit: handleGenerate,
    onSaveTranscript: saveVoiceTranscript,
    closeMenu,
  });

  const voiceSupported = variantConfig.allowVoice ? voiceControls.voiceSupported : false;
  const voiceStatus = variantConfig.allowVoice ? voiceControls.voiceStatus : "idle";
  const voiceStatusMessage = variantConfig.allowVoice ? voiceControls.voiceStatusMessage : null;
  const voiceButtonLabel = variantConfig.allowVoice
    ? voiceControls.voiceButtonLabel
    : "Voice input unavailable";
  const handleVoiceToggle = variantConfig.allowVoice ? voiceControls.handleVoiceToggle : noop;

  function applyManualIntent(intent: PromptIntent | null) {
    if (!variantConfig.allowIntentMenu) return;
    setManualIntent(intent);
    closeMenu();
  }

  const manualNote = manualIntent
    ? manualIntent === "navigate"
      ? "Intent override: Go"
      : manualIntent === "post"
        ? "Intent override: Post"
        : manualIntent === "style"
          ? "Intent override: Style"
          : "Manual override active"
    : null;

  const navMessage = navHint(navigateReady ? navTarget : null);
  const postHint =
    postPlan.mode === "manual"
      ? postPlan.content
        ? `Ready to post: "${truncatePrompterText(postPlan.content, 50)}"`
        : "Add what you'd like to share."
      : postPlan.mode === "ai"
        ? "AI will draft this for you."
        : null;
  const styleHint = effectiveIntent === "style" ? "AI Styler is ready." : null;

  const uploadingHint = React.useMemo(() => {
    if (!attachmentUploading || !attachment) return null;
    const percent = Number.isFinite(attachment.progress)
      ? Math.round(Math.min(Math.max(attachment.progress, 0), 1) * 100)
      : null;
    const safeName = truncatePrompterText(attachment.name || "attachment", 36);
    if (attachment.phase === "finalizing") {
      return `Finishing upload "${safeName}"...`;
    }
    const progressLabel = percent !== null ? ` (${percent}%)` : "";
    return `Uploading ${safeName}${progressLabel}`;
  }, [attachmentUploading, attachment]);

  const [uploadCompleteHint, setUploadCompleteHint] = React.useState<string | null>(null);
  const lastCompletedIdRef = React.useRef<string | null>(null);
  const uploadCompleteTimerRef = React.useRef<number | null>(null);

  const clearUploadCompleteTimer = React.useCallback(() => {
    if (uploadCompleteTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(uploadCompleteTimerRef.current);
      uploadCompleteTimerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!attachmentsEnabled) return undefined;
    if (!attachment) {
      clearUploadCompleteTimer();
      setUploadCompleteHint(null);
      lastCompletedIdRef.current = null;
      return undefined;
    }

    if (attachment.status === "uploading") {
      clearUploadCompleteTimer();
      setUploadCompleteHint(null);
      return undefined;
    }

    if (attachment.status === "ready" && attachment.id && attachment.id !== lastCompletedIdRef.current) {
      lastCompletedIdRef.current = attachment.id;
      setUploadCompleteHint("Upload complete.");
      if (typeof window !== "undefined") {
        clearUploadCompleteTimer();
        uploadCompleteTimerRef.current = window.setTimeout(() => {
          setUploadCompleteHint(null);
          uploadCompleteTimerRef.current = null;
        }, 1800);
      }
      return undefined;
    }

    if (attachment.status === "error") {
      clearUploadCompleteTimer();
      setUploadCompleteHint(null);
    }

    return undefined;
  }, [attachment, attachmentsEnabled, clearUploadCompleteTimer]);

  React.useEffect(
    () => () => {
      clearUploadCompleteTimer();
    },
    [clearUploadCompleteTimer],
  );

  const rawHint =
    localStatus ??
    statusMessage ??
    uploadingHint ??
    uploadCompleteHint ??
    (variantConfig.allowVoice ? voiceStatusMessage : null) ??
    (variantConfig.allowIntentHints
      ? manualNote ??
        navMessage ??
        postHint ??
        styleHint ??
        (attachment?.status === "error" ? attachment.error : null) ??
        (buttonBusy ? "Analyzing intent..." : autoIntent.reason ?? null)
      : null);

  function humanizeHint(input: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (trimmed === "Defaulting to post intent.") return "Ready when you are.";
    return trimmed;
  }

  const aiBusy = Boolean(composerContext.state?.loading);
  const crumbHint = aiBusy && attachmentUploading ? "Scanning attachments..." : null;

  const hint = humanizeHint(crumbHint ?? rawHint);
  const showHint =
    Boolean(hint) &&
    (variantConfig.allowIntentHints ||
      Boolean(statusMessage) ||
      Boolean(localStatus) ||
      attachmentUploading ||
      Boolean(uploadCompleteHint) ||
      attachment?.status === "error");

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
          onSelectTool={variantConfig.allowTools ? setManualTool : noopSelectTool}
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




