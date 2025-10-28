"use client";

export type CommentAttachment = {
  id: string;
  url: string;
  name: string | null;
  mimeType: string | null;
  thumbnailUrl: string | null;
  size?: number | null;
  storageKey?: string | null;
  sessionId?: string | null;
  source?: string | null;
};

export type CommentModel = {
  id: string;
  postId: string;
  content: string;
  userName: string | null;
  userAvatar: string | null;
  capsuleId: string | null;
  ts: string;
  attachments: CommentAttachment[];
  userId?: string | null;
  pending?: boolean;
  error?: string | null;
};

export type CommentSubmitPayload = {
  clientId: string;
  postId: string;
  content: string;
  attachments: CommentAttachment[];
  capsuleId?: string | null;
  userName?: string | null;
  userAvatar?: string | null;
  ts: string;
};

export type CommentThreadState = {
  status: "idle" | "loading" | "loaded" | "error";
  comments: CommentModel[];
  error: string | null;
};

export const EMPTY_THREAD_STATE: CommentThreadState = {
  status: "idle",
  comments: [],
  error: null,
};
