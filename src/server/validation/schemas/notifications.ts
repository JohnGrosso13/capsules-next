import { z } from "zod";

import { NOTIFICATION_TYPES } from "@/shared/notifications";

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);

export const notificationSettingsSchema = z.object({
  commentOnPost: z.boolean(),
  commentReply: z.boolean(),
  mention: z.boolean(),
  postLike: z.boolean(),
  capsuleNewPost: z.boolean(),
  friendRequest: z.boolean(),
  friendRequestAccepted: z.boolean(),
  capsuleInvite: z.boolean(),
  capsuleInviteAccepted: z.boolean(),
  capsuleInviteDeclined: z.boolean(),
  capsuleRequestPending: z.boolean(),
  capsuleRequestApproved: z.boolean(),
  capsuleRequestDeclined: z.boolean(),
  capsuleRoleChanged: z.boolean(),
  ladderChallenge: z.boolean(),
  ladderChallengeResolved: z.boolean(),
  directMessage: z.boolean(),
  groupMessage: z.boolean(),
  followNew: z.boolean(),
  ladderMatchScheduled: z.boolean(),
  ladderInvitedToJoin: z.boolean(),
  partyInvite: z.boolean(),
  partyInviteAccepted: z.boolean(),
  mentionInChat: z.boolean(),
  liveEventStarting: z.boolean(),
  streamStatus: z.boolean(),
});

export const notificationSchema = z.object({
  id: z.string(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string().nullable(),
  href: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  unreadCount: z.number(),
});
