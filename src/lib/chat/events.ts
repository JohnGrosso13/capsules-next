import { z } from "zod";

export const chatSessionTypeSchema = z.enum(["direct", "group"]);

export const chatParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().nullable(),
});

export const chatMessageAttachmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int().nonnegative().optional(),
  url: z.string(),
  thumbnailUrl: z.string().nullable().optional(),
  storageKey: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
});

export const chatReactionSummarySchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative().optional(),
  users: z.array(chatParticipantSchema).optional(),
});

export const chatSessionDescriptorSchema = z.object({
  id: z.string(),
  type: chatSessionTypeSchema,
  title: z.string(),
  avatar: z.string().nullable(),
  createdBy: z.string().nullable(),
  participants: z.array(chatParticipantSchema),
});

const chatSessionMetaSchema = z
  .object({
    type: chatSessionTypeSchema.optional(),
    title: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    createdBy: z.string().nullable().optional(),
  })
  .optional();

export const chatMessageEventSchema = z.object({
  type: z.literal("chat.message"),
  conversationId: z.string(),
  senderId: z.string(),
  participants: z.array(chatParticipantSchema),
  session: chatSessionMetaSchema,
  message: z.object({
    id: z.string(),
    body: z.string(),
    sentAt: z.string(),
    reactions: z.array(chatReactionSummarySchema).optional(),
    attachments: z.array(chatMessageAttachmentSchema).optional(),
    taskId: z.string().nullable().optional(),
    taskTitle: z.string().nullable().optional(),
  }),
});

export const chatMessageUpdatedEventSchema = z.object({
  type: z.literal("chat.message.update"),
  conversationId: z.string(),
  messageId: z.string(),
  body: z.string(),
  attachments: z.array(chatMessageAttachmentSchema),
  participants: z.array(chatParticipantSchema).optional(),
  senderId: z.string().optional(),
  sentAt: z.string().optional(),
  session: chatSessionMetaSchema,
  taskId: z.string().nullable().optional(),
  taskTitle: z.string().nullable().optional(),
});

export const chatMessageDeletedEventSchema = z.object({
  type: z.literal("chat.message.delete"),
  conversationId: z.string(),
  messageId: z.string(),
  participants: z.array(chatParticipantSchema).optional(),
  session: chatSessionMetaSchema,
});

export const chatReactionEventSchema = z.object({
  type: z.literal("chat.reaction"),
  conversationId: z.string(),
  messageId: z.string(),
  emoji: z.string(),
  action: z.enum(["added", "removed"]),
  actor: chatParticipantSchema,
  reactions: z.array(chatReactionSummarySchema),
  participants: z.array(chatParticipantSchema).optional(),
});

export const chatSessionEventSchema = z.object({
  type: z.literal("chat.session"),
  conversationId: z.string(),
  session: chatSessionDescriptorSchema,
});

export type ChatSessionType = z.infer<typeof chatSessionTypeSchema>;
export type ChatParticipant = z.infer<typeof chatParticipantSchema>;
export type ChatMessageAttachment = z.infer<typeof chatMessageAttachmentSchema>;
export type ChatReactionSummary = z.infer<typeof chatReactionSummarySchema>;
export type ChatSessionDescriptor = z.infer<typeof chatSessionDescriptorSchema>;
export type ChatMessageEventPayload = z.infer<typeof chatMessageEventSchema>;
export type ChatMessageUpdatedEventPayload = z.infer<typeof chatMessageUpdatedEventSchema>;
export type ChatMessageDeletedEventPayload = z.infer<typeof chatMessageDeletedEventSchema>;
export type ChatReactionEventPayload = z.infer<typeof chatReactionEventSchema>;
export type ChatSessionEventPayload = z.infer<typeof chatSessionEventSchema>;
