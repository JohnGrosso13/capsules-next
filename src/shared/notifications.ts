export const NOTIFICATION_TYPES = [
  "comment_on_post",
  "comment_reply",
  "mention",
  "post_like",
  "capsule_new_post",
  "friend_request",
  "friend_request_accepted",
  "capsule_invite",
  "capsule_invite_accepted",
  "capsule_invite_declined",
  "capsule_request_pending",
  "capsule_request_approved",
  "capsule_request_declined",
  "capsule_role_changed",
  "ladder_challenge",
  "ladder_challenge_resolved",
  "direct_message",
  "group_message",
  "follow_new",
  "ladder_match_scheduled",
  "ladder_invited_to_join",
  "party_invite",
  "party_invite_accepted",
  "mention_in_chat",
  "live_event_starting",
  "stream_status",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationSettings = {
  commentOnPost: boolean;
  capsuleNewPost: boolean;
  friendRequest: boolean;
  friendRequestAccepted: boolean;
  postLike: boolean;
  commentReply: boolean;
  mention: boolean;
  capsuleInvite: boolean;
  capsuleInviteAccepted: boolean;
  capsuleInviteDeclined: boolean;
  capsuleRequestPending: boolean;
  capsuleRequestApproved: boolean;
  capsuleRequestDeclined: boolean;
  capsuleRoleChanged: boolean;
  ladderChallenge: boolean;
  ladderChallengeResolved: boolean;
  directMessage: boolean;
  groupMessage: boolean;
  followNew: boolean;
  ladderMatchScheduled: boolean;
  ladderInvitedToJoin: boolean;
  partyInvite: boolean;
  partyInviteAccepted: boolean;
  mentionInChat: boolean;
  liveEventStarting: boolean;
  streamStatus: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  commentOnPost: true,
  commentReply: true,
  mention: true,
  postLike: true,
  capsuleNewPost: true,
  friendRequest: true,
  friendRequestAccepted: true,
  capsuleInvite: true,
  capsuleInviteAccepted: true,
  capsuleInviteDeclined: true,
  capsuleRequestPending: true,
  capsuleRequestApproved: true,
  capsuleRequestDeclined: true,
  capsuleRoleChanged: true,
  ladderChallenge: true,
  ladderChallengeResolved: true,
  directMessage: true,
  groupMessage: true,
  followNew: true,
  ladderMatchScheduled: true,
  ladderInvitedToJoin: true,
  partyInvite: true,
  partyInviteAccepted: true,
  mentionInChat: true,
  liveEventStarting: true,
  streamStatus: true,
};
