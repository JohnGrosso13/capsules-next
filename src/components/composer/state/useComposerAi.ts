import * as React from "react";

import { sanitizeComposerChatHistory, type ComposerChatMessage } from "@/lib/composer/chat-types";
import { normalizeDraftFromPost } from "@/lib/composer/normalizers";
import type { ComposerDraft } from "@/lib/composer/draft";
import type { PromptResponse } from "@/shared/schemas/ai";
import { safeRandomUUID } from "@/lib/random";
import {
  appendCapsuleContext,
  IMAGE_INTENT_REGEX,
  mergeComposerChatHistory,
  mergeComposerRawPost,
} from "./ai-shared";
import { mergeComposerDrafts } from "./draft-merge";
import type { ComposerState } from "../ComposerProvider";

type PromptRunMode = "default" | "chatOnly";

export type ComposerAiApplyResult = {
  history: ComposerChatMessage[];
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  threadId: string | null;
  resolvedQuestionId: string | null;
  fallbackImagePrompt: string | null;
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
      if (payload.action === "clarify_image_prompt") {
        const normalizedHistory = sanitizeComposerChatHistory(payload.history ?? []);
        setState((prev) => {
          const nextThreadId = payload.threadId ?? prev.threadId ?? safeRandomUUID();
          const historyForState = mergeComposerChatHistory(prev.history, normalizedHistory);
          return {
            ...prev,
            open: true,
            loading: false,
            prompt,
            message: payload.question,
            choices: null,
            history: historyForState,
            threadId: nextThreadId,
            clarifier: {
              questionId: payload.questionId,
              question: payload.question,
              rationale: payload.rationale ?? null,
              suggestions: [...(payload.suggestions ?? [])],
              styleTraits: [...(payload.styleTraits ?? [])],
            },
          };
        });
        return null;
      }

      const rawSource = (payload.post ?? {}) as Record<string, unknown>;
      const rawPost = appendCapsuleContext({ ...rawSource }, activeCapsuleId);
      const baseDraftForKind = normalizeDraftFromPost(rawPost);
      const normalizedHistory = sanitizeComposerChatHistory(payload.history ?? []);
      const isDraftResponse = (payload as { action?: string }).action === "draft_post";
      const draftPayloadPost =
        isDraftResponse && typeof (payload as { post?: unknown }).post === "object"
          ? ((payload as { post?: Record<string, unknown> | null }).post ?? null)
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
      let resolvedQuestionId: string | null = null;
      let recordedDraft: ComposerDraft | null = null;
      let recordedRawPost: Record<string, unknown> | null = null;
      const applyDraftUpdates = mode !== "chatOnly";
      let fallbackImagePrompt: string | null = null;

      setState((prev) => {
        const nextThreadId = payload.threadId ?? prev.threadId ?? safeRandomUUID();
        let historyForState = mergeComposerChatHistory(prev.history, normalizedHistory);
        if (mode === "chatOnly" && messageText) {
          const safeMessageText = messageText;
          const lastIndex = historyForState.length - 1;
          const lastEntry = lastIndex >= 0 ? historyForState[lastIndex] : null;
          if (lastEntry && lastEntry.role === "assistant") {
            const updatedHistory = historyForState.map(
              (entry: ComposerChatMessage, index: number) =>
                index === lastIndex ? { ...entry, content: safeMessageText } : entry,
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
                attachments: null,
              },
            ];
          }
        }
        recordedHistory = historyForState;
        recordedThreadId = nextThreadId;
        if (prev.clarifier?.questionId) {
          resolvedQuestionId = prev.clarifier.questionId;
        }
        const preserveOptions =
          applyDraftUpdates && shouldPreservePollOptions(prompt, prev.draft ?? null);
        let mergedDraft: ComposerDraft | null = prev.draft ?? null;
        let mergedRawPost: Record<string, unknown> | null;
        if (applyDraftUpdates) {
          const draftForMerge = mergeComposerDrafts(prev.draft, baseDraftForKind, {
            preservePollOptions: preserveOptions,
          });
          mergedDraft = draftForMerge;
          mergedRawPost = mergeComposerRawPost(prev.rawPost ?? null, rawPost, draftForMerge);
          const mergedKind = (draftForMerge.kind ?? "").toLowerCase();
          const baseKind = (baseDraftForKind.kind ?? "").toLowerCase();
          const expectsImage =
            mergedKind === "image" ||
            baseKind === "image" ||
            Boolean(prev.clarifier?.questionId) ||
            IMAGE_INTENT_REGEX.test(prompt);
          const baseHasMediaUrl =
            typeof baseDraftForKind.mediaUrl === "string" &&
            baseDraftForKind.mediaUrl.trim().length > 0;
          if (expectsImage && !baseHasMediaUrl) {
            const candidate =
              typeof baseDraftForKind.mediaPrompt === "string"
                ? baseDraftForKind.mediaPrompt.trim()
                : "";
            if (candidate) {
              fallbackImagePrompt = candidate;
            }
          }
        } else {
          mergedRawPost = prev.rawPost ?? rawPost ?? null;
        }

        const wasClarifier = Boolean(prev.clarifier?.questionId);
        const willBeImage =
          (mergedDraft?.kind ?? baseDraftForKind.kind ?? "").toLowerCase() === "image";
        if (wasClarifier && willBeImage) {
          const lower = (messageText ?? "").toLowerCase();
          if (!lower || lower.includes("post")) {
            messageText = "Got it! I'll work on that visual for you.";
          }
        }

        if (applyDraftUpdates) {
          const draftKind = (mergedDraft?.kind ?? baseDraftForKind.kind ?? "text").toLowerCase();
          const mergedHasContent =
            typeof mergedDraft?.content === "string" && mergedDraft.content.trim().length > 0;
          const rawHasContent =
            typeof (mergedRawPost as { content?: unknown })?.content === "string" &&
            Boolean(((mergedRawPost as { content?: string }).content ?? "").trim().length);
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
        const rawVideoRunId =
          typeof (mergedRawPost as { video_run_id?: unknown }).video_run_id === "string"
            ? ((mergedRawPost as { video_run_id: string }).video_run_id ?? "").trim() || null
            : typeof (mergedRawPost as { videoRunId?: unknown }).videoRunId === "string"
              ? ((mergedRawPost as { videoRunId: string }).videoRunId ?? "").trim() || null
              : null;
        const rawVideoRunStatus =
          typeof (mergedRawPost as { video_run_status?: unknown }).video_run_status === "string"
            ? ((mergedRawPost as { video_run_status: string }).video_run_status ?? "")
                .trim()
                .toLowerCase() || null
            : typeof (mergedRawPost as { videoRunStatus?: unknown }).videoRunStatus === "string"
              ? ((mergedRawPost as { videoRunStatus: string }).videoRunStatus ?? "")
                  .trim()
                  .toLowerCase() || null
              : null;
        const rawVideoRunError =
          typeof (mergedRawPost as { video_run_error?: unknown }).video_run_error === "string"
            ? ((mergedRawPost as { video_run_error: string }).video_run_error ?? "").trim() || null
            : typeof (mergedRawPost as { videoRunError?: unknown }).videoRunError === "string"
              ? ((mergedRawPost as { videoRunError: string }).videoRunError ?? "").trim() || null
              : null;
        const rawMemoryId =
          typeof (mergedRawPost as { memory_id?: unknown }).memory_id === "string"
            ? ((mergedRawPost as { memory_id: string }).memory_id ?? "").trim() || null
            : typeof (mergedRawPost as { memoryId?: unknown }).memoryId === "string"
              ? ((mergedRawPost as { memoryId: string }).memoryId ?? "").trim() || null
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

        return {
          ...prev,
          open: true,
          loading: false,
          prompt,
          draft: mergedDraft,
          rawPost: mergedRawPost,
          message: messageText,
          choices: applyDraftUpdates ? payload.choices ?? null : prev.choices,
          history: historyForState,
          threadId: nextThreadId,
          clarifier: null,
          videoStatus: nextVideoStatus,
          contextSnapshot: nextSnapshot,
        };
      });

      if (resolvedQuestionId) {
        console.info("image_clarifier_resolved", {
          questionId: resolvedQuestionId,
          prompt,
        });
      }

      return {
        history: recordedHistory,
        draft: recordedDraft,
        rawPost: recordedRawPost,
        threadId: recordedThreadId,
        resolvedQuestionId,
        fallbackImagePrompt,
        message: messageText,
      };
    },
    [activeCapsuleId, setState, shouldPreservePollOptions],
  );
}
