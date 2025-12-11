import { z } from "zod";

import { getDatabaseAdminClient } from "@/config/database";
import { sanitizeComposerChatHistory, type ComposerChatMessage } from "@/lib/composer/chat-types";
import { safeRandomUUID } from "@/lib/random";
import { composerChatMessageSchema } from "@/shared/schemas/ai";

const draftRowSchema = z.object({
  id: z.string(),
  project_id: z.string().uuid().nullable(),
  thread_id: z.string(),
  prompt: z.string(),
  message: z.string().nullable(),
  draft: z.unknown(),
  raw_post: z.unknown().nullable(),
  history: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const draftResponseSchema = z.object({
  id: z.string(),
  projectId: z.string().uuid().nullable(),
  threadId: z.string(),
  prompt: z.string(),
  message: z.string().nullable(),
  draft: z.unknown(),
  rawPost: z.unknown().nullable(),
  history: z.array(composerChatMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ComposerDraftRecord = z.infer<typeof draftResponseSchema>;

const savePayloadSchema = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid().nullable().optional(),
  threadId: z.string().optional(),
  prompt: z.string().default(""),
  message: z.string().nullable().optional(),
  draft: z.unknown().default({}),
  rawPost: z.unknown().nullable().optional(),
  history: z.array(composerChatMessageSchema).default([]),
});

function mapRowToDraft(row: unknown): ComposerDraftRecord {
  const parsed = draftRowSchema.parse(row);
  const history = sanitizeComposerChatHistory((parsed.history as ComposerChatMessage[] | null) ?? []);
  return {
    id: parsed.id,
    projectId: parsed.project_id,
    threadId: parsed.thread_id,
    prompt: parsed.prompt,
    message: parsed.message,
    draft: parsed.draft ?? {},
    rawPost: parsed.raw_post ?? null,
    history,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}

export async function listComposerDrafts(ownerId: string): Promise<ComposerDraftRecord[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("composer_drafts")
    .select(
      "id, project_id, thread_id, prompt, message, draft, raw_post, history, created_at, updated_at",
    )
    .eq("user_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(100)
    .fetch();

  if (result.error) {
    throw new Error(`composer.drafts.list_failed: ${result.error.message}`);
  }

  return (result.data ?? []).map(mapRowToDraft);
}

export async function saveComposerDraft(
  ownerId: string,
  payload: unknown,
): Promise<ComposerDraftRecord> {
  const parsed = savePayloadSchema.parse(payload ?? {});
  const threadId = (parsed.threadId ?? parsed.id ?? safeRandomUUID()).trim() || safeRandomUUID();
  const history = sanitizeComposerChatHistory(parsed.history ?? []).slice(-50);

  const db = getDatabaseAdminClient();
  const result = await db
    .from("composer_drafts")
    .upsert(
      {
        id: parsed.id ?? safeRandomUUID(),
        user_id: ownerId,
        project_id: parsed.projectId ?? null,
        thread_id: threadId,
        prompt: parsed.prompt ?? "",
        message: parsed.message ?? null,
        draft: parsed.draft ?? {},
        raw_post: parsed.rawPost ?? null,
        history,
      },
      { onConflict: "user_id,thread_id" },
    )
    .select(
      "id, project_id, thread_id, prompt, message, draft, raw_post, history, created_at, updated_at",
    )
    .eq("user_id", ownerId)
    .eq("thread_id", threadId)
    .maybeSingle();

  if (result.error || !result.data) {
    const message = result.error?.message ?? "Unknown draft save failure";
    throw new Error(`composer.drafts.save_failed: ${message}`);
  }

  return mapRowToDraft(result.data);
}

export const composerDraftResponseSchema = z.object({
  drafts: z.array(draftResponseSchema),
});

export const composerDraftSchema = draftResponseSchema;
