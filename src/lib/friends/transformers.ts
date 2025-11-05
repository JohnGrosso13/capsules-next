import type {
  FriendSummary,
  FriendRequestSummary,
  SocialGraphSnapshot,
} from "@/lib/supabase/friends";
import type { PartyInviteSummary } from "@/types/party";

import {
  ASSISTANT_DEFAULT_AVATAR,
  ASSISTANT_DISPLAY_NAME,
  ASSISTANT_USER_ID,
  ASSISTANT_USER_KEY,
} from "@/shared/assistant/constants";
import type {
  FriendItem,
  FriendsCounters,
  PartyInviteItem,
  PresenceMap,
  RequestItem,
} from "./types";

export const FALLBACK_DISPLAY_FRIENDS: FriendItem[] = [
  {
    id: `assistant-${ASSISTANT_USER_ID}`,
    userId: ASSISTANT_USER_ID,
    key: ASSISTANT_USER_KEY,
    name: ASSISTANT_DISPLAY_NAME,
    avatar: ASSISTANT_DEFAULT_AVATAR,
    since: null,
    status: "online",
  },
  {
    id: "capsules",
    userId: "capsules",
    key: null,
    name: "Capsules Team",
    avatar: null,
    since: null,
    status: "offline",
  },
  {
    id: "memory",
    userId: "memory",
    key: null,
    name: "Memory Bot",
    avatar: null,
    since: null,
    status: "offline",
  },
  {
    id: "dream",
    userId: "dream",
    key: null,
    name: "Dream Studio",
    avatar: null,
    since: null,
    status: "offline",
  },
];

export function mapFriendSummaries(
  summaries: FriendSummary[] | undefined,
  presence: PresenceMap,
): FriendItem[] {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return [];
  }

  const mapped: FriendItem[] = summaries.map((summary, index) => {
    const presenceKey = summary.friendUserId || summary.user?.key || summary.user?.id || summary.id;
    const presenceEntry = presenceKey ? presence[presenceKey] : undefined;
    const isAssistant = summary.friendUserId === ASSISTANT_USER_ID;
    const status = isAssistant ? "online" : presenceEntry?.status ?? "offline";

    const fallbackName = "Friend";
    const fallbackId = summary.id || summary.friendUserId || summary.user?.key || `friend-${index}`;

    return {
      id: String(fallbackId),
      userId: summary.friendUserId ?? null,
      key: summary.user?.key ?? null,
      name: summary.user?.name ?? fallbackName,
      avatar: summary.user?.avatarUrl ?? null,
      since: summary.since ?? null,
      status,
    };
  });

  const assistantIndex = mapped.findIndex((friend) => friend.userId === ASSISTANT_USER_ID);
  if (assistantIndex > 0) {
    const [assistantFriend] = mapped.splice(assistantIndex, 1);
    if (assistantFriend) {
      mapped.unshift(assistantFriend);
    }
  }

  return mapped;
}

export function mapRequestSummaries(
  summaries: FriendRequestSummary[] | undefined,
  kind: "incoming" | "outgoing",
): RequestItem[] {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return [];
  }
  return summaries.map((summary) => ({
    id: summary.id,
    user: summary.user ? { name: summary.user.name } : null,
    kind,
  }));
}

export function mapPartyInviteSummaries(
  summaries: PartyInviteSummary[] | undefined,
): PartyInviteItem[] {
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return [];
  }
  return summaries.map((invite) => ({
    id: invite.id,
    partyId: invite.partyId,
    hostName: invite.sender?.name ?? "Party host",
    hostAvatar: invite.sender?.avatarUrl ?? null,
    topic: invite.topic ?? null,
    expiresAt: invite.expiresAt ?? null,
    senderId: invite.senderId,
  }));
}

function countRealFriends(summaries: FriendSummary[] | undefined): number {
  if (!Array.isArray(summaries)) return 0;
  return summaries.filter((summary) => summary.friendUserId && summary.friendUserId !== ASSISTANT_USER_ID)
    .length;
}

export function deriveCounters(
  summaries: FriendSummary[] | undefined,
  incoming: FriendRequestSummary[] | undefined,
  partyInvites: PartyInviteItem[],
): FriendsCounters {
  const realFriendCount = countRealFriends(summaries);
  const requestCount = (incoming?.length ?? 0) + partyInvites.length;
  return {
    friends: realFriendCount > 0 ? realFriendCount : 0,
    chats: 0,
    requests: requestCount,
  };
}

export function hasRealFriends(summaries: FriendSummary[] | undefined): boolean {
  return countRealFriends(summaries) > 0;
}

export function applyPresenceToSummaries(
  graph: SocialGraphSnapshot | null,
  presence: PresenceMap,
): FriendItem[] {
  const friends = mapFriendSummaries(graph?.friends ?? [], presence);
  return friends.length > 0 ? friends : FALLBACK_DISPLAY_FRIENDS;
}
