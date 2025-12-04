import * as React from "react";

import {
  sanitizeComposerChatAttachment,
  sanitizeComposerChatHistory,
  type ComposerChatAttachment,
  type ComposerChatMessage,
} from "@/lib/composer/chat-types";
import { normalizeDraftFromPost } from "@/lib/composer/normalizers";
import type { ComposerDraft } from "@/lib/composer/draft";
import type { PromptResponse } from "@/shared/schemas/ai";
import { safeRandomUUID } from "@/lib/random";
import { appendCapsuleContext, mergeComposerChatHistory, mergeComposerRawPost } from "./ai-shared";
import { mergeComposerDrafts } from "./draft-merge";
import type { ComposerState } from "../ComposerProvider";

type PromptRunMode = "default" | "chatOnly";

export type ComposerAiApplyResult = {
  history: ComposerChatMessage[];
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  threadId: string | null;
  message: string | null;
};

type UseComposerAiOptions = {
  activeCapsuleId: string | null;
  setState: React.Dispatch<React.SetStateAction<ComposerState>>;
  shouldPreservePollOptions: (prompt: string, prevDraft: ComposerDraft | null) => boolean;
};

export function useComposerAi({
  activeCapsuleId,
  setState,
  shouldPreservePollOptions,
}: UseComposerAiOptions) {
  return React.useCallback(
    (
      prompt: string,
      payload: PromptResponse,
      mode: PromptRunMode = "default",
    ): ComposerAiApplyResult | null => {
      const replyAttachments: ComposerChatAttachment[] | null =
        payload.action === "chat_reply" && Array.isArray(payload.replyAttachments)
          ? payload.replyAttachments
              .map((attachment) => sanitizeComposerChatAttachment(attachment))
              .filter((attachment): attachment is ComposerChatAttachment => Boolean(attachment))
          : null;
      const isDraftResponse = payload.action === "draft_post";
      const rawSource =
        isDraftResponse && payload.post && typeof payload.post === "object"
          ? (payload.post as Record<string, unknown>)
          : null;
      const rawPost = rawSource ? appendCapsuleContext({ ...rawSource }, activeCapsuleId) : null;
      const baseDraftForKind = isDraftResponse
        ? normalizeDraftFromPost(rawPost ?? {})
        : normalizeDraftFromPost({});
      const normalizedHistory = sanitizeComposerChatHistory(payload.history ?? []);
      const draftPayloadPost =
        isDraftResponse && typeof payload.post === "object"
          ? ((payload.post as Record<string, unknown>) ?? null)
          : null;
      const draftPostContent =
        mode === "chatOnly" &&
        draftPayloadPost &&
        typeof (draftPayloadPost as { content?: unknown }).content === "string" &&
        (draftPayloadPost as { content: string }).content.trim().length
          ? ((draftPayloadPost as { content: string }).content ?? "").trim()
          : null;

      let messageText =
        typeof payload.message === "string" && payload.message.trim().length
          ? payload.message.trim()
          : null;
      if (draftPostContent) {
        messageText = messageText ? `${messageText}\n\n${draftPostContent}` : draftPostContent;
      }

      let recordedHistory: ComposerChatMessage[] = [];
      let recordedThreadId: string | null = null;
      let recordedDraft: ComposerDraft | null = null;
      let recordedRawPost: Record<string, unknown> | null = null;
      const applyDraftUpdates = mode !== "chatOnly" && isDraftResponse;

      setState((prev) => {
        const nextThreadId = payload.threadId ?? prev.threadId ?? safeRandomUUID();
        let historyForState = mergeComposerChatHistory(prev.history, normalizedHistory);
        if (mode === "chatOnly" && messageText) {
          const safeMessageText = messageText;
          const lastIndex = historyForState.length - 1;
          const lastEntry = lastIndex >= 0 ? historyForState[lastIndex] : null;
          const attachmentsForMessage =
            replyAttachments && replyAttachments.length
              ? replyAttachments
              : (lastEntry?.attachments as ComposerChatAttachment[] | null) ?? null;
          if (lastEntry && lastEntry.role === "assistant") {
            const updatedHistory = historyForState.map(
              (entry: ComposerChatMessage, index: number) =>
                index === lastIndex
                  ? { ...entry, content: safeMessageText, attachments: attachmentsForMessage }
                  : entry,
            );
            historyForState = updatedHistory;
          } else {
            historyForState = [
              ...historyForState,
              {
                id: safeRandomUUID(),
                role: "assistant",
                content: safeMessageText,
                createdAt: new Date().toISOString(),
                attachments: attachmentsForMessage && attachmentsForMessage.length ? attachmentsForMessage : null,
              },
            ];
          }
        }
        recordedHistory = historyForState;
        recordedThreadId = nextThreadId;
        const preserveOptions =
          applyDraftUpdates && shouldPreservePollOptions(prompt, prev.draft ?? null);
        let mergedDraft: ComposerDraft | null = prev.draft ?? null;
        let mergedRawPost: Record<string, unknown> | null;
        if (applyDraftUpdates) {
          const draftForMerge = mergeComposerDrafts(prev.draft, baseDraftForKind, {
            preservePollOptions: preserveOptions,
          });
          mergedDraft = draftForMerge;
          mergedRawPost = mergeComposerRawPost(rawPost, draftForMerge);
        } else {
          mergedRawPost = prev.rawPost ?? rawPost ?? null;
        }

        if (applyDraftUpdates) {
          const draftKind = (mergedDraft?.kind ?? baseDraftForKind.kind ?? "text").toLowerCase();
          const mergedHasContent =
            typeof mergedDraft?.content === "string" && mergedDraft.content.trim().length > 0;
          const rawContainer = (mergedRawPost ?? {}) as { content?: unknown };
          const rawHasContent =
            typeof rawContainer.content === "string" &&
            Boolean(((rawContainer as { content?: string }).content ?? "").trim().length);
          const candidateMessage =
            typeof messageText === "string" && messageText.trim().length ? messageText.trim() : null;
          const fallbackContent =
            draftKind === "text" &&
            !mergedHasContent &&
            !rawHasContent &&
            candidateMessage &&
            candidateMessage.length >= 8
              ? candidateMessage
              : null;
          if (fallbackContent) {
            const content = fallbackContent;
            mergedDraft = { ...(mergedDraft ?? baseDraftForKind), content };
            mergedRawPost = { ...(mergedRawPost ?? rawPost ?? {}), content };
          }
        }
        recordedDraft = mergedDraft;
        recordedRawPost = mergedRawPost;
        const rawContainer = (mergedRawPost ?? {}) as Record<string, unknown>;
        const rawVideoRunId =
          typeof (rawContainer as { video_run_id?: unknown }).video_run_id === "string"
            ? (((rawContainer as { video_run_id: string }).video_run_id ?? "").trim() || null)
            : typeof (rawContainer as { videoRunId?: unknown }).videoRunId === "string"
              ? (((rawContainer as { videoRunId: string }).videoRunId ?? "").trim() || null)
              : null;
        const rawVideoRunStatus =
          typeof (rawContainer as { video_run_status?: unknown }).video_run_status === "string"
            ? (((rawContainer as { video_run_status: string }).video_run_status ?? "")
                .trim()
                .toLowerCase() || null)
            : typeof (rawContainer as { videoRunStatus?: unknown }).videoRunStatus === "string"
              ? (((rawContainer as { videoRunStatus: string }).videoRunStatus ?? "")
                  .trim()
                  .toLowerCase() || null)
              : null;
        const rawVideoRunError =
          typeof (rawContainer as { video_run_error?: unknown }).video_run_error === "string"
            ? (((rawContainer as { video_run_error: string }).video_run_error ?? "").trim() || null)
            : typeof (rawContainer as { videoRunError?: unknown }).videoRunError === "string"
              ? (((rawContainer as { videoRunError: string }).videoRunError ?? "").trim() || null)
              : null;
        const rawMemoryId =
          typeof (rawContainer as { memory_id?: unknown }).memory_id === "string"
            ? (((rawContainer as { memory_id: string }).memory_id ?? "").trim() || null)
            : typeof (rawContainer as { memoryId?: unknown }).memoryId === "string"
              ? (((rawContainer as { memoryId: string }).memoryId ?? "").trim() || null)
              : null;
        const resolvedRunId = mergedDraft?.videoRunId ?? rawVideoRunId ?? prev.videoStatus.runId;
        const normalizedRunStatus = (() => {
          const candidate = mergedDraft?.videoRunStatus ?? rawVideoRunStatus;
          if (!candidate) return null;
          const lowered = candidate.toLowerCase();
          if (lowered === "pending" || lowered === "running") return "running" as const;
          if (lowered === "succeeded" || lowered === "failed") {
            return lowered as "succeeded" | "failed";
          }
          return null;
        })();
        let nextVideoStatus = prev.videoStatus;
        if (applyDraftUpdates) {
          if (normalizedRunStatus === "succeeded") {
            nextVideoStatus = {
              state: "succeeded",
              runId: resolvedRunId ?? null,
              prompt,
              attachments: prev.videoStatus.attachments,
              error: null,
              message: messageText,
              memoryId: mergedDraft?.memoryId ?? rawMemoryId ?? prev.videoStatus.memoryId ?? null,
            };
          } else if (normalizedRunStatus === "failed") {
            const errorText =
              mergedDraft?.videoRunError ??
              rawVideoRunError ??
              prev.videoStatus.error ??
              "Video generation failed.";
            nextVideoStatus = {
              state: "failed",
              runId: resolvedRunId ?? null,
              prompt,
              attachments: prev.videoStatus.attachments,
              error: errorText,
              message: messageText,
              memoryId: mergedDraft?.memoryId ?? rawMemoryId ?? prev.videoStatus.memoryId ?? null,
            };
          } else if (normalizedRunStatus === "running") {
            nextVideoStatus = {
              state: "running",
              runId: resolvedRunId ?? null,
              prompt,
              attachments: prev.videoStatus.attachments,
              error: null,
              message: messageText,
              memoryId: mergedDraft?.memoryId ?? rawMemoryId ?? prev.videoStatus.memoryId ?? null,
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
        }

        const nextSnapshot =
          payload.context && payload.context.enabled
            ? {
                query: payload.context.query ?? null,
                memoryIds: payload.context.memoryIds ?? [],
                snippets: (payload.context.snippets ?? []).map((snippet) => ({
                  id: snippet.id,
                  title: snippet.title ?? null,
                  snippet: snippet.snippet,
                  source: snippet.source ?? null,
                  kind: snippet.kind ?? null,
                  url: snippet.url ?? null,
                  highlightHtml: snippet.highlightHtml ?? null,
                  tags: Array.isArray(snippet.tags) ? snippet.tags : [],
                })),
                userCard: payload.context.userCard ?? null,
              }
            : null;

        const shouldHoldClosed = prev.backgrounded && !prev.open;
        const readyKind =
          nextVideoStatus.state === "succeeded"
            ? "video"
            : ((mergedDraft?.kind ?? baseDraftForKind.kind ?? "text") as string).toLowerCase() === "image"
              ? "image"
              : "text";
        const readyNotice =
          shouldHoldClosed && nextVideoStatus.state !== "running"
            ? ({
                kind: readyKind as "image" | "video" | "text",
                label:
                readyKind === "video"
                  ? "Video ready"
                  : readyKind === "image"
                    ? "Image ready"
                    : "Draft ready",
                threadId: nextThreadId,
              } as const)
            : null;

        return {
          ...prev,
          open: shouldHoldClosed ? prev.open : true,
          loading: false,
          loadingKind: null,
          prompt,
          draft: mergedDraft,
          rawPost: mergedRawPost,
          message: messageText,
          choices: applyDraftUpdates ? payload.choices ?? null : prev.choices,
          history: historyForState,
          threadId: nextThreadId,
          videoStatus: nextVideoStatus,
          contextSnapshot: nextSnapshot,
          backgrounded: shouldHoldClosed,
          backgroundReadyNotice: readyNotice,
          backgroundReminderVisible: shouldHoldClosed ? false : prev.backgroundReminderVisible,
        };
      });

      return {
        history: recordedHistory,
        draft: recordedDraft,
        rawPost: recordedRawPost,
        threadId: recordedThreadId,
        message: messageText,
      };
    },
    [activeCapsuleId, setState, shouldPreservePollOptions],
  );
}
