"use client";

import * as React from "react";

import type {
  CommentAttachment,
  CommentModel,
  CommentSubmitPayload,
  CommentThreadState,
} from "@/components/comments/types";
import { safeRandomUUID } from "@/lib/random";
import type { AuthClientUser } from "@/ports/auth-client";

type UseFeedCommentsOptions = {
  currentUser: AuthClientUser | null;
  viewerUserId: string | null;
  viewerEnvelope: Record<string, unknown> | null;
};

type FeedCommentsResult = {
  commentThreads: Record<string, CommentThreadState>;
  commentSubmitting: Record<string, boolean>;
  loadComments(postId: string): Promise<void>;
  submitComment(payload: CommentSubmitPayload): Promise<void>;
};

function createEmptyThreadState(): CommentThreadState {
  return { status: "idle", comments: [], error: null };
}

function normalizeCommentFromApi(raw: Record<string, unknown>, fallbackPostId: string): CommentModel {
  const rawId = raw.id;
  const id = typeof rawId === "string" && rawId.trim().length ? rawId.trim() : safeRandomUUID();

  const postIdValue = raw.postId ?? raw.post_id ?? fallbackPostId;
  const postId =
    typeof postIdValue === "string" && postIdValue.trim().length ? postIdValue.trim() : fallbackPostId;

  const content =
    typeof raw.content === "string"
      ? raw.content
      : typeof raw.body === "string"
        ? raw.body
        : "";

  const userName =
    typeof raw.userName === "string"
      ? raw.userName
      : typeof raw.user_name === "string"
        ? raw.user_name
        : null;

  const userAvatar =
    typeof raw.userAvatar === "string"
      ? raw.userAvatar
      : typeof raw.user_avatar === "string"
        ? raw.user_avatar
        : null;

  const userIdCandidate =
    (raw as { userId?: unknown }).userId ?? (raw as { user_id?: unknown }).user_id ?? null;
  const userId =
    typeof userIdCandidate === "string" && userIdCandidate.trim().length
      ? userIdCandidate.trim()
      : null;

  const capsuleId =
    typeof raw.capsuleId === "string"
      ? raw.capsuleId
      : typeof raw.capsule_id === "string"
        ? raw.capsule_id
        : null;

  const tsValue = raw.ts ?? raw.created_at ?? new Date().toISOString();
  const ts = typeof tsValue === "string" && tsValue.trim().length ? tsValue : new Date().toISOString();

  const attachmentsRaw = Array.isArray((raw as { attachments?: unknown }).attachments)
    ? ((raw as { attachments?: unknown[] }).attachments as unknown[])
    : [];

  const attachments = attachmentsRaw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const record = entry as Record<string, unknown>;

      const attachmentId =
        typeof record.id === "string" && record.id.trim().length ? record.id.trim() : safeRandomUUID();

      const url = typeof record.url === "string" && record.url.trim().length ? record.url.trim() : null;
      if (!url) return null;

      const name =
        typeof record.name === "string" && record.name.trim().length ? record.name.trim() : null;

      const mimeType =
        typeof record.mimeType === "string"
          ? record.mimeType
          : typeof record.mime_type === "string"
            ? record.mime_type
            : null;

      const thumbnail =
        typeof record.thumbnailUrl === "string"
          ? record.thumbnailUrl
          : typeof record.thumbnail_url === "string"
            ? record.thumbnail_url
            : null;

      const sizeValue = record.size;
      const size =
        typeof sizeValue === "number" && Number.isFinite(sizeValue)
          ? sizeValue
          : typeof sizeValue === "string"
            ? Number.parseInt(sizeValue, 10) || null
            : null;

      const storageKey =
        typeof record.storageKey === "string"
          ? record.storageKey
          : typeof record.storage_key === "string"
            ? record.storage_key
            : null;

      const sessionId =
        typeof record.sessionId === "string"
          ? record.sessionId
          : typeof record.session_id === "string"
            ? record.session_id
            : null;

      const source =
        typeof record.source === "string" && record.source.trim().length
          ? record.source.trim()
          : null;

      const attachmentRecord: CommentAttachment = {
        id: attachmentId,
        url,
        name,
        mimeType,
        thumbnailUrl: thumbnail,
        size: size ?? null,
        storageKey,
        sessionId,
        source,
      };

      return attachmentRecord;
    })
    .filter((attachment): attachment is CommentAttachment => attachment !== null);

  return {
    id,
    postId,
    content,
    userName,
    userAvatar,
    userId,
    capsuleId,
    ts,
    attachments,
    pending: false,
    error: null,
  };
}

export function useFeedComments({
  currentUser,
  viewerUserId,
  viewerEnvelope,
}: UseFeedCommentsOptions): FeedCommentsResult {
  const [commentThreads, setCommentThreads] = React.useState<Record<string, CommentThreadState>>({});
  const [commentSubmitting, setCommentSubmitting] = React.useState<Record<string, boolean>>({});

  const loadComments = React.useCallback(
    async (postId: string) => {
      setCommentThreads((previous) => {
        const prevState = previous[postId] ?? createEmptyThreadState();
        return {
          ...previous,
          [postId]: { ...prevState, status: "loading", error: null },
        };
      });

      try {
        const response = await fetch(`/api/comments?postId=${encodeURIComponent(postId)}`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Failed to load comments.");
        }

        const payload = (await response.json().catch(() => null)) as { comments?: unknown[] } | null;
        const comments = Array.isArray(payload?.comments)
          ? payload!.comments
              .map((entry) =>
                entry && typeof entry === "object"
                  ? normalizeCommentFromApi(entry as Record<string, unknown>, postId)
                  : null,
              )
              .filter((entry): entry is CommentModel => Boolean(entry))
          : [];

        setCommentThreads((previous) => ({
          ...previous,
          [postId]: { status: "loaded", comments, error: null },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load comments.";
        setCommentThreads((previous) => {
          const prevState = previous[postId] ?? createEmptyThreadState();
          if (prevState.comments.length) {
            return {
              ...previous,
              [postId]: { status: "loaded", comments: prevState.comments, error: message },
            };
          }
          return {
            ...previous,
            [postId]: { status: "error", comments: [], error: message },
          };
        });

        throw error;
      }
    },
    [],
  );

  const submitComment = React.useCallback(
    async (payload: CommentSubmitPayload) => {
      const optimistic: CommentModel = {
        id: payload.clientId,
        postId: payload.postId,
        content: payload.content,
        userName: payload.userName ?? currentUser?.name ?? currentUser?.email ?? "You",
        userAvatar: payload.userAvatar ?? currentUser?.avatarUrl ?? null,
        capsuleId: payload.capsuleId ?? null,
        ts: payload.ts,
        attachments: payload.attachments,
        userId: viewerUserId,
        pending: true,
        error: null,
      };

      setCommentThreads((previous) => {
        const prevState = previous[payload.postId] ?? createEmptyThreadState();
        return {
          ...previous,
          [payload.postId]: {
            status: "loaded",
            comments: [...prevState.comments, optimistic],
            error: null,
          },
        };
      });

      setCommentSubmitting((previous) => ({ ...previous, [payload.postId]: true }));

      try {
        const response = await fetch("/api/comments", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comment: {
              id: payload.clientId,
              postId: payload.postId,
              content: payload.content,
              attachments: payload.attachments,
              capsuleId: payload.capsuleId ?? null,
              capsule_id: payload.capsuleId ?? null,
              ts: payload.ts,
              userName: payload.userName ?? currentUser?.name ?? currentUser?.email ?? null,
              userAvatar: payload.userAvatar ?? currentUser?.avatarUrl ?? null,
              source: "web",
            },
            user: viewerEnvelope,
          }),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Failed to submit comment.");
        }

        const json = (await response.json().catch(() => null)) as { comment?: unknown } | null;
        const persisted =
          json?.comment && typeof json.comment === "object"
            ? normalizeCommentFromApi(json.comment as Record<string, unknown>, payload.postId)
            : { ...optimistic, pending: false };

        setCommentThreads((previous) => {
          const prevState = previous[payload.postId] ?? createEmptyThreadState();
          const comments = prevState.comments.map((entry) =>
            entry.id === payload.clientId ? { ...persisted, pending: false } : entry,
          );

          return {
            ...previous,
            [payload.postId]: { status: "loaded", comments, error: null },
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to submit comment.";
        setCommentThreads((previous) => {
          const prevState = previous[payload.postId] ?? createEmptyThreadState();
          const comments = prevState.comments.filter((entry) => entry.id !== payload.clientId);

          return {
            ...previous,
            [payload.postId]: {
              status: "error",
              comments,
              error: message,
            },
          };
        });

        throw error;
      } finally {
        setCommentSubmitting((previous) => {
          const next = { ...previous };
          delete next[payload.postId];
          return next;
        });
      }
    },
    [currentUser?.avatarUrl, currentUser?.email, currentUser?.name, viewerEnvelope, viewerUserId],
  );

  return {
    commentThreads,
    commentSubmitting,
    loadComments,
    submitComment,
  };
}
