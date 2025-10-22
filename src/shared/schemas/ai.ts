import { z } from "zod";

export const intentResponseSchema = z.object({
  intent: z.enum(["generate", "post", "navigate", "style"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  source: z.enum(["heuristic", "ai", "none"]).optional(),
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
});

export const composerChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string(),
  attachments: z.array(composerAttachmentSchema).optional().nullable(),
});

export const draftPostResponseSchema = z.object({
  action: z.literal("draft_post"),
  message: z.string().optional(),
  post: z.record(z.string(), z.unknown()),
  choices: z.array(draftChoiceSchema).optional(),
  threadId: z.string().optional(),
  history: z.array(composerChatMessageSchema).optional(),
});
export type DraftPostResponse = z.infer<typeof draftPostResponseSchema>;
export type ComposerChatMessage = z.infer<typeof composerChatMessageSchema>;
export type ComposerAttachment = z.infer<typeof composerAttachmentSchema>;

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
