"use client";

import * as React from "react";
import { safeRandomUUID } from "@/lib/random";
import type { PrompterAction, PrompterAttachment } from "@/components/ai-prompter-stage";
import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { appendCapsuleContext } from "./ai-shared";
import { requestImageGeneration, requestImageEdit } from "@/services/composer/images";
import { callAiPrompt } from "@/services/composer/ai";
import { persistPost } from "@/services/composer/posts";
import { callStyler } from "@/services/composer/styler";
import { normalizeThemeVariantsInput } from "@/lib/theme/variants";
import { resolveStylerHeuristicPlan } from "@/lib/theme/styler-heuristics";
import {
  mapPrompterAttachmentToChat,
  shouldExpectVideoResponse,
  validatePromptAndAttachments,
} from "./composerState";
import type { ComposerState } from "../types";
import type { PromptSubmitOptions, PromptRunMode } from "../types";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import type { PromptResponse } from "@/shared/schemas/ai";
import type { ThemePreviewState } from "../context/ThemePreviewProvider";
import type { ComposerAiApplyResult } from "./useComposerAi";

const IMAGE_EXTENSION_RE = /\.(apng|avif|bmp|gif|jpe?g|jfif|pjpeg|pjp|png|svg|webp)$/i;
const VIDEO_PROMPT_TIMEOUT_MS = 16 * 60 * 1000; // allow long-running video renders

function isImageLike(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const normalized = url.split("?")[0]?.toLowerCase() ?? "";
  return IMAGE_EXTENSION_RE.test(normalized);
}

function buildFallbackImageAttachment(
  snapshot: ComposerState,
  nameOverride?: string | null,
): PrompterAttachment | null {
  const draftUrl =
    typeof snapshot.draft?.mediaUrl === "string" && snapshot.draft.mediaUrl.trim().length
      ? snapshot.draft.mediaUrl.trim()
      : null;
  if (draftUrl) {
    return {
      id: safeRandomUUID(),
      name: nameOverride || snapshot.draft?.title || "Previous visual",
      mimeType: "image/*",
      size: 0,
      url: draftUrl,
      thumbnailUrl: snapshot.draft?.mediaThumbnailUrl ?? null,
      role: "reference",
      source: "ai",
      excerpt: snapshot.draft?.mediaPrompt ?? null,
    };
  }

  for (let i = snapshot.history.length - 1; i >= 0; i -= 1) {
    const entry = snapshot.history[i];
    if (!entry || !Array.isArray(entry.attachments) || entry.attachments.length === 0) continue;
    for (let j = entry.attachments.length - 1; j >= 0; j -= 1) {
      const attachment = entry.attachments[j];
      if (!attachment) continue;
      const url = typeof attachment.url === "string" ? attachment.url.trim() : "";
      const thumb =
        typeof attachment.thumbnailUrl === "string" ? attachment.thumbnailUrl.trim() : null;
      const mime = (attachment.mimeType ?? "").toLowerCase();
      if (!url) continue;
      const looksImage = mime.startsWith("image/") || isImageLike(url) || isImageLike(thumb);
      if (!looksImage) continue;
      return {
        id: safeRandomUUID(),
        name: attachment.name || "Previous visual",
        mimeType: mime || "image/*",
        size: 0,
        url,
        thumbnailUrl: thumb,
        storageKey: attachment.storageKey ?? null,
        sessionId: attachment.sessionId ?? null,
        role: "reference",
        source: (attachment.source as PrompterAttachment["source"]) ?? "ai",
        excerpt: attachment.excerpt ?? null,
      };
    }
  }

  return null;
}

type AiPromptHandoff = Extract<PrompterHandoff, { intent: "ai_prompt" }>;
type ImageLogoHandoff = Extract<PrompterHandoff, { intent: "image_logo" }>;
type ImageEditHandoff = Extract<PrompterHandoff, { intent: "image_edit" }>;

type ComposerImageSettings = {
  quality: unknown;
};

export type UseComposerPromptActionsOptions = {
  activeCapsuleId: string | null;
  imageSettings: ComposerImageSettings;
  imageRequestOptions: Record<string, unknown>;
  smartContextEnabled: boolean;
  envelopePayload: Record<string, unknown> | null;
  setState: React.Dispatch<React.SetStateAction<ComposerState>>;
  getState: () => ComposerState;
  applyAiResponse: (
    prompt: string,
    payload: PromptResponse,
    mode?: PromptRunMode,
  ) => ComposerAiApplyResult | null;
  recordRecentChat: (input: {
    prompt: string;
    message: string | null;
    draft: ComposerState["draft"];
    rawPost: Record<string, unknown> | null;
    history: ComposerChatMessage[];
    threadId: string | null;
  }) => void;
  beginRequestToken(): string;
  isRequestActive(token: string): boolean;
  clearRequestToken(token?: string): void;
  startRequestController(): AbortController;
  clearRequestController(controller?: AbortController | null): void;
  pushAssistantError(content: string, history?: ComposerChatMessage[]): void;
  previewTheme(plan: ThemePreviewState): void;
  resetComposerState(overrides?: Partial<ComposerState>): void;
};

export function useComposerPromptActions({
  activeCapsuleId,
  imageSettings,
  imageRequestOptions,
  smartContextEnabled,
  envelopePayload,
  setState,
  getState,
  applyAiResponse,
  recordRecentChat,
  beginRequestToken,
  isRequestActive,
  clearRequestToken,
  startRequestController,
  clearRequestController,
  pushAssistantError,
  previewTheme,
  resetComposerState,
}: UseComposerPromptActionsOptions) {
  const handleAiResponse = React.useCallback(
    (prompt: string, payload: PromptResponse, mode: PromptRunMode = "default") => {
      const resolvedMode: PromptRunMode = payload.action === "chat_reply" ? "chatOnly" : mode;
      const result = applyAiResponse(prompt, payload, resolvedMode);
      if (!result) return;
      const { draft, rawPost, history, threadId, message } = result;

      recordRecentChat({
        prompt,
        message,
        draft: draft ?? null,
        rawPost,
        history,
        threadId,
      });
      setState((prev) => ({ ...prev, lastPrompt: null }));
    },
    [applyAiResponse, recordRecentChat, setState],
  );

  const runAiPromptHandoff = React.useCallback(
    async ({ prompt, attachments, options }: AiPromptHandoff) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt.length) return;
      const validationError = validatePromptAndAttachments(trimmedPrompt, attachments ?? null);
      if (validationError) {
        pushAssistantError(validationError);
        return;
      }
      const controller = startRequestController();
      const normalizedAttachments = attachments && attachments.length ? attachments : undefined;
      const requestToken = beginRequestToken();
      const prefillOnly =
        typeof (options?.extras as { prefillOnly?: unknown } | undefined)?.prefillOnly === "boolean"
          ? Boolean((options!.extras as { prefillOnly: boolean }).prefillOnly)
          : false;

      if (prefillOnly) {
        const createdAt = new Date().toISOString();
        const assistantMessage: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "assistant",
          content: trimmedPrompt,
          createdAt,
          attachments: normalizedAttachments
            ? normalizedAttachments.map((attachment) => mapPrompterAttachmentToChat(attachment))
            : null,
        };
        setState((prev) => {
          const existingHistory = prev.history ?? [];
          const resolvedThreadId = prev.threadId ?? safeRandomUUID();
          return {
            ...prev,
            open: true,
            loading: false,
            loadingKind: null,
            prompt: "",
            message: assistantMessage.content,
            choices: null,
            history: [...existingHistory, assistantMessage],
            threadId: resolvedThreadId,
            summaryContext: null,
            summaryResult: null,
            summaryOptions: null,
            summaryMessageId: assistantMessage.id,
          };
        });
        return;
      }

      const composeOptions: Record<string, unknown> = {};
      if (options?.composeMode) {
        composeOptions.compose = options.composeMode;
      }
      if (options?.prefer) {
        composeOptions.prefer = options.prefer;
      }
      if (options?.extras && Object.keys(options.extras).length) {
        Object.assign(composeOptions, options.extras);
      }
      const requestedComposeKind =
        typeof (composeOptions as { compose?: unknown }).compose === "string" &&
        String((composeOptions as { compose?: string }).compose).toLowerCase() === "image"
          ? "image"
          : null;
      const replyMode =
        typeof (composeOptions as { replyMode?: unknown }).replyMode === "string"
          ? String((composeOptions as { replyMode?: string }).replyMode)
          : null;
      composeOptions.imageQuality = imageSettings.quality;
      const resolvedOptions = Object.keys(composeOptions).length ? composeOptions : undefined;

      const fallbackAttachment =
        !normalizedAttachments && requestedComposeKind === "image"
          ? buildFallbackImageAttachment(getState())
          : null;
      const effectiveAttachments =
        normalizedAttachments || (fallbackAttachment ? [fallbackAttachment] : undefined);
      const expectVideo = shouldExpectVideoResponse(trimmedPrompt, effectiveAttachments ?? null);
      const timeoutMs = expectVideo ? VIDEO_PROMPT_TIMEOUT_MS : undefined;

      const createdAt = new Date().toISOString();
      const workingMessageId = safeRandomUUID();
      const attachmentForChat =
        effectiveAttachments?.map((attachment) => mapPrompterAttachmentToChat(attachment)) ?? [];
      const pendingMessage: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "user",
        content: trimmedPrompt,
        createdAt,
        attachments: attachmentForChat.length ? attachmentForChat : null,
      };
      let baseHistory: ComposerChatMessage[] = [];
      let threadIdForRequest: string | null = null;
      let pendingHistory: ComposerChatMessage[] = [];
      setState((prev) => {
        const existingHistory = prev.history ?? [];
        baseHistory = existingHistory.slice();
        const lastEntry = existingHistory.length ? existingHistory[existingHistory.length - 1] : null;
        const nextHistory =
          lastEntry &&
          lastEntry.role === "user" &&
          lastEntry.content.trim().toLowerCase() === trimmedPrompt.toLowerCase()
            ? existingHistory
            : [...existingHistory, pendingMessage];
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        const workingAssistant: ComposerChatMessage = {
          id: workingMessageId,
          role: "assistant",
          content: "Working on your request...",
          createdAt,
          attachments: null,
        };
        pendingHistory = [...nextHistory, workingAssistant];
        return {
          ...prev,
          open: true,
          loading: true,
          loadingKind: requestedComposeKind,
          prompt: trimmedPrompt,
          message: workingAssistant.content,
          choices: null,
          history: [...nextHistory, workingAssistant],
          threadId: resolvedThreadId,
          summaryContext: null,
          summaryResult: null,
          summaryOptions: null,
          summaryMessageId: null,
          backgrounded: false,
          backgroundReadyNotice: null,
          backgroundReminderVisible: false,
          lastPrompt: {
            prompt: trimmedPrompt,
            attachments: effectiveAttachments ?? null,
            mode: replyMode === "chat" ? "chatOnly" : "default",
            kind: requestedComposeKind,
            failed: false,
          },
        };
      });

      const updateWorking = (content: string) => {
        setState((prev) => {
          const history = (prev.history ?? []).map((entry) =>
            entry.id === workingMessageId ? { ...entry, content } : entry,
          );
          const message = prev.history?.some((entry) => entry.id === workingMessageId)
            ? content
            : prev.message;
          return { ...prev, history, message };
        });
      };

      try {
        const stateSnapshot = getState();
        const rawPostForRequest = stateSnapshot.rawPost;
        const threadIdSnapshot = stateSnapshot.threadId;
        const payload = await callAiPrompt({
          message: trimmedPrompt,
          ...(resolvedOptions ? { options: resolvedOptions } : {}),
          ...(rawPostForRequest && replyMode !== "chat" ? { post: rawPostForRequest } : {}),
          ...(effectiveAttachments ? { attachments: effectiveAttachments } : {}),
          history: baseHistory,
          ...(threadIdForRequest ? { threadId: threadIdForRequest } : {}),
          ...(threadIdSnapshot && !threadIdForRequest ? { threadId: threadIdSnapshot } : {}),
          ...(activeCapsuleId ? { capsuleId: activeCapsuleId } : {}),
          useContext: smartContextEnabled,
          stream: true,
          onStreamMessage: updateWorking,
          signal: controller.signal,
          ...(timeoutMs ? { timeoutMs } : {}),
        });
        if (!isRequestActive(requestToken)) return;
        setState((prev) => ({
          ...prev,
          history: (prev.history ?? []).filter((entry) => entry.id !== workingMessageId),
          loadingKind: null,
        }));
        handleAiResponse(trimmedPrompt, payload);
        clearRequestToken(requestToken);
        clearRequestController(controller);
      } catch (error) {
        console.error("AI prompt failed", error);
        if (!isRequestActive(requestToken)) return;
        const errorMessage =
          error instanceof Error && error.message
            ? error.message.trim()
            : "Your assistant ran into an unexpected error.";
        const assistantError: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "assistant",
          content: errorMessage,
          createdAt: new Date().toISOString(),
          attachments: null,
        };
        setState((prev) => ({
          ...prev,
          loading: false,
          loadingKind: null,
          history: pendingHistory.length
            ? pendingHistory.filter((entry) => entry.id !== workingMessageId).concat(assistantError)
            : prev.history.filter((entry) => entry.id !== workingMessageId).concat(assistantError),
          message: errorMessage,
          backgrounded: false,
          backgroundReadyNotice: null,
          backgroundReminderVisible: false,
          lastPrompt: {
            prompt: trimmedPrompt,
            attachments: effectiveAttachments ?? null,
            mode: replyMode === "chat" ? "chatOnly" : "default",
            kind: requestedComposeKind,
            failed: true,
          },
        }));
        clearRequestToken(requestToken);
        clearRequestController(controller);
      }
    },
    [
      activeCapsuleId,
      beginRequestToken,
      clearRequestController,
      clearRequestToken,
      getState,
      imageSettings.quality,
      handleAiResponse,
      isRequestActive,
      pushAssistantError,
      setState,
      smartContextEnabled,
      startRequestController,
    ],
  );

  const runLogoHandoff = React.useCallback(
    async ({ prompt }: ImageLogoHandoff) => {
      const createdAt = new Date().toISOString();
      const workingAssistant: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "assistant",
        content: "Generating your visual...",
        createdAt,
        attachments: null,
      };
      setState((prev) => ({
        ...prev,
        open: true,
        loading: true,
        loadingKind: "image",
        prompt,
        message: workingAssistant.content,
        choices: null,
        history: [workingAssistant],
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
      }));
      try {
        const result = await requestImageGeneration(prompt, imageRequestOptions);
        const assistantMessage: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "assistant",
          content: "Generated a logo concept from your prompt.",
          createdAt: new Date().toISOString(),
          attachments: null,
        };
        const nextThreadId = safeRandomUUID();
        setState((prev) => ({
          ...prev,
          open: prev.backgrounded && !prev.open ? prev.open : true,
          loading: false,
          loadingKind: null,
          prompt,
          draft: {
            kind: "image",
            title: null,
            content: "",
            mediaUrl: result.url,
            mediaPrompt: prompt,
            poll: null,
          },
          rawPost: appendCapsuleContext(
            { kind: "image", mediaUrl: result.url, media_prompt: prompt, source: "ai-prompter" },
            activeCapsuleId,
          ),
          message: assistantMessage.content,
          choices: null,
          history: [assistantMessage],
          threadId: nextThreadId,
          backgrounded: prev.backgrounded && !prev.open,
          backgroundReadyNotice:
            prev.backgrounded && !prev.open
              ? { kind: "image", label: "Image ready", threadId: nextThreadId }
              : null,
          backgroundReminderVisible: false,
      }));
    } catch (error) {
      console.error("Logo tool failed", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Image generation failed. Tap retry to try again.";
      setState((prev) => ({
        ...prev,
        open: true,
        loading: false,
        loadingKind: null,
        message,
        choices: null,
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
      }));
      }
    },
    [activeCapsuleId, imageRequestOptions, setState],
  );

  const runImageEditHandoff = React.useCallback(
    async ({ prompt, reference }: ImageEditHandoff) => {
      if (!reference?.url) return;
      const createdAt = new Date().toISOString();
      const workingAssistant: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "assistant",
        content: "Applying your edits...",
        createdAt,
        attachments: null,
      };
      setState((prev) => ({
        ...prev,
        open: true,
        loading: true,
        loadingKind: "image",
        prompt,
        message: workingAssistant.content,
        choices: null,
        history: [workingAssistant],
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
      }));
      try {
        const result = await requestImageEdit({
          imageUrl: reference.url,
          instruction: prompt,
          options: imageRequestOptions,
        });
        const assistantMessage: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "assistant",
          content: "Updated your image with those vibes.",
          createdAt: new Date().toISOString(),
          attachments: null,
        };
        const nextThreadId = safeRandomUUID();
        setState((prev) => ({
          ...prev,
          open: prev.backgrounded && !prev.open ? prev.open : true,
          loading: false,
          loadingKind: null,
          prompt,
          draft: {
            kind: "image",
            title: null,
            content: "",
            mediaUrl: result.url,
            mediaPrompt: prompt,
            poll: null,
          },
          rawPost: appendCapsuleContext(
            { kind: "image", mediaUrl: result.url, media_prompt: prompt, source: "ai-prompter" },
            activeCapsuleId,
          ),
          message: assistantMessage.content,
          choices: null,
          history: [assistantMessage],
          threadId: nextThreadId,
          backgrounded: prev.backgrounded && !prev.open,
          backgroundReadyNotice:
            prev.backgrounded && !prev.open
              ? { kind: "image", label: "Image ready", threadId: nextThreadId }
              : null,
          backgroundReminderVisible: false,
      }));
    } catch (error) {
      console.error("Image edit tool failed", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Image edit failed. Tap retry to try again.";
      setState((prev) => ({
        ...prev,
        open: true,
        loading: false,
        loadingKind: null,
        message,
        choices: null,
        backgrounded: false,
        backgroundReadyNotice: null,
        backgroundReminderVisible: false,
        }));
      }
    },
    [activeCapsuleId, imageRequestOptions, setState],
  );

  const handlePrompterHandoff = React.useCallback(
    async (handoff: PrompterHandoff) => {
      switch (handoff.intent) {
        case "ai_prompt":
          await runAiPromptHandoff(handoff);
          return;
        case "image_logo":
          await runLogoHandoff(handoff);
          return;
        case "image_edit":
          await runImageEditHandoff(handoff);
          return;
        default:
          return;
      }
    },
    [runAiPromptHandoff, runLogoHandoff, runImageEditHandoff],
  );

  const submitPrompt = React.useCallback(
    async (
      promptText: string,
      attachments?: PrompterAttachment[] | null,
      options?: PromptSubmitOptions,
    ) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;
      const attachmentList = attachments && attachments.length ? attachments : undefined;
      const validationError = validatePromptAndAttachments(trimmed, attachmentList ?? null);
      if (validationError) {
        const assistantError: ComposerChatMessage = {
          id: safeRandomUUID(),
          role: "assistant",
          content: validationError,
          createdAt: new Date().toISOString(),
          attachments: null,
        };
        setState((prev) => ({
          ...prev,
          open: true,
          loading: false,
          loadingKind: null,
          message: validationError,
          history: [...(prev.history ?? []), assistantError],
          backgrounded: false,
          backgroundReadyNotice: null,
          backgroundReminderVisible: false,
        }));
        return;
      }
      const requestToken = beginRequestToken();
      const controller = startRequestController();
      const snapshot = getState();
      const expectVideo = shouldExpectVideoResponse(trimmed, attachmentList ?? null);
      const expectImage =
        !expectVideo && (snapshot.draft?.kind ?? "").toLowerCase() === "image";
      const pollIntent = /\b(poll|survey|vote|questionnaire|ballot)\b/i.test(trimmed);
      const visualIntent = /\b(image|photo|picture|graphic|logo|banner|poster|thumbnail|icon|avatar|render|illustration|design|art|shot|frame|visual)\b/i.test(
        trimmed,
      );
      const preserveSummary = options?.preserveSummary ?? Boolean(snapshot.summaryResult);
      const fallbackAttachment =
        !attachmentList?.length && expectImage ? buildFallbackImageAttachment(snapshot) : null;
      const effectiveAttachments =
        attachmentList && attachmentList.length
          ? attachmentList
          : fallbackAttachment
            ? [fallbackAttachment]
            : undefined;
      const chatAttachments =
        effectiveAttachments?.map((attachment) => mapPrompterAttachmentToChat(attachment)) ?? [];
      const pendingMessage: ComposerChatMessage = {
        id: safeRandomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
        attachments: chatAttachments.length ? chatAttachments : null,
      };
      let previousHistory: ComposerChatMessage[] = [];
      let threadIdForRequest: string | null = null;
      let pendingHistory: ComposerChatMessage[] = [];
      setState((prev) => {
        const existingHistory = prev.history ?? [];
        previousHistory = existingHistory.slice();
        const lastEntry = existingHistory.length ? existingHistory[existingHistory.length - 1] : null;
        const nextHistory =
          lastEntry &&
          lastEntry.role === "user" &&
          lastEntry.content.trim().toLowerCase() === trimmed.toLowerCase()
            ? existingHistory
            : [...existingHistory, pendingMessage];
        const resolvedThreadId = prev.threadId ?? safeRandomUUID();
        threadIdForRequest = resolvedThreadId;
        let nextVideoStatus = prev.videoStatus;
        if (expectVideo) {
          nextVideoStatus = {
            state: "running",
            runId: prev.videoStatus.state === "running" ? prev.videoStatus.runId : null,
            prompt: trimmed,
            attachments: attachmentList ?? null,
            error: null,
            message: "Rendering your clip...",
            memoryId: prev.videoStatus.memoryId ?? null,
          };
        } else if (prev.videoStatus.state !== "idle") {
          nextVideoStatus = {
            state: "idle",
            runId: null,
            prompt: null,
            attachments: null,
            error: null,
            message: null,
            memoryId: null,
          };
        }
        pendingHistory = nextHistory;
        return {
          ...prev,
          loading: true,
          loadingKind: expectVideo ? null : expectImage ? "image" : null,
          prompt: trimmed,
          message: null,
          choices: null,
          history: nextHistory,
          threadId: resolvedThreadId,
          summaryContext: preserveSummary ? prev.summaryContext : null,
          summaryResult: preserveSummary ? prev.summaryResult : null,
          summaryOptions: preserveSummary ? prev.summaryOptions : null,
          summaryMessageId: preserveSummary ? prev.summaryMessageId : null,
          videoStatus: nextVideoStatus,
          backgrounded: false,
          backgroundReadyNotice: null,
          backgroundReminderVisible: false,
          lastPrompt: {
            prompt: trimmed,
            attachments: effectiveAttachments ?? null,
            mode: options?.mode ?? "default",
            kind: expectVideo ? "video" : expectImage ? "image" : null,
            failed: false,
          },
        };
      });
      try {
        const requestOptions: Record<string, unknown> = {
          imageQuality: imageSettings.quality,
        };
        if (options?.mode === "chatOnly") {
          requestOptions.replyMode = "chat";
        }
        const hasPollDraft =
          Boolean(snapshot.rawPost && typeof (snapshot.rawPost as { poll?: unknown }).poll === "object") ||
          Boolean(snapshot.draft?.poll);
        const rawPostForRequest =
          hasPollDraft && visualIntent && !pollIntent ? null : snapshot.rawPost;
        const payload = await callAiPrompt({
          message: trimmed,
          ...(Object.keys(requestOptions).length ? { options: requestOptions } : {}),
          ...(rawPostForRequest && options?.mode !== "chatOnly" ? { post: rawPostForRequest } : {}),
          ...(effectiveAttachments ? { attachments: effectiveAttachments } : {}),
          history: previousHistory,
          ...(threadIdForRequest ? { threadId: threadIdForRequest } : {}),
          ...(activeCapsuleId ? { capsuleId: activeCapsuleId } : {}),
          useContext: smartContextEnabled,
          signal: controller.signal,
          ...(expectVideo ? { timeoutMs: VIDEO_PROMPT_TIMEOUT_MS } : {}),
        });
        if (!isRequestActive(requestToken)) return;
        handleAiResponse(trimmed, payload, options?.mode ?? "default");
        clearRequestToken(requestToken);
        clearRequestController(controller);
      } catch (error) {
        console.error("Composer prompt submit failed", error);
        if (!isRequestActive(requestToken)) return;
        const errorMessage =
          error instanceof Error && error.message
            ? error.message.trim()
            : "Your assistant ran into an unexpected error.";
        setState((prev) => {
          const fallbackVideoStatus = expectVideo
            ? {
                state: "failed" as const,
                runId: prev.videoStatus.runId,
                prompt: trimmed,
                attachments: prev.videoStatus.attachments ?? (attachmentList ?? null) ?? null,
                error: errorMessage,
                message: errorMessage,
                memoryId: prev.videoStatus.memoryId ?? null,
              }
            : prev.videoStatus.state !== "idle"
              ? {
                  state: "idle" as const,
                  runId: null,
                  prompt: null,
                  attachments: null,
                  error: null,
                  message: null,
                  memoryId: null,
                }
              : prev.videoStatus;
          const assistantError: ComposerChatMessage = {
            id: safeRandomUUID(),
            role: "assistant",
            content: errorMessage,
            createdAt: new Date().toISOString(),
            attachments: null,
          };
          const safeHistory =
            pendingHistory.length && pendingHistory[pendingHistory.length - 1]?.id === pendingMessage.id
              ? pendingHistory
              : pendingHistory.length
                ? pendingHistory
                : [...previousHistory, pendingMessage];
          return {
            ...prev,
            loading: false,
            loadingKind: null,
            history: safeHistory.concat(assistantError),
            message: errorMessage,
            videoStatus: fallbackVideoStatus,
            backgrounded: false,
            backgroundReadyNotice: null,
            backgroundReminderVisible: false,
            lastPrompt: {
              prompt: trimmed,
              attachments: attachmentList ?? null,
              mode: options?.mode ?? "default",
              kind: expectVideo ? "video" : expectImage ? "image" : null,
              failed: true,
            },
          };
        });
        clearRequestToken(requestToken);
        clearRequestController(controller);
      }
    },
    [
      activeCapsuleId,
      beginRequestToken,
      clearRequestController,
      clearRequestToken,
      getState,
      handleAiResponse,
      imageSettings.quality,
      isRequestActive,
      setState,
      smartContextEnabled,
      startRequestController,
    ],
  );

  const retryVideo = React.useCallback(() => {
    const status = getState().videoStatus;
    if (status.state !== "failed" || !status.prompt) return;
    void submitPrompt(status.prompt, status.attachments ?? undefined);
  }, [getState, submitPrompt]);

  const retryLastPrompt = React.useCallback(() => {
    const last = getState().lastPrompt;
    if (!last) return;
    void submitPrompt(last.prompt, last.attachments ?? undefined, { mode: last.mode });
  }, [getState, submitPrompt]);

  const forceChoiceInternal = React.useCallback(
    async (key: string) => {
      const snapshot = getState();
      if (!snapshot.prompt) return;
      setState((prev) => ({ ...prev, loading: true }));
      const requestToken = beginRequestToken();
      const controller = startRequestController();
      try {
        const payload = await callAiPrompt({
          message: snapshot.prompt,
          options: { force: key },
          ...(snapshot.rawPost ? { post: snapshot.rawPost } : {}),
          history: snapshot.history,
          ...(snapshot.threadId ? { threadId: snapshot.threadId } : {}),
          ...(activeCapsuleId ? { capsuleId: activeCapsuleId } : {}),
          useContext: smartContextEnabled,
          signal: controller.signal,
        });
        if (!isRequestActive(requestToken)) return;
        handleAiResponse(snapshot.prompt, payload);
        clearRequestToken(requestToken);
        clearRequestController(controller);
      } catch (error) {
        console.error("Composer force choice failed", error);
        setState((prev) => ({ ...prev, loading: false }));
        clearRequestToken(requestToken);
        clearRequestController(controller);
      }
    },
    [
      activeCapsuleId,
      beginRequestToken,
      clearRequestController,
      clearRequestToken,
      getState,
      handleAiResponse,
      isRequestActive,
      setState,
      smartContextEnabled,
      startRequestController,
    ],
  );

  const handlePrompterAction = React.useCallback(
    async (action: PrompterAction) => {
      if (action.kind === "post_manual") {
        const content = action.content.trim();
        if (!content && (!action.attachments || !action.attachments.length)) {
          return;
        }
        setState((prev) => ({
          ...prev,
          loading: true,
          backgrounded: false,
          backgroundReadyNotice: null,
          backgroundReminderVisible: false,
        }));
        try {
          const postPayload: Record<string, unknown> = {
            client_id: safeRandomUUID(),
            kind: "text",
            content,
            source: "ai-prompter",
          };
          if (action.attachments?.length) {
            postPayload.attachments = action.attachments;
            const primary = action.attachments[0];
            if (primary?.url) {
              postPayload.mediaUrl = primary.url;
              const primaryMime = primary.mimeType ?? null;
              if (primaryMime) {
                const normalizedKind = primaryMime.startsWith("video/") ? "video" : "image";
                postPayload.kind = normalizedKind;
              } else if (postPayload.kind === "text") {
                postPayload.kind = "image";
              }
            }
          }
          const manualPayload = appendCapsuleContext(postPayload, activeCapsuleId);
          await persistPost(manualPayload, envelopePayload);
          resetComposerState();
          window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "manual" } }));
        } catch (error) {
          console.error("Manual post failed", error);
          setState((prev) => ({
            ...prev,
            loading: false,
            backgrounded: false,
            backgroundReadyNotice: null,
            backgroundReminderVisible: false,
          }));
        }
        return;
      }
      if (action.kind === "style") {
        const heuristicPlan = resolveStylerHeuristicPlan(action.prompt);
        if (heuristicPlan) {
          previewTheme({
            summary: heuristicPlan.summary,
            details: heuristicPlan.details ?? null,
            source: "heuristic",
            variants: heuristicPlan.variants,
          });
          setState((prev) => ({
            ...prev,
            open: true,
            backgrounded: false,
            backgroundReadyNotice: null,
            backgroundReminderVisible: false,
          }));
          return;
        }
        try {
          const response = await callStyler(action.prompt, envelopePayload);
          const normalized = normalizeThemeVariantsInput(response.variants);
          previewTheme({
            summary: response.summary,
            details: response.details ?? null,
            source: response.source,
            variants: normalized,
          });
          setState((prev) => ({
            ...prev,
            open: true,
            backgrounded: false,
            backgroundReadyNotice: null,
            backgroundReminderVisible: false,
          }));
        } catch (error) {
          console.error("Styler action failed", error);
        }
        return;
      }
      if (action.kind === "tool_poll") {
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.prompt,
          options: { prefer: "poll", extras: { replyMode: "draft" } },
        });
        return;
      }
      if (action.kind === "tool_logo") {
        await handlePrompterHandoff({ intent: "image_logo", prompt: action.prompt });
        return;
      }
      if (action.kind === "tool_image_edit") {
        const attachment = action.attachments?.[0];
        if (!attachment) return;
        await handlePrompterHandoff({ intent: "image_edit", prompt: action.prompt, reference: attachment });
        return;
      }
      if (action.kind === "post_ai") {
        const attachments = action.attachments && action.attachments.length ? action.attachments : undefined;
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.prompt,
          ...(attachments ? { attachments } : {}),
          options: { composeMode: action.mode, extras: { replyMode: "draft" } },
        });
        return;
      }
      if (action.kind === "generate") {
        const attachments = action.attachments && action.attachments.length ? action.attachments : undefined;
        await handlePrompterHandoff({
          intent: "ai_prompt",
          prompt: action.text,
          ...(attachments ? { attachments } : {}),
          options: { extras: { replyMode: "chat" } },
        });
        return;
      }
    },
    [
      activeCapsuleId,
      envelopePayload,
      handlePrompterHandoff,
      previewTheme,
      resetComposerState,
      setState,
    ],
  );

  return {
    handlePrompterAction,
    handlePrompterHandoff,
    submitPrompt,
    retryVideo,
    retryLastPrompt,
    forceChoice: forceChoiceInternal,
  };
}
