"use client";

import { safeRandomUUID } from "@/lib/random";
import type { ComposerDraft } from "@/lib/composer/draft";

import { sanitizePollFromDraft } from "./poll";

type AuthorMeta = { name: string | null; avatar: string | null } | undefined;

export function buildPostPayload(
  draft: ComposerDraft,
  rawPost: Record<string, unknown> | null,
  author?: AuthorMeta,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    client_id: typeof rawPost?.client_id === "string" ? rawPost.client_id : safeRandomUUID(),
    kind: (draft.kind ?? "text").toLowerCase(),
    content: draft.content ?? "",
    source: rawPost?.source ?? "ai-prompter",
  };
  if (author?.name) {
    payload.userName = author.name;
    payload.user_name = author.name;
  }
  if (author?.avatar) {
    payload.userAvatar = author.avatar;
    payload.user_avatar = author.avatar;
  }
  if (draft.title && draft.title.trim()) payload.title = draft.title.trim();
  if (draft.mediaUrl && draft.mediaUrl.trim()) {
    const media = draft.mediaUrl.trim();
    payload.mediaUrl = media;
  }
  if (draft.mediaPrompt && draft.mediaPrompt.trim()) {
    const prompt = draft.mediaPrompt.trim();
    payload.mediaPrompt = prompt;
    payload.media_prompt = prompt;
  }
  const sanitizedPoll = sanitizePollFromDraft(draft);
  if (sanitizedPoll) {
    payload.poll = sanitizedPoll;
  } else {
    delete payload.poll;
  }
  if (rawPost?.capsule_id) payload.capsule_id = rawPost.capsule_id;
  if (rawPost?.capsuleId) payload.capsuleId = rawPost.capsuleId;
  return payload;
}
