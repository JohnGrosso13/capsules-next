export type PresenceStatus = "online" | "offline" | "away";

export type PresenceEntry = {
  status: PresenceStatus;
  updatedAt: string | null;
};

export type PresenceMap = Record<string, PresenceEntry>;

export type FriendItem = {
  id: string;
  userId: string | null;
  key: string | null;
  name: string;
  avatar: string | null;
  since: string | null;
  status: PresenceStatus;
};

export type RequestItem = {
  id: string;
  user: { name?: string | null } | null;
  kind: "incoming" | "outgoing";
};

export type PartyInviteItem = {
  id: string;
  partyId: string;
  hostName: string;
  hostAvatar: string | null;
  topic: string | null;
  expiresAt: string | null;
  senderId: string;
};

export type CapsuleInviteItem = {
  id: string;
  capsuleId: string;
  capsuleName: string;
  capsuleSlug: string | null;
  capsuleLogoUrl: string | null;
  inviterName: string | null;
};

export type FriendsCounters = {
  friends: number;
  chats: number;
  requests: number;
};

export type FriendsChannelInfo =
  | {
      events: string;
      presence: string;
    }
  | null;

/**
 * @deprecated Temporary alias for legacy imports. Prefer FriendsChannelInfo.
 */
export type LegacyFriendsChannelInfo = FriendsChannelInfo;
