"use client";

import * as React from "react";

import { intentLabel, type PromptIntent } from "@/lib/ai/intent";
import { navHint } from "@/lib/ai/nav";
import type { ComposerMode } from "@/lib/ai/nav";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { detectSuggestedTools, type PrompterToolKey } from "@/components/prompter/tools";
import {
  DEFAULT_PROMPTER_PLACEHOLDER,
  DEFAULT_PROMPTER_CHIPS,
  truncatePrompterText,
} from "@/lib/prompter/actions";
import { usePrompterContext } from "./usePrompterContext";
import { usePrompterIntent } from "./usePrompterIntent";
import { usePrompterAttachments } from "./usePrompterAttachments";
import { usePrompterActions } from "./usePrompterActions";
import { usePrompterVoice } from "../usePrompterVoice";

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
export type PrompterChipOption = { label: string; value: string };
type PrompterChip = string | PrompterChipOption;

type UsePrompterStageControllerProps = {
  placeholder?: string;
  chips?: PrompterChip[];
  statusMessage?: string | null;
  onAction?: (action: PrompterAction) => void;
  onHandoff?: (handoff: PrompterHandoff) => void;
  variant?: "default" | "bannerCustomizer";
};

export function usePrompterStageController({
  placeholder = DEFAULT_PROMPTER_PLACEHOLDER,
  chips = DEFAULT_PROMPTER_CHIPS,
  statusMessage = null,
  onAction,
  onHandoff,
  variant = "default",
}: UsePrompterStageControllerProps) {
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

  const buttonDisabled =
    attachmentUploading ||
    (!hasAttachment && trimmed.length === 0) ||
    (effectiveIntent === "navigate" && !navTarget) ||
    (postPlan.mode === "manual" && (!postPlan.content || !postPlan.content.trim()));

  const buttonVariant = effectiveIntent === "style" ? "style" : "default";

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

  const applyManualIntent = (intent: PromptIntent | null) => {
    if (!variantConfig.allowIntentMenu) return;
    setManualIntent(intent);
    closeMenu();
  };

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

  const humanizeHint = (input: string | null): string | null => {
    if (!input) return null;
    const trimmedHint = input.trim();
    if (!trimmedHint) return null;
    if (trimmedHint === "Defaulting to post intent.") return "Ready when you are.";
    return trimmedHint;
  };

  const hint = humanizeHint(rawHint);
  const showHint =
    Boolean(hint) &&
    (variantConfig.allowIntentHints ||
      Boolean(statusMessage) ||
      Boolean(localStatus) ||
      attachmentUploading ||
      Boolean(uploadCompleteHint) ||
      attachment?.status === "error");

  const chipOptions = React.useMemo<PrompterChipOption[]>(
    () =>
      chips.map((chip) =>
        typeof chip === "string"
          ? {
              label: chip,
              value: chip,
            }
          : chip,
      ),
    [chips],
  );

  return {
    composerContext,
    activeCapsuleId,
    variantConfig,
    resolvedPlaceholder,
    localStatus,
    showLocalStatus,
    chipOptions,
    statusMessage,
    text,
    setText,
    menuOpen,
    setMenuOpen,
    menuRef,
    anchorRef,
    textRef,
    manualTool,
    setManualTool,
    closeMenu,
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
    trimmed,
    attachmentMime,
    autoIntent,
    manualIntent,
    setManualIntent,
    navTarget,
    postPlan,
    effectiveIntent,
    buttonBusy,
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
    uploadingHint,
    uploadCompleteHint,
    manualNote,
    navMessage,
    postHint,
    styleHint,
    voiceControls,
    voiceSupported,
    voiceStatus,
    voiceStatusMessage,
    voiceButtonLabel,
    handleVoiceToggle,
  };
}
