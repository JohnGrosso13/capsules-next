import { z } from "zod";

export const intentResponseSchema = z.object({
  intent: z.enum(["chat", "generate", "post", "navigate", "style"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  source: z.enum(["heuristic", "ai", "none"]).optional(),
  postMode: z.enum(["ai", "manual"]).optional(),
});
export type IntentResponse = z.infer<typeof intentResponseSchema>;

export const draftChoiceSchema = z.object({ key: z.string(), label: z.string() });

export const composerAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().min(0),
  url: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  storageKey: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  role: z.enum(["reference", "output"]).optional(),
  source: z.string().nullable().optional(),
  excerpt: z.string().nullable().optional(),
});

export const composerChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string(),
  attachments: z.array(composerAttachmentSchema).optional().nullable(),
});

const promptContextSnippetSchema = z.object({
  id: z.string(),
  title: z.string().optional().nullable(),
  snippet: z.string(),
  source: z.string().optional().nullable(),
  kind: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  highlightHtml: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

const promptContextSchema = z.object({
  enabled: z.boolean(),
  query: z.string().optional().nullable(),
  memoryIds: z.array(z.string()).optional(),
  snippets: z.array(promptContextSnippetSchema).optional(),
  userCard: z.string().optional().nullable(),
});

const promptResponseMetaFields = {
  threadId: z.string().optional(),
  history: z.array(composerChatMessageSchema).optional(),
  context: promptContextSchema.optional(),
} as const;
const _promptResponseMetaSchema = z.object(promptResponseMetaFields);

export const draftPostResponseSchema = z.object({
  action: z.literal("draft_post"),
  message: z.string().optional(),
  post: z.record(z.string(), z.unknown()),
  choices: z.array(draftChoiceSchema).optional(),
  ...promptResponseMetaFields,
});
export type DraftPostResponse = z.infer<typeof draftPostResponseSchema>;

export const chatReplyResponseSchema = z.object({
  action: z.literal("chat_reply"),
  message: z.string().min(1),
  replyAttachments: z.array(composerAttachmentSchema).optional(),
  ...promptResponseMetaFields,
});
export type ChatReplyResponse = z.infer<typeof chatReplyResponseSchema>;

export type ComposerChatMessage = z.infer<typeof composerChatMessageSchema>;
export type ComposerAttachment = z.infer<typeof composerAttachmentSchema>;

export const aiImageVariantSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid().nullable(),
  ownerUserId: z.string().uuid().nullable(),
  capsuleId: z.string().uuid().nullable(),
  assetKind: z.string(),
  branchKey: z.string(),
  version: z.number().int().min(1),
  imageUrl: z.string(),
  thumbUrl: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  parentVariantId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type AiImageVariant = z.infer<typeof aiImageVariantSchema>;

export const promptResponseSchema = z.discriminatedUnion("action", [
  draftPostResponseSchema,
  chatReplyResponseSchema,
]);
export type PromptResponse = z.infer<typeof promptResponseSchema>;
export type PromptContext = z.infer<typeof promptContextSchema>;

const variantMapSchema = z.record(z.string(), z.string());
const stylerVariantsSchema = z.object({
  light: variantMapSchema.optional(),
  dark: variantMapSchema.optional(),
});

export const stylerResponseSchema = z.object({
  status: z.literal("ok"),
  source: z.union([z.literal("heuristic"), z.literal("ai")]),
  summary: z.string(),
  variants: stylerVariantsSchema,
  details: z.string().optional(),
});
export type StylerResponse = z.infer<typeof stylerResponseSchema>;
