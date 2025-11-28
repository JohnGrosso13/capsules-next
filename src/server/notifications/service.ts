import { getDatabaseAdminClient } from "@/config/database";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFICATION_TYPES,
  type NotificationSettings,
  type NotificationType,
} from "@/shared/notifications";

type SettingsRow = {
  user_id: string;
  comment_on_post: boolean | null;
  comment_reply: boolean | null;
  mention: boolean | null;
  post_like: boolean | null;
  capsule_new_post: boolean | null;
  friend_request: boolean | null;
  friend_request_accepted: boolean | null;
  capsule_invite: boolean | null;
  capsule_invite_accepted: boolean | null;
  capsule_invite_declined: boolean | null;
  capsule_request_pending: boolean | null;
  capsule_request_approved: boolean | null;
  capsule_request_declined: boolean | null;
  capsule_role_changed: boolean | null;
  ladder_challenge: boolean | null;
  ladder_challenge_resolved: boolean | null;
  direct_message: boolean | null;
  group_message: boolean | null;
  follow_new: boolean | null;
  ladder_match_scheduled: boolean | null;
  ladder_invited_to_join: boolean | null;
  party_invite: boolean | null;
  party_invite_accepted: boolean | null;
  mention_in_chat: boolean | null;
  live_event_starting: boolean | null;
  stream_status: boolean | null;
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
    commentReply: row.comment_reply ?? DEFAULT_NOTIFICATION_SETTINGS.commentReply,
    mention: row.mention ?? DEFAULT_NOTIFICATION_SETTINGS.mention,
    postLike: row.post_like ?? DEFAULT_NOTIFICATION_SETTINGS.postLike,
    capsuleNewPost: row.capsule_new_post ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleNewPost,
    friendRequest: row.friend_request ?? DEFAULT_NOTIFICATION_SETTINGS.friendRequest,
    friendRequestAccepted:
      row.friend_request_accepted ?? DEFAULT_NOTIFICATION_SETTINGS.friendRequestAccepted,
    capsuleInvite: row.capsule_invite ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInvite,
    capsuleInviteAccepted:
      row.capsule_invite_accepted ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInviteAccepted,
    capsuleInviteDeclined:
      row.capsule_invite_declined ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleInviteDeclined,
    capsuleRequestPending:
      row.capsule_request_pending ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestPending,
    capsuleRequestApproved:
      row.capsule_request_approved ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestApproved,
    capsuleRequestDeclined:
      row.capsule_request_declined ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRequestDeclined,
    capsuleRoleChanged:
      row.capsule_role_changed ?? DEFAULT_NOTIFICATION_SETTINGS.capsuleRoleChanged,
    ladderChallenge: row.ladder_challenge ?? DEFAULT_NOTIFICATION_SETTINGS.ladderChallenge,
    ladderChallengeResolved:
      row.ladder_challenge_resolved ?? DEFAULT_NOTIFICATION_SETTINGS.ladderChallengeResolved,
    directMessage: row.direct_message ?? DEFAULT_NOTIFICATION_SETTINGS.directMessage,
    groupMessage: row.group_message ?? DEFAULT_NOTIFICATION_SETTINGS.groupMessage,
    followNew: row.follow_new ?? DEFAULT_NOTIFICATION_SETTINGS.followNew,
    ladderMatchScheduled:
      row.ladder_match_scheduled ?? DEFAULT_NOTIFICATION_SETTINGS.ladderMatchScheduled,
    ladderInvitedToJoin:
      row.ladder_invited_to_join ?? DEFAULT_NOTIFICATION_SETTINGS.ladderInvitedToJoin,
    partyInvite: row.party_invite ?? DEFAULT_NOTIFICATION_SETTINGS.partyInvite,
    partyInviteAccepted:
      row.party_invite_accepted ?? DEFAULT_NOTIFICATION_SETTINGS.partyInviteAccepted,
    mentionInChat: row.mention_in_chat ?? DEFAULT_NOTIFICATION_SETTINGS.mentionInChat,
    liveEventStarting:
      row.live_event_starting ?? DEFAULT_NOTIFICATION_SETTINGS.liveEventStarting,
    streamStatus: row.stream_status ?? DEFAULT_NOTIFICATION_SETTINGS.streamStatus,
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
      "user_id, comment_on_post, comment_reply, mention, post_like, capsule_new_post, friend_request, friend_request_accepted, capsule_invite, capsule_invite_accepted, capsule_invite_declined, capsule_request_pending, capsule_request_approved, capsule_request_declined, capsule_role_changed, ladder_challenge, ladder_challenge_resolved, direct_message, group_message, follow_new, ladder_match_scheduled, ladder_invited_to_join, party_invite, party_invite_accepted, mention_in_chat, live_event_starting, stream_status",
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

  const payload: Record<string, unknown> = {
    user_id: normalizedId,
  };

  if (Object.prototype.hasOwnProperty.call(updates, "commentOnPost") && updates.commentOnPost !== undefined) {
    payload.comment_on_post = Boolean(updates.commentOnPost);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "commentReply") &&
    updates.commentReply !== undefined
  ) {
    payload.comment_reply = Boolean(updates.commentReply);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "mention") && updates.mention !== undefined) {
    payload.mention = Boolean(updates.mention);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "postLike") && updates.postLike !== undefined) {
    payload.post_like = Boolean(updates.postLike);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleNewPost") &&
    updates.capsuleNewPost !== undefined
  ) {
    payload.capsule_new_post = Boolean(updates.capsuleNewPost);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "friendRequest") &&
    updates.friendRequest !== undefined
  ) {
    payload.friend_request = Boolean(updates.friendRequest);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "friendRequestAccepted") &&
    updates.friendRequestAccepted !== undefined
  ) {
    payload.friend_request_accepted = Boolean(updates.friendRequestAccepted);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleInvite") &&
    updates.capsuleInvite !== undefined
  ) {
    payload.capsule_invite = Boolean(updates.capsuleInvite);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleInviteAccepted") &&
    updates.capsuleInviteAccepted !== undefined
  ) {
    payload.capsule_invite_accepted = Boolean(updates.capsuleInviteAccepted);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleInviteDeclined") &&
    updates.capsuleInviteDeclined !== undefined
  ) {
    payload.capsule_invite_declined = Boolean(updates.capsuleInviteDeclined);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleRequestPending") &&
    updates.capsuleRequestPending !== undefined
  ) {
    payload.capsule_request_pending = Boolean(updates.capsuleRequestPending);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleRequestApproved") &&
    updates.capsuleRequestApproved !== undefined
  ) {
    payload.capsule_request_approved = Boolean(updates.capsuleRequestApproved);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleRequestDeclined") &&
    updates.capsuleRequestDeclined !== undefined
  ) {
    payload.capsule_request_declined = Boolean(updates.capsuleRequestDeclined);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "capsuleRoleChanged") &&
    updates.capsuleRoleChanged !== undefined
  ) {
    payload.capsule_role_changed = Boolean(updates.capsuleRoleChanged);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "ladderChallenge") &&
    updates.ladderChallenge !== undefined
  ) {
    payload.ladder_challenge = Boolean(updates.ladderChallenge);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "ladderChallengeResolved") &&
    updates.ladderChallengeResolved !== undefined
  ) {
    payload.ladder_challenge_resolved = Boolean(updates.ladderChallengeResolved);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "directMessage") &&
    updates.directMessage !== undefined
  ) {
    payload.direct_message = Boolean(updates.directMessage);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "groupMessage") &&
    updates.groupMessage !== undefined
  ) {
    payload.group_message = Boolean(updates.groupMessage);
  }
  if (Object.prototype.hasOwnProperty.call(updates, "followNew") && updates.followNew !== undefined) {
    payload.follow_new = Boolean(updates.followNew);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "ladderMatchScheduled") &&
    updates.ladderMatchScheduled !== undefined
  ) {
    payload.ladder_match_scheduled = Boolean(updates.ladderMatchScheduled);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "ladderInvitedToJoin") &&
    updates.ladderInvitedToJoin !== undefined
  ) {
    payload.ladder_invited_to_join = Boolean(updates.ladderInvitedToJoin);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "partyInvite") &&
    updates.partyInvite !== undefined
  ) {
    payload.party_invite = Boolean(updates.partyInvite);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "partyInviteAccepted") &&
    updates.partyInviteAccepted !== undefined
  ) {
    payload.party_invite_accepted = Boolean(updates.partyInviteAccepted);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "mentionInChat") &&
    updates.mentionInChat !== undefined
  ) {
    payload.mention_in_chat = Boolean(updates.mentionInChat);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "liveEventStarting") &&
    updates.liveEventStarting !== undefined
  ) {
    payload.live_event_starting = Boolean(updates.liveEventStarting);
  }
  if (
    Object.prototype.hasOwnProperty.call(updates, "streamStatus") &&
    updates.streamStatus !== undefined
  ) {
    payload.stream_status = Boolean(updates.streamStatus);
  }

  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_notification_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select<SettingsRow>(
      "user_id, comment_on_post, comment_reply, mention, post_like, capsule_new_post, friend_request, friend_request_accepted, capsule_invite, capsule_invite_accepted, capsule_invite_declined, capsule_request_pending, capsule_request_approved, capsule_request_declined, capsule_role_changed, ladder_challenge, ladder_challenge_resolved, direct_message, group_message, follow_new, ladder_match_scheduled, ladder_invited_to_join, party_invite, party_invite_accepted, mention_in_chat, live_event_starting, stream_status",
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
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
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

  return mapNotificationRow(result.data ?? null);
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
