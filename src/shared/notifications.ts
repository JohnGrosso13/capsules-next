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
  commentOnPostEmail: boolean;
  capsuleNewPost: boolean;
  capsuleNewPostEmail: boolean;
  friendRequest: boolean;
  friendRequestEmail: boolean;
  friendRequestAccepted: boolean;
  friendRequestAcceptedEmail: boolean;
  postLike: boolean;
  postLikeEmail: boolean;
  commentReply: boolean;
  commentReplyEmail: boolean;
  mention: boolean;
  mentionEmail: boolean;
  capsuleInvite: boolean;
  capsuleInviteEmail: boolean;
  capsuleInviteAccepted: boolean;
  capsuleInviteAcceptedEmail: boolean;
  capsuleInviteDeclined: boolean;
  capsuleInviteDeclinedEmail: boolean;
  capsuleRequestPending: boolean;
  capsuleRequestPendingEmail: boolean;
  capsuleRequestApproved: boolean;
  capsuleRequestApprovedEmail: boolean;
  capsuleRequestDeclined: boolean;
  capsuleRequestDeclinedEmail: boolean;
  capsuleRoleChanged: boolean;
  capsuleRoleChangedEmail: boolean;
  ladderChallenge: boolean;
  ladderChallengeEmail: boolean;
  ladderChallengeResolved: boolean;
  ladderChallengeResolvedEmail: boolean;
  directMessage: boolean;
  directMessageEmail: boolean;
  groupMessage: boolean;
  groupMessageEmail: boolean;
  followNew: boolean;
  followNewEmail: boolean;
  ladderMatchScheduled: boolean;
  ladderMatchScheduledEmail: boolean;
  ladderInvitedToJoin: boolean;
  ladderInvitedToJoinEmail: boolean;
  partyInvite: boolean;
  partyInviteEmail: boolean;
  partyInviteAccepted: boolean;
  partyInviteAcceptedEmail: boolean;
  mentionInChat: boolean;
  mentionInChatEmail: boolean;
  liveEventStarting: boolean;
  liveEventStartingEmail: boolean;
  streamStatus: boolean;
  streamStatusEmail: boolean;
  emailDigestFrequency: "instant" | "daily" | "weekly" | "off";
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  commentOnPost: true,
  commentOnPostEmail: true,
  commentReply: true,
  commentReplyEmail: true,
  mention: true,
  mentionEmail: true,
  postLike: true,
  postLikeEmail: true,
  capsuleNewPost: true,
  capsuleNewPostEmail: true,
  friendRequest: true,
  friendRequestEmail: true,
  friendRequestAccepted: true,
  friendRequestAcceptedEmail: true,
  capsuleInvite: true,
  capsuleInviteEmail: true,
  capsuleInviteAccepted: true,
  capsuleInviteAcceptedEmail: true,
  capsuleInviteDeclined: true,
  capsuleInviteDeclinedEmail: true,
  capsuleRequestPending: true,
  capsuleRequestPendingEmail: true,
  capsuleRequestApproved: true,
  capsuleRequestApprovedEmail: true,
  capsuleRequestDeclined: true,
  capsuleRequestDeclinedEmail: true,
  capsuleRoleChanged: true,
  capsuleRoleChangedEmail: true,
  ladderChallenge: true,
  ladderChallengeEmail: true,
  ladderChallengeResolved: true,
  ladderChallengeResolvedEmail: true,
  directMessage: true,
  directMessageEmail: true,
  groupMessage: true,
  groupMessageEmail: true,
  followNew: true,
  followNewEmail: true,
  ladderMatchScheduled: true,
  ladderMatchScheduledEmail: true,
  ladderInvitedToJoin: true,
  ladderInvitedToJoinEmail: true,
  partyInvite: true,
  partyInviteEmail: true,
  partyInviteAccepted: true,
  partyInviteAcceptedEmail: true,
  mentionInChat: true,
  mentionInChatEmail: true,
  liveEventStarting: true,
  liveEventStartingEmail: true,
  streamStatus: true,
  streamStatusEmail: true,
  emailDigestFrequency: "instant",
};
