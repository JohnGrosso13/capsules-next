import { z } from "zod";

import { requestUserEnvelopeSchema } from "./auth";

export const postsQuerySchema = z.object({
  capsuleId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  before: z.string().trim().min(1).optional(),
  after: z.string().trim().min(1).optional(),
});

export const postPayloadSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, {
    message: "post payload cannot be empty",
  });

export const createPostRequestSchema = requestUserEnvelopeSchema.extend({
  post: postPayloadSchema,
});

const attachmentVariantsSchema = z.object({
  original: z.string(),
  thumb: z.string().nullable().optional(),
  feed: z.string().nullable().optional(),
  full: z.string().nullable().optional(),
});

const attachmentSchema = z.object({
  id: z.string(),
  url: z.string(),
  mimeType: z.string().nullable(),
  name: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  storageKey: z.string().nullable().optional(),
  variants: attachmentVariantsSchema.nullable().optional(),
});

const normalizedPostSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((value) => String(value)),
  dbId: z.string().optional(),
  kind: z.string(),
  content: z.string(),
  mediaUrl: z.string().nullable(),
  mediaPrompt: z.string().nullable(),
  userName: z.string().nullable(),
  userAvatar: z.string().nullable(),
  capsuleId: z.string().nullable(),
  tags: z.array(z.string()).optional(),
  likes: z.number(),
  comments: z.number().optional(),
  hotScore: z.number().optional(),
  rankScore: z.number().optional(),
  ts: z.string(),
  source: z.string(),
  ownerUserId: z.string().nullable(),
  viewerLiked: z.boolean().optional(),
  viewerRemembered: z.boolean().optional(),
  attachments: z.array(attachmentSchema).optional(),
});

export const postsResponseSchema = z.object({
  posts: z.array(normalizedPostSchema),
  deleted: z.array(z.string()),
});

export const createPostResponseSchema = z.object({
  success: z.literal(true),
  id: z.string(),
});
