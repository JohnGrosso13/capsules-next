"use client";

import React from "react";
import { useRouter } from "next/navigation";

import {
  detectIntentHeuristically,
  intentLabel,
  normalizeIntent,
  type IntentResolution,
  type PromptIntent,
} from "@/lib/ai/intent";
import { setTheme } from "@/lib/theme";
import { detectComposerMode, resolveNavigationTarget, navHint } from "@/lib/ai/nav";
import type { ComposerMode } from "@/lib/ai/nav";

import styles from "./prompter/prompter.module.css";
import { PrompterSuggestedActions } from "@/components/prompter/PrompterSuggestedActions";
import { PrompterToolbar } from "@/components/prompter/PrompterToolbar";
import { usePrompterDragAndDrop } from "@/components/prompter/usePrompterDragAndDrop";
import { usePrompterVoice } from "@/components/prompter/usePrompterVoice";
import { detectSuggestedTools, type PrompterToolKey } from "@/components/prompter/tools";
import { Paperclip } from "@phosphor-icons/react/dist/ssr";

const cssClass = (...keys: Array<keyof typeof styles>): string =>
  keys
    .map((key) => styles[key] ?? "")
    .filter((value) => value.length > 0)
    .join(" ")
    .trim();

const defaultChips = [
  "Post an update",
  "Share a photo",
  "Bring feed image",
  "Summarize my feed",
  "Style my capsule",
];

const DEFAULT_PLACEHOLDER = "Ask your Capsule AI to create anything...";
const COMPACT_PLACEHOLDER = "Ask Capsule AI for ideas...";
const COMPACT_VIEWPORT_QUERY = "(max-width: 480px)";

import { useComposer } from "@/components/composer/ComposerProvider";
import { useAttachmentUpload, type LocalAttachment } from "@/hooks/useAttachmentUpload";
import { useCurrentUser } from "@/services/auth/client";
import { buildMemoryEnvelope } from "@/lib/memory/envelope";
import { intentResponseSchema } from "@/shared/schemas/ai";
import { extractFileFromDataTransfer } from "@/lib/clipboard/files";
import { PrompterPreviewModal } from "@/components/prompter/PrompterPreviewModal";

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
  variant?: "default" | "bannerCustomizer";
};

type PostPlan =
  | { mode: "none" }
  | { mode: "manual"; content: string }
  | { mode: "ai"; composeMode: ComposerMode };

type VariantConfig = {
  allowAttachments: boolean;
  allowVoice: boolean;
  allowIntentMenu: boolean;
  allowIntentHints: boolean;
  allowTools: boolean;
  allowNavigation: boolean;
  enableDragAndDrop: boolean;
  multilineInput: boolean;
  forceIntent: PromptIntent | null;
  forceButtonLabel: string | null;
};

// Attachment upload behavior extracted to hook

const HEURISTIC_CONFIDENCE_THRESHOLD = 0.6;

function resolvePostPlan(text: string): PostPlan {
  const trimmed = text.trim();
  if (!trimmed) return { mode: "none" };
  const lower = trimmed.toLowerCase();

  if (
    /(make|draft|write|craft|compose|generate|build)\s+(me\s+)?(a\s+)?(social\s+)?post/.test(lower)
  ) {
    return { mode: "ai", composeMode: detectComposerMode(lower) };
  }

  const manualColonMatch = trimmed.match(/^post\s*[:\-]\s*(.+)$/i)?.[1]?.trim();
  if (manualColonMatch) {
    return { mode: "manual", content: manualColonMatch };
  }

  const manualSimpleMatch = trimmed.match(/^post\s+(?!me\s+a\s+post)(.+)$/i)?.[1]?.trim();
  if (manualSimpleMatch) {
    return { mode: "manual", content: manualSimpleMatch };
  }

  const shorthandMatch = trimmed.match(/^p:\s*(.+)$/i)?.[1]?.trim();
  if (shorthandMatch) {
    return { mode: "manual", content: shorthandMatch };
  }

  return { mode: "none" };
}

function truncate(text: string, length = 80): string {
  if (text.length <= length) return text;
  return `${text.slice(0, length - 1)}...`;
}

export function AiPrompterStage({
  placeholder = DEFAULT_PLACEHOLDER,
  chips = defaultChips,
  statusMessage = null,
  onAction,
  variant = "default",
}: Props) {
  const router = useRouter();
  const composerContext = useComposer();
  const activeCapsuleId = composerContext.activeCapsuleId;

  const { user: authUser } = useCurrentUser();
  const userEnvelope = React.useMemo(() => buildMemoryEnvelope(authUser), [authUser]);

  const variantConfig = React.useMemo<VariantConfig>(() => {
    if (variant === "bannerCustomizer") {
      return {
        allowAttachments: true,
        allowVoice: true,
        allowIntentMenu: false,
        allowIntentHints: false,
        allowTools: false,
        allowNavigation: false,
        enableDragAndDrop: true,
        multilineInput: false,
        forceIntent: "generate",
        forceButtonLabel: "Generate",
      };
    }
    return {
      allowAttachments: true,
      allowVoice: true,
      allowIntentMenu: true,
      allowIntentHints: true,
      allowTools: true,
      allowNavigation: true,
      enableDragAndDrop: true,
      multilineInput: false,
      forceIntent: null,
      forceButtonLabel: null,
    };
  }, [variant]);

  const noop = React.useCallback(() => {}, []);
  const noopSelectTool = React.useCallback((_tool: PrompterToolKey) => {}, []);

  const [text, setText] = React.useState("");
  const [autoIntent, setAutoIntent] = React.useState<IntentResolution>(() =>
    detectIntentHeuristically(""),
  );
  const [manualIntent, setManualIntent] = React.useState<PromptIntent | null>(null);
  const [isResolving, setIsResolving] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const anchorRef = React.useRef<HTMLButtonElement | null>(null);
  const requestRef = React.useRef(0);
  const textRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [manualTool, setManualTool] = React.useState<PrompterToolKey | null>(null);
  const closeMenu = React.useCallback(() => setMenuOpen(false), []);
  const [isCompactViewport, setIsCompactViewport] = React.useState(false);
  // Multi-attachment: maintain a list separate from the active upload
  const [attachmentList, setAttachmentList] = React.useState<
    Array<ReturnType<typeof useAttachmentUpload>["attachment"]>
  >([]);
  const [preview, setPreview] = React.useState<{ url: string; mime: string; name: string } | null>(
    null,
  );

  React.useEffect(() => {
    if (!variantConfig.allowIntentMenu && manualIntent !== null) {
      setManualIntent(null);
    }
  }, [variantConfig.allowIntentMenu, manualIntent]);

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

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia(COMPACT_VIEWPORT_QUERY);

    const updateViewportMatch = () => setIsCompactViewport(media.matches);
    updateViewportMatch();

    const handleChange = (event: MediaQueryListEvent) => setIsCompactViewport(event.matches);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    if (typeof media.addListener === "function") {
      media.addListener(handleChange);
      return () => media.removeListener(handleChange);
    }

    return undefined;
  }, []);

  const {
    fileInputRef,
    attachment: rawAttachment,
    readyAttachment: rawReadyAttachment,
    uploading: rawAttachmentUploading,
    clearAttachment,
    handleAttachClick,
    handleAttachmentSelect,
    handleAttachmentFile,
  } = useAttachmentUpload(undefined, {
    metadata: () => (activeCapsuleId ? { capsule_id: activeCapsuleId } : null),
  });

  const { isDraggingFile, handleDragEnter, handleDragOver, handleDragLeave, handleDrop } =
    usePrompterDragAndDrop({
      onFile: handleAttachmentFile,
      enabled: variantConfig.allowAttachments && variantConfig.enableDragAndDrop,
    });

  const attachmentsEnabled = variantConfig.allowAttachments;
  const readyAttachment = attachmentsEnabled ? rawReadyAttachment : null;
  const attachment = attachmentsEnabled ? rawAttachment : null;
  const attachmentUploading = attachmentsEnabled ? rawAttachmentUploading : false;
  const handleAttachClickSafe = attachmentsEnabled ? handleAttachClick : noop;
  const handleAttachmentSelectSafe = attachmentsEnabled ? handleAttachmentSelect : noop;
  const handlePasteAttachment = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!attachmentsEnabled) return;
      const file = extractFileFromDataTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void handleAttachmentFile(file);
    },
    [attachmentsEnabled, handleAttachmentFile],
  );

  // When a single upload reaches a terminal state, merge into the list
  React.useEffect(() => {
    if (!attachmentsEnabled) return;
    if (!attachment) return;
    if (attachment.status !== "ready" && attachment.status !== "error") return;
    setAttachmentList((prev) => {
      const exists = prev.find((a) => a?.id === attachment.id);
      return exists ? prev.map((a) => (a?.id === attachment.id ? attachment : a)) : [...prev, attachment];
    });
  }, [attachmentsEnabled, attachment]);

  const removeAttachment = React.useCallback(
    (id: string) => {
      if (attachment?.id === id) clearAttachment();
      setAttachmentList((prev) => prev.filter((a) => a?.id !== id));
    },
    [attachment?.id, clearAttachment],
  );

  const handleRetryAttachment = React.useCallback(
    (target: LocalAttachment) => {
      if (!target?.id || !target.originalFile) return;
      removeAttachment(target.id);
      void handleAttachmentFile(target.originalFile);
    },
    [handleAttachmentFile, removeAttachment],
  );

  const handlePreviewAttachment = React.useCallback(
    (id: string) => {
      const att = (attachmentList || []).find((a) => a?.id === id) ?? (attachment?.id === id ? attachment : null);
      if (!att || att.status !== "ready" || !att.url) return;
      setPreview({ url: att.url, mime: att.mimeType, name: att.name });
    },
    [attachmentList, attachment],
  );

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
            user: userEnvelope,
          }),
        });
      } catch (error) {
        console.error("Voice transcript memory error", error);
      }
    },
    [userEnvelope],
  );

  const resolvedPlaceholder =
    placeholder === DEFAULT_PLACEHOLDER && isCompactViewport ? COMPACT_PLACEHOLDER : placeholder;

  const trimmed = text.trim();
  const hasAttachment = attachmentsEnabled && Boolean(readyAttachment);
  const attachmentMime = hasAttachment ? readyAttachment?.mimeType ?? null : null;
  // Determine base intent without considering manual override
  const baseIntent = hasAttachment && trimmed.length === 0 ? "post" : autoIntent.intent;
  const navTarget = React.useMemo(
    () => (variantConfig.allowNavigation ? resolveNavigationTarget(trimmed) : null),
    [trimmed, variantConfig.allowNavigation],
  );
  const postPlan = React.useMemo(() => resolvePostPlan(trimmed), [trimmed]);
  // Manual override takes precedence over heuristics/AI.
  const computedIntent: PromptIntent =
    manualIntent ?? (navTarget ? "navigate" : postPlan.mode !== "none" ? "post" : baseIntent);
  const effectiveIntent: PromptIntent = variantConfig.forceIntent ?? computedIntent;

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

  const buttonBusy = isResolving && manualIntent === null;
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

  React.useEffect(() => {
    if (variantConfig.forceIntent) {
      setAutoIntent(detectIntentHeuristically(trimmed));
      setIsResolving(false);
      return;
    }

    const currentText = trimmed;
    if (!currentText) {
      setAutoIntent(detectIntentHeuristically(""));
      setIsResolving(false);
      return;
    }

    const heuristic = detectIntentHeuristically(currentText);
    setAutoIntent(heuristic);

    if (heuristic.intent !== "generate" && heuristic.confidence >= HEURISTIC_CONFIDENCE_THRESHOLD) {
      setIsResolving(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestRef.current;

    const timeout = setTimeout(() => {
      setIsResolving(true);
      fetch("/api/ai/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentText }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return null;
          const raw = await res.json().catch(() => null);
          const parsed = intentResponseSchema.safeParse(raw);
          return parsed.success ? parsed.data : null;
        })
        .then((data) => {
          if (!data || requestRef.current !== requestId) return;
          const intent = normalizeIntent(data.intent);
          const resolvedConfidence =
            typeof data?.confidence === "number"
              ? Math.max(0, Math.min(1, data.confidence))
              : heuristic.confidence;
          const resolvedReason =
            typeof data?.reason === "string" && data.reason.length ? data.reason : heuristic.reason;
          setAutoIntent({
            intent,
            confidence: resolvedConfidence,
            ...(resolvedReason ? { reason: resolvedReason } : {}),
            source: data?.source === "ai" ? "ai" : heuristic.source,
          });
        })
        .catch((error) => {
          if ((error as Error)?.name !== "AbortError") {
            console.error("Intent detection error", error);
          }
        })
        .finally(() => {
          if (requestRef.current === requestId) {
            setIsResolving(false);
          }
        });
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [trimmed, variantConfig.forceIntent]);

  // Attachment handlers provided by hook

  const handleGenerate = React.useCallback(() => {
    if (attachmentUploading) return;

    const listReady = (attachmentList || []).filter((a) => a && a.status === "ready");
    const includeActiveReady =
      readyAttachment && readyAttachment.url && !listReady.find((a) => a?.id === readyAttachment.id)
        ? [readyAttachment]
        : [];
    const allReady = [...listReady, ...includeActiveReady];
    const readyAttachments: PrompterAttachment[] | null = allReady.length
      ? allReady.map((att) => ({
          id: att!.id,
          name: att!.name,
          mimeType: att!.mimeType,
          size: att!.size,
          url: att!.url!,
          thumbnailUrl: att!.thumbUrl ?? undefined,
          storageKey: att!.key ?? null,
          sessionId: att!.sessionId ?? null,
          role: att!.role ?? "reference",
          source: att!.source ?? "upload",
        }))
      : null;
    const hasAttachmentPayload = Boolean(readyAttachments?.length);
    const emitAction = (action: PrompterAction) => {
      if (!onAction) return;
      if (readyAttachments && readyAttachments.length) {
        onAction({ ...action, attachments: readyAttachments });
      } else {
        onAction(action);
      }
    };
    const value = trimmed;
    const hasValue = value.length > 0;

    if (!hasValue && !hasAttachmentPayload) {
      textRef.current?.focus();
      return;
    }

    const resetAfterSubmit = () => {
      setText("");
      setManualIntent(null);
      closeMenu();
      clearAttachment();
      setAttachmentList([]);
      textRef.current?.focus();
    };

    if (effectiveIntent === "navigate") {
      if (!navTarget) return;
      if (navTarget.kind === "route") {
        router.push(navTarget.path);
      } else {
        setTheme(navTarget.value);
      }
      resetAfterSubmit();
      return;
    }

    // Tool routing
    const selectedTool: PrompterToolKey | null = variantConfig.allowTools
      ? manualTool ?? suggestedTools[0]?.key ?? null
      : null;

    if (selectedTool === "poll") {
      emitAction({
        kind: "post_ai",
        prompt: value,
        mode: "poll",
        raw: value,
      });
      resetAfterSubmit();
      return;
    }

    if (selectedTool === "logo") {
      emitAction({ kind: "tool_logo", prompt: value, raw: value });
      resetAfterSubmit();
      return;
    }

    if (selectedTool === "image_edit") {
      if (hasAttachmentPayload) {
        emitAction({ kind: "tool_image_edit", prompt: value, raw: value });
        resetAfterSubmit();
        return;
      }
    }

    if (effectiveIntent === "post") {
      if (postPlan.mode === "manual") {
        const content = postPlan.content.trim();
        if (!content && !hasAttachmentPayload) return;
        emitAction({ kind: "post_manual", content, raw: value });
      } else if (postPlan.mode === "ai") {
        emitAction({
          kind: "post_ai",
          prompt: value,
          mode: detectComposerMode(value.toLowerCase()),
          raw: value,
        });
      } else if (hasAttachmentPayload) {
        emitAction({ kind: "post_manual", content: value, raw: value });
      } else {
        emitAction({ kind: "post_manual", content: value, raw: value });
      }
      resetAfterSubmit();
      return;
    }

    if (effectiveIntent === "style") {
      emitAction({ kind: "style", prompt: value, raw: value });
      resetAfterSubmit();
      return;
    }

    emitAction({ kind: "generate", text: value, raw: value });
    resetAfterSubmit();
  }, [
    attachmentUploading,
    attachmentList,
    readyAttachment,
    onAction,
    trimmed,
    textRef,
    setText,
    setManualIntent,
    closeMenu,
    clearAttachment,
    effectiveIntent,
    navTarget,
    postPlan,
    router,
    manualTool,
    suggestedTools,
    variantConfig.allowTools,
  ]);

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
        ? `Ready to post: "${truncate(postPlan.content, 50)}"`
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
    const safeName = truncate(attachment.name || "attachment", 36);
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
      attachmentUploading ||
      Boolean(uploadCompleteHint) ||
      attachment?.status === "error");

  return (
    <section
      className={styles.prompterStage}
      aria-label="AI Prompter"
      onDragEnter={attachmentsEnabled ? handleDragEnter : undefined}
      onDragOver={attachmentsEnabled ? handleDragOver : undefined}
      onDragLeave={attachmentsEnabled ? handleDragLeave : undefined}
      onDrop={attachmentsEnabled ? handleDrop : undefined}
      data-dropping={attachmentsEnabled && isDraggingFile ? "true" : undefined}
    >
      <div className={styles.prompter}>
        {attachmentsEnabled && isDraggingFile ? (
          <div className={styles.prompterDropOverlay} aria-hidden>
            <div className={styles.prompterDropCard}>
              <Paperclip size={28} weight="duotone" className={styles.prompterDropIcon} />
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
          onAttachClick={handleAttachClickSafe}
          onFileChange={handleAttachmentSelectSafe}
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
          attachments={attachmentList.filter((a): a is NonNullable<typeof a> => Boolean(a))}
          uploadingAttachment={attachmentUploading && attachment ? attachment : null}
          onRemoveAttachment={attachmentsEnabled ? removeAttachment : noop}
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
          onClose={() => setPreview(null)}
        />

        <PrompterSuggestedActions actions={chips} onSelect={setText} />
      </div>
    </section>
  );
}



