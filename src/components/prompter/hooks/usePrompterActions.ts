"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { setTheme } from "@/lib/theme";
import type { PromptIntent } from "@/lib/ai/intent";
import { detectComposerMode, type NavigationTarget } from "@/lib/ai/nav";
import {
  SUMMARIZE_FEED_REQUEST_EVENT,
  type SummarizeFeedRequestDetail,
  type SummarizeFeedRequestOrigin,
} from "@/lib/events";
import type { PrompterToolKey } from "@/components/prompter/tools";
import type { PrompterAction, PrompterAttachment } from "@/components/ai-prompter-stage";
import type { PrompterAiOptions, PrompterHandoff } from "@/components/composer/prompter-handoff";
import type { PrompterVariantConfig } from "./usePrompterContext";
import type { PrompterPostPlan } from "@/lib/prompter/actions";
import type { PrompterChipOption } from "@/components/prompter/hooks/usePrompterStageController";
import {
  isFeedSummaryRequest,
  SUMMARIZE_FEED_LABEL,
} from "@/lib/prompter/actions";
import type { LocalAttachment } from "@/hooks/useAttachmentUpload";

type SuggestedTool = { key: PrompterToolKey };

type AttachmentSnapshot = {
  attachmentList: LocalAttachment[];
  readyAttachment: LocalAttachment | null;
  attachmentUploading: boolean;
  clearAllAttachments: () => void;
};

type UsePrompterActionsOptions = {
  text: string;
  textRef: React.MutableRefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  setText: (value: string) => void;
  clearManualIntentOverrides: () => void;
  surface?: string | null;
  manualTool: PrompterToolKey | null;
  suggestedTools: SuggestedTool[];
  variantConfig: PrompterVariantConfig;
  navTarget: NavigationTarget | null;
  postPlan: PrompterPostPlan;
  effectiveIntent: PromptIntent;
  closeMenu: () => void;
  onAction?: (action: PrompterAction) => void;
  onHandoff?: (handoff: PrompterHandoff) => void;
  showLocalStatus: (message: string | null, ttl?: number | null) => void;
  composerReferenceAttachment?: PrompterAttachment | null;
  attachmentState: AttachmentSnapshot;
  setLocalLoading(active: boolean): void;
};

export function usePrompterActions({
  text,
  textRef,
  setText,
  clearManualIntentOverrides,
  surface = null,
  manualTool,
  suggestedTools,
  variantConfig,
  navTarget,
  postPlan,
  effectiveIntent,
  closeMenu,
  onAction,
  onHandoff,
  showLocalStatus,
  composerReferenceAttachment,
  attachmentState,
  setLocalLoading,
}: UsePrompterActionsOptions) {
  const router = useRouter();
  const { attachmentList, readyAttachment, attachmentUploading, clearAllAttachments } =
    attachmentState;

  const logChipEvent = React.useCallback(
    (option: PrompterChipOption) => {
      if (!option) return;
      const payload = {
        chipId: option.id ?? option.value ?? option.label,
        label: option.label,
        surface: surface ?? null,
        source: option.surface ?? surface ?? null,
      };
      try {
        void fetch("/api/prompter/chips/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("prompter: failed to log chip event", error);
        }
      }
    },
    [surface],
  );

  const triggerFeedSummary = React.useCallback(
    (origin: SummarizeFeedRequestOrigin) => {
      if (typeof window === "undefined") return;
      const detail: SummarizeFeedRequestDetail = { origin };
      window.dispatchEvent(
        new CustomEvent<SummarizeFeedRequestDetail>(SUMMARIZE_FEED_REQUEST_EVENT, { detail }),
      );
      showLocalStatus("Summarizing your feed...");
    },
    [showLocalStatus],
  );

  const handleSuggestedAction = React.useCallback(
    (action: PrompterChipOption | string) => {
      const option =
        typeof action === "string"
          ? { label: action, value: action }
          : action;
      const value = option.value ?? option.label;

      if (value === SUMMARIZE_FEED_LABEL) {
        triggerFeedSummary("chip");
        logChipEvent(option);
        setText("");
        clearManualIntentOverrides();
        closeMenu();
        clearAllAttachments();
        textRef.current?.focus();
        return;
      }

      if (option.handoff && onHandoff) {
        logChipEvent(option);
        onHandoff(option.handoff);
        setText("");
        clearManualIntentOverrides();
        closeMenu();
        clearAllAttachments();
        textRef.current?.focus();
        return;
      }

      logChipEvent(option);
      setText(value);
      textRef.current?.focus();
    },
    [
      clearAllAttachments,
      clearManualIntentOverrides,
      closeMenu,
      logChipEvent,
      onHandoff,
      setText,
      textRef,
      triggerFeedSummary,
    ],
  );

  const handleGenerate = React.useCallback(() => {
    if (attachmentUploading) return;

    const readyFromList = attachmentList.filter(
      (item) => item.status === "ready" && item.url,
    );
    const includeActive =
      readyAttachment &&
      readyAttachment.status === "ready" &&
      readyAttachment.url &&
      !readyFromList.find((item) => item.id === readyAttachment.id)
        ? [readyAttachment]
        : [];
    const allReady = [...readyFromList, ...includeActive];
    const readyAttachments: PrompterAttachment[] | null = allReady.length
      ? allReady.map((att) => ({
          id: att.id,
          name: att.name,
          mimeType: att.mimeType,
          size: att.size,
          url: att.url!,
          thumbnailUrl: att.thumbUrl ?? undefined,
          storageKey: att.key ?? null,
          sessionId: att.sessionId ?? null,
          role: att.role ?? "reference",
          source: att.source ?? "upload",
        }))
      : null;
    const referenceAttachment = readyAttachments?.[0] ?? composerReferenceAttachment ?? null;
    const hasAttachmentPayload = Boolean((readyAttachments?.length ?? 0) > 0 || referenceAttachment);
    const emitAction = (action: PrompterAction) => {
      if (!onAction) return;
      if (readyAttachments && readyAttachments.length) {
        onAction({ ...action, attachments: readyAttachments });
      } else {
        onAction(action);
      }
    };
    const selectedTool: PrompterToolKey | null = variantConfig.allowTools
      ? manualTool ?? suggestedTools[0]?.key ?? null
      : null;

    const dispatchAiHandoff = (payload: { prompt: string; options?: PrompterAiOptions }) => {
      if (!onHandoff) return false;
      const attachmentsPayload =
        readyAttachments && readyAttachments.length
          ? readyAttachments
          : referenceAttachment
            ? [referenceAttachment]
            : undefined;
      const replyMode =
        effectiveIntent === "post" ||
        effectiveIntent === "generate" ||
        selectedTool === "poll" ||
        selectedTool === "logo" ||
        selectedTool === "image_edit"
          ? "draft"
          : ("chat" as "chat" | "draft");
      const mergedOptions: PrompterAiOptions | undefined = payload.options
        ? {
            ...payload.options,
            extras: { ...(payload.options.extras ?? {}), replyMode },
          }
        : { extras: { replyMode } };
      const handoff: PrompterHandoff = {
        intent: "ai_prompt",
        prompt: payload.prompt,
        ...(attachmentsPayload ? { attachments: attachmentsPayload } : {}),
        ...(mergedOptions ? { options: mergedOptions } : {}),
      };
      onHandoff(handoff);
      return true;
    };
    const dispatchLogoHandoff = () => {
      if (!onHandoff) return false;
      onHandoff({ intent: "image_logo", prompt: value });
      return true;
    };
    const dispatchImageEditHandoff = () => {
      if (!onHandoff) return false;
      const reference = referenceAttachment;
      if (!reference) return false;
      onHandoff({ intent: "image_edit", prompt: value, reference });
      return true;
    };
    const value = text.trim();
    const hasValue = value.length > 0;

    if (!hasValue && !hasAttachmentPayload) {
      textRef.current?.focus();
      return;
    }

    const markLoading = () => setLocalLoading(true);
    const clearLoading = () => setLocalLoading(false);

    const resetAfterSubmit = () => {
      setText("");
      clearManualIntentOverrides();
      closeMenu();
      clearAllAttachments();
      textRef.current?.focus();
    };

    if (effectiveIntent === "navigate") {
      if (!navTarget) return;
      if (navTarget.kind === "route") {
        router.push(navTarget.path);
      } else {
        setTheme(navTarget.value);
      }
      clearLoading();
      resetAfterSubmit();
      return;
    }

    markLoading();

    if (selectedTool === "poll") {
      const handled = dispatchAiHandoff({ prompt: value, options: { prefer: "poll" } });
      if (!handled) {
        emitAction({
          kind: "post_ai",
          prompt: value,
          mode: "poll",
          raw: value,
        });
      }
      resetAfterSubmit();
      return;
    }

    if (selectedTool === "logo") {
      const handled = dispatchLogoHandoff();
      if (!handled) {
        emitAction({ kind: "tool_logo", prompt: value, raw: value });
      }
      clearLoading();
      resetAfterSubmit();
      return;
    }

    if (selectedTool === "image_edit") {
      if (hasAttachmentPayload) {
        const handled = dispatchImageEditHandoff();
        if (!handled) {
          emitAction({ kind: "tool_image_edit", prompt: value, raw: value });
        }
        clearLoading();
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
        const composeMode = postPlan.composeMode ?? detectComposerMode(value.toLowerCase());
        const handled = dispatchAiHandoff({
          prompt: value,
          options: { composeMode },
        });
        if (!handled) {
          emitAction({
            kind: "post_ai",
            prompt: value,
            mode: composeMode,
            raw: value,
          });
        }
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
      clearLoading();
      resetAfterSubmit();
      return;
    }

    if (isFeedSummaryRequest(value)) {
      triggerFeedSummary("prompt");
      clearLoading();
      resetAfterSubmit();
      return;
    }

    if (!dispatchAiHandoff({ prompt: value })) {
      emitAction({ kind: "generate", text: value, raw: value });
    }
    resetAfterSubmit();
  }, [
    attachmentList,
    attachmentUploading,
    clearAllAttachments,
    closeMenu,
    effectiveIntent,
    manualTool,
    navTarget,
    onAction,
    onHandoff,
    postPlan,
    router,
    clearManualIntentOverrides,
    setText,
    setLocalLoading,
    suggestedTools,
    text,
    textRef,
    triggerFeedSummary,
    variantConfig.allowTools,
    readyAttachment,
    composerReferenceAttachment,
  ]);

  return {
    handleGenerate,
    handleSuggestedAction,
  };
}
