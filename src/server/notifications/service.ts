import { getDatabaseAdminClient } from "@/config/database";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_TYPES,
  type NotificationSettings,
  type NotificationType,
} from "@/shared/notifications";

const NOTIFICATION_RETENTION_DAYS = 180;
const NOTIFICATION_MAX_PER_USER = 300;

type SettingsRow = {
  user_id: string;
  comment_on_post: boolean | null;
  comment_on_post_email: boolean | null;
  comment_reply: boolean | null;
  comment_reply_email: boolean | null;
  mention: boolean | null;
  mention_email: boolean | null;
  post_like: boolean | null;
  post_like_email: boolean | null;
  capsule_new_post: boolean | null;
  capsule_new_post_email: boolean | null;
  friend_request: boolean | null;
  friend_request_email: boolean | null;
  friend_request_accepted: boolean | null;
  friend_request_accepted_email: boolean | null;
  capsule_invite: boolean | null;
  capsule_invite_email: boolean | null;
  capsule_invite_accepted: boolean | null;
  capsule_invite_accepted_email: boolean | null;
  capsule_invite_declined: boolean | null;
  capsule_invite_declined_email: boolean | null;
  capsule_request_pending: boolean | null;
  capsule_request_pending_email: boolean | null;
  capsule_request_approved: boolean | null;
  capsule_request_approved_email: boolean | null;
  capsule_request_declined: boolean | null;
  capsule_request_declined_email: boolean | null;
  capsule_role_changed: boolean | null;
  capsule_role_changed_email: boolean | null;
  ladder_challenge: boolean | null;
  ladder_challenge_email: boolean | null;
  ladder_challenge_resolved: boolean | null;
  ladder_challenge_resolved_email: boolean | null;
  direct_message: boolean | null;
  direct_message_email: boolean | null;
  group_message: boolean | null;
  group_message_email: boolean | null;
  follow_new: boolean | null;
  follow_new_email: boolean | null;
  ladder_match_scheduled: boolean | null;
  ladder_match_scheduled_email: boolean | null;
  ladder_invited_to_join: boolean | null;
  ladder_invited_to_join_email: boolean | null;
  party_invite: boolean | null;
  party_invite_email: boolean | null;
  party_invite_accepted: boolean | null;
  party_invite_accepted_email: boolean | null;
  mention_in_chat: boolean | null;
  mention_in_chat_email: boolean | null;
  live_event_starting: boolean | null;
  live_event_starting_email: boolean | null;
  stream_status: boolean | null;
  stream_status_email: boolean | null;
  billing_issues: boolean | null;
  billing_issues_email: boolean | null;
  billing_updates: boolean | null;
  billing_updates_email: boolean | null;
  capsule_support_sent: boolean | null;
  capsule_support_sent_email: boolean | null;
  capsule_support_received: boolean | null;
  capsule_support_received_email: boolean | null;
  store_orders: boolean | null;
  store_orders_email: boolean | null;
  store_sales: boolean | null;
  store_sales_email: boolean | null;
  email_digest_frequency: string | null;
};

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function mapSettingsRow(row: SettingsRow | null): NotificationSettings {
  if (!row) return { ...DEFAULT_NOTIFICATION_SETTINGS };
  return {
    commentOnPost: row.comment_on_post ?? DEFAULT_NOTIFICATION_SETTINGS.commentOnPost,
    commentOnPostEmail:
      row.comment_on_post_email ?? DEFAULT_NOTIFICATION_SETTINGS.commentOnPostEmail,
    commentReply: row.comment_reply ?? DEFAULT_NOTIFICATION_SETTINGS.commentReply,
    commentReplyEmail:
      row.comment_reply_email ?? DEFAULT_NOTIFICATION_SETTINGS.commentReplyEmail,
    mention: row.mention ?? DEFAULT_NOTIFICATION_SETTINGS.mention,
    mentionEmail: row.mention_email ?? DEFAULT_NOTIFICATION_SETTINGS.mentionEmail,
    postLike: row.post_like ?? DEFAULT_NOTIFICATION_SETTINGS.postLike,
    postLikeEmail: row.post_like_email ?? DEFAULT_NOTIFICATION_SETTINGS.postLikeEmail,
    capsuleNewPost: row.capsule_new_post ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleNewPost,
    capsuleNewPostEmail:
      row.capsule_new_post_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleNewPostEmail,
    friendRequest: row.friend_request ?? DEFAULT_NOTIFICATION_SETTINGS.friendRequest,
    friendRequestEmail:
      row.friend_request_email ?? DEFAULT_NOTIFICATION_SETTINGS.friendRequestEmail,
    friendRequestAccepted:
      row.friend_request_accepted ?? DEFAULT_NOTIFICATION_SETTINGS.friendRequestAccepted,
    friendRequestAcceptedEmail:
      row.friend_request_accepted_email ?? DEFAULT_NOTIFICATION_SETTINGS.friendRequestAcceptedEmail,
    capsuleInvite: row.capsule_invite ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInvite,
    capsuleInviteEmail:
      row.capsule_invite_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInviteEmail,
    capsuleInviteAccepted:
      row.capsule_invite_accepted ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInviteAccepted,
    capsuleInviteAcceptedEmail:
      row.capsule_invite_accepted_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInviteAcceptedEmail,
    capsuleInviteDeclined:
      row.capsule_invite_declined ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInviteDeclined,
    capsuleInviteDeclinedEmail:
      row.capsule_invite_declined_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInviteDeclinedEmail,
    capsuleRequestPending:
      row.capsule_request_pending ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestPending,
    capsuleRequestPendingEmail:
      row.capsule_request_pending_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestPendingEmail,
    capsuleRequestApproved:
      row.capsule_request_approved ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestApproved,
    capsuleRequestApprovedEmail:
      row.capsule_request_approved_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestApprovedEmail,
    capsuleRequestDeclined:
      row.capsule_request_declined ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestDeclined,
    capsuleRequestDeclinedEmail:
      row.capsule_request_declined_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestDeclinedEmail,
    capsuleRoleChanged:
      row.capsule_role_changed ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRoleChanged,
    capsuleRoleChangedEmail:
      row.capsule_role_changed_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRoleChangedEmail,
    ladderChallenge: row.ladder_challenge ?? DEFAULT_NOTIFICATION_SETTINGS.ladderChallenge,
    ladderChallengeEmail:
      row.ladder_challenge_email ?? DEFAULT_NOTIFICATION_SETTINGS.ladderChallengeEmail,
    ladderChallengeResolved:
      row.ladder_challenge_resolved ?? DEFAULT_NOTIFICATION_SETTINGS.ladderChallengeResolved,
    ladderChallengeResolvedEmail:
      row.ladder_challenge_resolved_email ?? DEFAULT_NOTIFICATION_SETTINGS.ladderChallengeResolvedEmail,
    directMessage: row.direct_message ?? DEFAULT_NOTIFICATION_SETTINGS.directMessage,
    directMessageEmail:
      row.direct_message_email ?? DEFAULT_NOTIFICATION_SETTINGS.directMessageEmail,
    groupMessage: row.group_message ?? DEFAULT_NOTIFICATION_SETTINGS.groupMessage,
    groupMessageEmail:
      row.group_message_email ?? DEFAULT_NOTIFICATION_SETTINGS.groupMessageEmail,
    followNew: row.follow_new ?? DEFAULT_NOTIFICATION_SETTINGS.followNew,
    followNewEmail: row.follow_new_email ?? DEFAULT_NOTIFICATION_SETTINGS.followNewEmail,
    ladderMatchScheduled:
      row.ladder_match_scheduled ?? DEFAULT_NOTIFICATION_SETTINGS.ladderMatchScheduled,
    ladderMatchScheduledEmail:
      row.ladder_match_scheduled_email ?? DEFAULT_NOTIFICATION_SETTINGS.ladderMatchScheduledEmail,
    ladderInvitedToJoin:
      row.ladder_invited_to_join ?? DEFAULT_NOTIFICATION_SETTINGS.ladderInvitedToJoin,
    ladderInvitedToJoinEmail:
      row.ladder_invited_to_join_email ?? DEFAULT_NOTIFICATION_SETTINGS.ladderInvitedToJoinEmail,
    partyInvite: row.party_invite ?? DEFAULT_NOTIFICATION_SETTINGS.partyInvite,
    partyInviteEmail: row.party_invite_email ?? DEFAULT_NOTIFICATION_SETTINGS.partyInviteEmail,
    partyInviteAccepted:
      row.party_invite_accepted ?? DEFAULT_NOTIFICATION_SETTINGS.partyInviteAccepted,
    partyInviteAcceptedEmail:
      row.party_invite_accepted_email ?? DEFAULT_NOTIFICATION_SETTINGS.partyInviteAcceptedEmail,
    mentionInChat: row.mention_in_chat ?? DEFAULT_NOTIFICATION_SETTINGS.mentionInChat,
    mentionInChatEmail:
      row.mention_in_chat_email ?? DEFAULT_NOTIFICATION_SETTINGS.mentionInChatEmail,
    liveEventStarting:
      row.live_event_starting ?? DEFAULT_NOTIFICATION_SETTINGS.liveEventStarting,
    liveEventStartingEmail:
      row.live_event_starting_email ?? DEFAULT_NOTIFICATION_SETTINGS.liveEventStartingEmail,
    streamStatus: row.stream_status ?? DEFAULT_NOTIFICATION_SETTINGS.streamStatus,
    streamStatusEmail: row.stream_status_email ?? DEFAULT_NOTIFICATION_SETTINGS.streamStatusEmail,
    billingIssues: row.billing_issues ?? DEFAULT_NOTIFICATION_SETTINGS.billingIssues,
    billingIssuesEmail: row.billing_issues_email ?? DEFAULT_NOTIFICATION_SETTINGS.billingIssuesEmail,
    billingUpdates: row.billing_updates ?? DEFAULT_NOTIFICATION_SETTINGS.billingUpdates,
    billingUpdatesEmail: row.billing_updates_email ?? DEFAULT_NOTIFICATION_SETTINGS.billingUpdatesEmail,
    capsuleSupportSent:
      row.capsule_support_sent ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleSupportSent,
    capsuleSupportSentEmail:
      row.capsule_support_sent_email ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleSupportSentEmail,
    capsuleSupportReceived:
      row.capsule_support_received ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleSupportReceived,
    capsuleSupportReceivedEmail:
      row.capsule_support_received_email ??
      DEFAULT_NOTIFICATION_SETTINGS.capsuleSupportReceivedEmail,
    storeOrders: row.store_orders ?? DEFAULT_NOTIFICATION_SETTINGS.storeOrders,
    storeOrdersEmail: row.store_orders_email ?? DEFAULT_NOTIFICATION_SETTINGS.storeOrdersEmail,
    storeSales: row.store_sales ?? DEFAULT_NOTIFICATION_SETTINGS.storeSales,
    storeSalesEmail: row.store_sales_email ?? DEFAULT_NOTIFICATION_SETTINGS.storeSalesEmail,
    emailDigestFrequency:
      typeof row.email_digest_frequency === "string"
        ? (row.email_digest_frequency as NotificationSettings["emailDigestFrequency"])
        : DEFAULT_NOTIFICATION_SETTINGS.emailDigestFrequency,
  };
}

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export function isNotificationEnabled(
  type: NotificationType,
  settings: NotificationSettings,
): boolean {
  switch (type) {
    case "comment_on_post":
      return settings.commentOnPost;
    case "comment_reply":
      return settings.commentReply;
    case "mention":
      return settings.mention;
    case "post_like":
      return settings.postLike;
    case "capsule_new_post":
      return settings.capsuleNewPost;
    case "friend_request":
      return settings.friendRequest;
    case "friend_request_accepted":
      return settings.friendRequestAccepted;
    case "capsule_invite":
      return settings.capsuleInvite;
    case "capsule_invite_accepted":
      return settings.capsuleInviteAccepted;
    case "capsule_invite_declined":
      return settings.capsuleInviteDeclined;
    case "capsule_request_pending":
      return settings.capsuleRequestPending;
    case "capsule_request_approved":
      return settings.capsuleRequestApproved;
    case "capsule_request_declined":
      return settings.capsuleRequestDeclined;
    case "capsule_role_changed":
      return settings.capsuleRoleChanged;
    case "ladder_challenge":
      return settings.ladderChallenge;
    case "ladder_challenge_resolved":
      return settings.ladderChallengeResolved;
    case "direct_message":
      return settings.directMessage;
    case "group_message":
      return settings.groupMessage;
    case "live_event_starting":
      return settings.liveEventStarting;
    case "stream_status":
      return settings.streamStatus;
    case "follow_new":
      return settings.followNew;
    case "ladder_match_scheduled":
      return settings.ladderMatchScheduled;
    case "ladder_invited_to_join":
      return settings.ladderInvitedToJoin;
    case "party_invite":
      return settings.partyInvite;
    case "party_invite_accepted":
      return settings.partyInviteAccepted;
    case "mention_in_chat":
      return settings.mentionInChat;
    case "billing_payment_failed":
      return settings.billingIssues;
    case "billing_payment_succeeded":
      return settings.billingUpdates;
    case "billing_plan_changed":
      return settings.billingUpdates;
    case "capsule_power_sent":
    case "capsule_pass_sent":
      return settings.capsuleSupportSent;
    case "capsule_power_received":
    case "capsule_pass_received":
      return settings.capsuleSupportReceived;
    case "store_order_paid":
    case "store_order_failed":
      return settings.storeOrders;
    case "store_order_sold":
      return settings.storeSales;
    default:
      return true;
  }
}

export function isEmailNotificationEnabled(
  type: NotificationType,
  settings: NotificationSettings,
): boolean {
  switch (type) {
    case "comment_on_post":
      return settings.commentOnPostEmail;
    case "comment_reply":
      return settings.commentReplyEmail;
    case "mention":
      return settings.mentionEmail;
    case "post_like":
      return settings.postLikeEmail;
    case "capsule_new_post":
      return settings.capsuleNewPostEmail;
    case "friend_request":
      return settings.friendRequestEmail;
    case "friend_request_accepted":
      return settings.friendRequestAcceptedEmail;
    case "capsule_invite":
      return settings.capsuleInviteEmail;
    case "capsule_invite_accepted":
      return settings.capsuleInviteAcceptedEmail;
    case "capsule_invite_declined":
      return settings.capsuleInviteDeclinedEmail;
    case "capsule_request_pending":
      return settings.capsuleRequestPendingEmail;
    case "capsule_request_approved":
      return settings.capsuleRequestApprovedEmail;
    case "capsule_request_declined":
      return settings.capsuleRequestDeclinedEmail;
    case "capsule_role_changed":
      return settings.capsuleRoleChangedEmail;
    case "ladder_challenge":
      return settings.ladderChallengeEmail;
    case "ladder_challenge_resolved":
      return settings.ladderChallengeResolvedEmail;
    case "direct_message":
      return settings.directMessageEmail;
    case "group_message":
      return settings.groupMessageEmail;
    case "live_event_starting":
      return settings.liveEventStartingEmail;
    case "stream_status":
      return settings.streamStatusEmail;
    case "follow_new":
      return settings.followNewEmail;
    case "ladder_match_scheduled":
      return settings.ladderMatchScheduledEmail;
    case "ladder_invited_to_join":
      return settings.ladderInvitedToJoinEmail;
    case "party_invite":
      return settings.partyInviteEmail;
    case "party_invite_accepted":
      return settings.partyInviteAcceptedEmail;
    case "mention_in_chat":
      return settings.mentionInChatEmail;
    case "billing_payment_failed":
      return settings.billingIssuesEmail;
    case "billing_payment_succeeded":
      return settings.billingUpdatesEmail;
    case "billing_plan_changed":
      return settings.billingUpdatesEmail;
    case "capsule_power_sent":
    case "capsule_pass_sent":
      return settings.capsuleSupportSentEmail;
    case "capsule_power_received":
    case "capsule_pass_received":
      return settings.capsuleSupportReceivedEmail;
    case "store_order_paid":
    case "store_order_failed":
      return settings.storeOrdersEmail;
    case "store_order_sold":
      return settings.storeSalesEmail;
    default:
      return true;
  }
}

export async function getNotificationSettings(userId: string): Promise<NotificationSettings> {
  const normalizedId = normalizeUserId(userId);
  if (!normalizedId) return { ...DEFAULT_NOTIFICATION_SETTINGS };

  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_notification_settings")
    .select<SettingsRow>(
      "user_id, comment_on_post, comment_on_post_email, comment_reply, comment_reply_email, mention, mention_email, post_like, post_like_email, capsule_new_post, capsule_new_post_email, friend_request, friend_request_email, friend_request_accepted, friend_request_accepted_email, capsule_invite, capsule_invite_email, capsule_invite_accepted, capsule_invite_accepted_email, capsule_invite_declined, capsule_invite_declined_email, capsule_request_pending, capsule_request_pending_email, capsule_request_approved, capsule_request_approved_email, capsule_request_declined, capsule_request_declined_email, capsule_role_changed, capsule_role_changed_email, ladder_challenge, ladder_challenge_email, ladder_challenge_resolved, ladder_challenge_resolved_email, direct_message, direct_message_email, group_message, group_message_email, follow_new, follow_new_email, ladder_match_scheduled, ladder_match_scheduled_email, ladder_invited_to_join, ladder_invited_to_join_email, party_invite, party_invite_email, party_invite_accepted, party_invite_accepted_email, mention_in_chat, mention_in_chat_email, live_event_starting, live_event_starting_email, stream_status, stream_status_email, billing_issues, billing_issues_email, billing_updates, billing_updates_email, capsule_support_sent, capsule_support_sent_email, capsule_support_received, capsule_support_received_email, store_orders, store_orders_email, store_sales, store_sales_email, email_digest_frequency",
    )
    .eq("user_id", normalizedId)
    .maybeSingle();

  if (result.error && result.error.code !== "PGRST116") {
    throw new Error(`notifications.settings.fetch_failed: ${result.error.message}`);
  }

  return mapSettingsRow(result.data ?? null);
}

export async function updateNotificationSettings(
  userId: string,
  updates: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const normalizedId = normalizeUserId(userId);
  if (!normalizedId) throw new Error("notifications.settings.update_failed: invalid user id");

  const current = await getNotificationSettings(normalizedId);
  const next: NotificationSettings = { ...current };

  (Object.keys(updates) as Array<keyof NotificationSettings>).forEach((key) => {
    if (typeof updates[key] !== "undefined") {
      if (key === "emailDigestFrequency") {
        const value = updates[key];
        if (
          value === "instant" ||
          value === "daily" ||
          value === "weekly" ||
          value === "off"
        ) {
          next.emailDigestFrequency = value;
        }
      } else {
        next[key] = Boolean(updates[key]) as NotificationSettings[Exclude<
          keyof NotificationSettings,
          "emailDigestFrequency"
        >];
      }
    }
  });

  const payload: Record<string, unknown> = {
    user_id: normalizedId,
    comment_on_post: next.commentOnPost,
    comment_on_post_email: next.commentOnPostEmail,
    comment_reply: next.commentReply,
    comment_reply_email: next.commentReplyEmail,
    mention: next.mention,
    mention_email: next.mentionEmail,
    post_like: next.postLike,
    post_like_email: next.postLikeEmail,
    capsule_new_post: next.capsuleNewPost,
    capsule_new_post_email: next.capsuleNewPostEmail,
    friend_request: next.friendRequest,
    friend_request_email: next.friendRequestEmail,
    friend_request_accepted: next.friendRequestAccepted,
    friend_request_accepted_email: next.friendRequestAcceptedEmail,
    capsule_invite: next.capsuleInvite,
    capsule_invite_email: next.capsuleInviteEmail,
    capsule_invite_accepted: next.capsuleInviteAccepted,
    capsule_invite_accepted_email: next.capsuleInviteAcceptedEmail,
    capsule_invite_declined: next.capsuleInviteDeclined,
    capsule_invite_declined_email: next.capsuleInviteDeclinedEmail,
    capsule_request_pending: next.capsuleRequestPending,
    capsule_request_pending_email: next.capsuleRequestPendingEmail,
    capsule_request_approved: next.capsuleRequestApproved,
    capsule_request_approved_email: next.capsuleRequestApprovedEmail,
    capsule_request_declined: next.capsuleRequestDeclined,
    capsule_request_declined_email: next.capsuleRequestDeclinedEmail,
    capsule_role_changed: next.capsuleRoleChanged,
    capsule_role_changed_email: next.capsuleRoleChangedEmail,
    ladder_challenge: next.ladderChallenge,
    ladder_challenge_email: next.ladderChallengeEmail,
    ladder_challenge_resolved: next.ladderChallengeResolved,
    ladder_challenge_resolved_email: next.ladderChallengeResolvedEmail,
    direct_message: next.directMessage,
    direct_message_email: next.directMessageEmail,
    group_message: next.groupMessage,
    group_message_email: next.groupMessageEmail,
    follow_new: next.followNew,
    follow_new_email: next.followNewEmail,
    ladder_match_scheduled: next.ladderMatchScheduled,
    ladder_match_scheduled_email: next.ladderMatchScheduledEmail,
    ladder_invited_to_join: next.ladderInvitedToJoin,
    ladder_invited_to_join_email: next.ladderInvitedToJoinEmail,
    party_invite: next.partyInvite,
    party_invite_email: next.partyInviteEmail,
    party_invite_accepted: next.partyInviteAccepted,
    party_invite_accepted_email: next.partyInviteAcceptedEmail,
    mention_in_chat: next.mentionInChat,
    mention_in_chat_email: next.mentionInChatEmail,
    live_event_starting: next.liveEventStarting,
    live_event_starting_email: next.liveEventStartingEmail,
    stream_status: next.streamStatus,
    stream_status_email: next.streamStatusEmail,
    billing_issues: next.billingIssues,
    billing_issues_email: next.billingIssuesEmail,
    billing_updates: next.billingUpdates,
    billing_updates_email: next.billingUpdatesEmail,
    capsule_support_sent: next.capsuleSupportSent,
    capsule_support_sent_email: next.capsuleSupportSentEmail,
    capsule_support_received: next.capsuleSupportReceived,
    capsule_support_received_email: next.capsuleSupportReceivedEmail,
    store_orders: next.storeOrders,
    store_orders_email: next.storeOrdersEmail,
    store_sales: next.storeSales,
    store_sales_email: next.storeSalesEmail,
    email_digest_frequency: next.emailDigestFrequency,
  };

  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_notification_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select<SettingsRow>(
      "user_id, comment_on_post, comment_on_post_email, comment_reply, comment_reply_email, mention, mention_email, post_like, post_like_email, capsule_new_post, capsule_new_post_email, friend_request, friend_request_email, friend_request_accepted, friend_request_accepted_email, capsule_invite, capsule_invite_email, capsule_invite_accepted, capsule_invite_accepted_email, capsule_invite_declined, capsule_invite_declined_email, capsule_request_pending, capsule_request_pending_email, capsule_request_approved, capsule_request_approved_email, capsule_request_declined, capsule_request_declined_email, capsule_role_changed, capsule_role_changed_email, ladder_challenge, ladder_challenge_email, ladder_challenge_resolved, ladder_challenge_resolved_email, direct_message, direct_message_email, group_message, group_message_email, follow_new, follow_new_email, ladder_match_scheduled, ladder_match_scheduled_email, ladder_invited_to_join, ladder_invited_to_join_email, party_invite, party_invite_email, party_invite_accepted, party_invite_accepted_email, mention_in_chat, mention_in_chat_email, live_event_starting, live_event_starting_email, stream_status, stream_status_email, billing_issues, billing_issues_email, billing_updates, billing_updates_email, capsule_support_sent, capsule_support_sent_email, capsule_support_received, capsule_support_received_email, store_orders, store_orders_email, store_sales, store_sales_email, email_digest_frequency",
    )
    .eq("user_id", normalizedId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`notifications.settings.update_failed: ${result.error.message}`);
  }

  return mapSettingsRow(result.data ?? null);
}

type NotificationRow = {
  id: string | null;
  user_id: string | null;
  type: string | null;
  title: string | null;
  body: string | null;
  href: string | null;
  data: Record<string, unknown> | null;
  created_at: string | null;
  read_at: string | null;
};

export type NotificationRecord = {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
  readAt: string | null;
};

function limitText(value: string | null | undefined, max = 360): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}.`;
}

function mapNotificationRow(row: NotificationRow | null): NotificationRecord | null {
  if (!row?.id || !row?.user_id) return null;
  const typeValue = row.type;
  if (!isNotificationType(typeValue)) return null;
  const createdAt = row.created_at ?? new Date().toISOString();
  const readAt = row.read_at ?? null;
  const data =
    row.data && typeof row.data === "object" && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : null;
  return {
    id: String(row.id),
    type: typeValue,
    title: row.title ?? "",
    body: row.body ?? null,
    href: row.href ?? null,
    data,
    createdAt,
    readAt,
  };
}

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  data?: Record<string, unknown> | null;
  actorId?: string | null;
  respectPreferences?: boolean;
  settingsCache?: Map<string, NotificationSettings>;
};

async function pruneUserNotifications(userId: string): Promise<void> {
  const db = getDatabaseAdminClient();
  const cutoff = new Date(Date.now() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const staleResult = await db
    .from("user_notifications")
    .delete()
    .eq("user_id", userId)
    .lt("created_at", cutoff)
    .select("id")
    .fetch();
  if (staleResult.error) {
    console.warn("notifications.prune.time_failed", staleResult.error);
  }

  const extraResult = await db
    .from("user_notifications")
    .select<Pick<NotificationRow, "id">>("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(NOTIFICATION_MAX_PER_USER, NOTIFICATION_MAX_PER_USER + 400)
    .fetch();

  if (extraResult.error) {
    console.warn("notifications.prune.list_failed", extraResult.error);
    return;
  }

  const extraIds = (extraResult.data ?? [])
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  if (!extraIds.length) return;

  const deleteResult = await db
    .from("user_notifications")
    .delete()
    .in("id", extraIds)
    .select("id")
    .fetch();
  if (deleteResult.error) {
    console.warn("notifications.prune.delete_failed", deleteResult.error);
  }
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationRecord | null> {
  const normalizedUserId = normalizeUserId(input.userId);
  if (!normalizedUserId) return null;
  if (input.actorId && normalizeUserId(input.actorId) === normalizedUserId) {
    return null;
  }

  const respectPreferences = input.respectPreferences !== false;
  let settings: NotificationSettings | null = null;

  if (respectPreferences) {
    if (input.settingsCache?.has(normalizedUserId)) {
      settings = input.settingsCache.get(normalizedUserId)!;
    } else {
      settings = await getNotificationSettings(normalizedUserId);
      if (input.settingsCache) {
        input.settingsCache.set(normalizedUserId, settings);
      }
    }

    if (!isNotificationEnabled(input.type, settings)) {
      return null;
    }
  }

  const db = getDatabaseAdminClient();
  const now = new Date().toISOString();

  const payload = {
    user_id: normalizedUserId,
    type: input.type,
    title: limitText(input.title, 240) ?? "Notification",
    body: limitText(input.body, 420),
    href: input.href ?? null,
    data: input.data ?? null,
    created_at: now,
  };

  const result = await db
    .from("user_notifications")
    .insert(payload)
    .select<NotificationRow>("id, user_id, type, title, body, href, data, created_at, read_at")
    .maybeSingle();

  if (result.error) {
    throw new Error(`notifications.create_failed: ${result.error.message}`);
  }

  const mapped = mapNotificationRow(result.data ?? null);

  // Best-effort pruning to keep per-user notification storage bounded.
  void pruneUserNotifications(normalizedUserId).catch((error: unknown) => {
    console.warn("notifications.prune.error", error);
  });

  return mapped;
}

export async function createNotifications(
  recipients: string[],
  payload: Omit<CreateNotificationInput, "userId" | "settingsCache">,
  options: { respectPreferences?: boolean } = {},
): Promise<NotificationRecord[]> {
  const uniqueRecipients = Array.from(
    new Set(
      recipients
        .map((id) => normalizeUserId(id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (!uniqueRecipients.length) return [];

  const cache = new Map<string, NotificationSettings>();
  const results = await Promise.all(
    uniqueRecipients.map((userId) => {
      const input: CreateNotificationInput = {
        ...payload,
        userId,
        settingsCache: cache,
      };
      if (typeof options.respectPreferences !== "undefined") {
        input.respectPreferences = options.respectPreferences;
      }
      return createNotification(input);
    }),
  );

  return results.filter((entry): entry is NotificationRecord => Boolean(entry));
}

export async function listNotificationsForUser(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
): Promise<{ notifications: NotificationRecord[]; unreadCount: number }> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return { notifications: [], unreadCount: 0 };

  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const db = getDatabaseAdminClient();

  let query = db
    .from("user_notifications")
    .select<NotificationRow>(
      "id, user_id, type, title, body, href, data, created_at, read_at",
      { count: "exact" },
    )
    .eq("user_id", normalizedUserId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.unreadOnly) {
    query = query.is("read_at", null);
  }

  const result = await query.fetch();
  if (result.error) {
    throw new Error(`notifications.list_failed: ${result.error.message}`);
  }

  const unreadResult = await db
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", normalizedUserId)
    .is("read_at", null)
    .fetch();

  const unreadCount = unreadResult.count ?? 0;
  const rows = result.data ?? [];
  return {
    notifications: rows
      .map((row) => mapNotificationRow(row as NotificationRow))
      .filter((entry): entry is NotificationRecord => Boolean(entry)),
    unreadCount,
  };
}

export async function markNotificationsRead(
  userId: string,
  options: { ids?: string[] | null; readAt?: string | null } = {},
): Promise<number> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return 0;

  const db = getDatabaseAdminClient();
  let query = db
    .from("user_notifications")
    .update({ read_at: options.readAt ?? new Date().toISOString() })
    .eq("user_id", normalizedUserId);

  if (Array.isArray(options.ids) && options.ids.length) {
    query = query.in(
      "id",
      options.ids
        .map((id) => normalizeUserId(id) ?? id)
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    );
  } else {
    query = query.is("read_at", null);
  }

  const result = await query.select<Pick<NotificationRow, "id">>("id").fetch();
  if (result.error) {
    throw new Error(`notifications.mark_read_failed: ${result.error.message}`);
  }
  return (result.data ?? []).length;
}
