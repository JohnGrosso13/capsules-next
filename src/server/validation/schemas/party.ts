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

const partyInviteStatusSchema = z.enum(["pending", "accepted", "declined", "cancelled", "expired"]);

const partyInviteUserSchema = z
  .object({
    id: z.string(),
    key: z.string().nullable(),
    name: z.string().nullable(),
    avatarUrl: z.string().nullable(),
  })
  .nullable();

export const partyInviteSummarySchema = z.object({
  id: z.string(),
  partyId: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  status: partyInviteStatusSchema,
  topic: z.string().nullable(),
  message: z.string().nullable(),
  createdAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  declinedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  sender: partyInviteUserSchema,
});

export type PartyInviteSummaryPayload = z.infer<typeof partyInviteSummarySchema>;

export const partyInviteSendRequestSchema = z.object({
  partyId: z
    .string()
    .trim()
    .min(6, "Party id is too short")
    .max(80, "Party id is too long"),
  recipientId: z
    .string()
    .trim()
    .min(6, "Recipient id is too short")
    .max(120, "Recipient id is too long"),
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty")
    .max(240, "Message is too long")
    .optional(),
});

export const partyInviteSendResponseSchema = z.object({
  success: z.literal(true),
  invite: partyInviteSummarySchema,
});

export const partyInviteListResponseSchema = z.object({
  success: z.literal(true),
  incoming: z.array(partyInviteSummarySchema),
  sent: z.array(partyInviteSummarySchema),
});

export const partyInviteActionRequestSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
});

export type PartyInviteSendRequest = z.infer<typeof partyInviteSendRequestSchema>;
export type PartyInviteActionRequest = z.infer<typeof partyInviteActionRequestSchema>;
