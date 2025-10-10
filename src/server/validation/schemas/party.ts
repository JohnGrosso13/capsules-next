import { z } from "zod";

const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Display name cannot be empty")
  .max(80, "Display name is too long")
  .optional();

export const partyCreateRequestSchema = z.object({
  displayName: displayNameSchema,
  topic: z
    .string()
    .trim()
    .min(1, "Topic cannot be empty")
    .max(120, "Topic is too long")
    .optional(),
});

export const partyTokenRequestSchema = z.object({
  partyId: z
    .string()
    .trim()
    .min(6, "Party id is too short")
    .max(80, "Party id is too long"),
  displayName: displayNameSchema,
});

export const partyCloseParamsSchema = z.object({
  partyId: z
    .string()
    .trim()
    .min(6, "Party id is too short")
    .max(80, "Party id is too long"),
});

const partyMetadataSchema = z.object({
  partyId: z.string(),
  ownerId: z.string(),
  ownerDisplayName: z.string().nullable(),
  topic: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type PartyMetadata = z.infer<typeof partyMetadataSchema>;

export const partyTokenResponseSchema = z.object({
  success: z.literal(true),
  partyId: z.string(),
  livekitUrl: z.string(),
  token: z.string(),
  expiresAt: z.string(),
  isOwner: z.boolean(),
  metadata: partyMetadataSchema,
});

export type PartyTokenResponse = z.infer<typeof partyTokenResponseSchema>;
