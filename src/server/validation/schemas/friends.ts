import { z } from "zod";

import { requestUserEnvelopeSchema, userPayloadSchema } from "./auth";

const targetField = z.string().trim().min(1);

export const friendTargetSchema = z
  .object({
    userId: targetField.optional(),
    id: targetField.optional(),
    userKey: targetField.optional(),
    key: targetField.optional(),
    email: z.string().email().optional(),
    name: targetField.optional(),
    avatarUrl: z.string().url().optional(),
    avatar: z.string().url().optional(),
  })
  .catchall(z.unknown());

export const friendSyncRequestSchema = requestUserEnvelopeSchema;

const FRIEND_ACTIONS = [
  "request",
  "accept",
  "decline",
  "cancel",
  "remove",
  "follow",
  "unfollow",
  "block",
  "unblock",
] as const;

const friendActionSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.enum(FRIEND_ACTIONS));

export const friendUpdateRequestSchema = z.object({
  action: friendActionSchema,
  user: userPayloadSchema.optional(),
  target: friendTargetSchema.optional(),
  friend: friendTargetSchema.optional(),
  userTarget: friendTargetSchema.optional(),
  message: z.string().max(500).optional(),
  reason: z.string().max(500).optional(),
  requestId: z.string().trim().min(1).optional(),
});

export type FriendUpdateRequest = z.infer<typeof friendUpdateRequestSchema>;
export type FriendAction = z.infer<typeof friendActionSchema>;

const friendUserSummarySchema = z.object({
  id: z.string(),
  key: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

const friendSummarySchema = z.object({
  id: z.string(),
  friendUserId: z.string(),
  requestId: z.string().nullable(),
  since: z.string().nullable(),
  user: friendUserSummarySchema.nullable(),
});

const friendRequestStatusSchema = z.enum(["pending", "accepted", "declined", "cancelled"]);

const friendRequestSummarySchema = z.object({
  id: z.string(),
  requesterId: z.string(),
  recipientId: z.string(),
  status: friendRequestStatusSchema,
  message: z.string().nullable(),
  createdAt: z.string().nullable(),
  respondedAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  direction: z.enum(["incoming", "outgoing"]),
  user: friendUserSummarySchema.nullable(),
});

const followSummarySchema = z.object({
  id: z.string(),
  followerId: z.string(),
  followeeId: z.string(),
  createdAt: z.string().nullable(),
  mutedAt: z.string().nullable(),
  direction: z.enum(["following", "follower"]),
  user: friendUserSummarySchema.nullable(),
});

const blockSummarySchema = z.object({
  id: z.string(),
  blockerId: z.string(),
  blockedId: z.string(),
  createdAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  reason: z.string().nullable(),
  user: friendUserSummarySchema.nullable(),
});

export const socialGraphSnapshotSchema = z.object({
  friends: z.array(friendSummarySchema),
  incomingRequests: z.array(friendRequestSummarySchema),
  outgoingRequests: z.array(friendRequestSummarySchema),
  followers: z.array(followSummarySchema),
  following: z.array(followSummarySchema),
  blocked: z.array(blockSummarySchema),
});

const friendListItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  key: z.string().nullable(),
  name: z.string(),
  avatar: z.string().nullable(),
  since: z.string().nullable(),
  status: z.enum(["online", "offline", "away"]),
});

export const friendSyncResponseSchema = z.object({
  friends: z.array(friendListItemSchema),
  graph: socialGraphSnapshotSchema,
  channels: z.object({
    events: z.string(),
    presence: z.string(),
  }),
});

const actionResultSchema = z.record(z.string(), z.unknown()).nullable();

export const friendUpdateResponseSchema = z.object({
  success: z.literal(true),
  action: friendActionSchema,
  result: actionResultSchema.optional(),
  graph: socialGraphSnapshotSchema,
  friends: z.array(friendListItemSchema),
});
