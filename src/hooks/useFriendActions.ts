import { removeFriend } from "@/lib/api/friends";

export type FriendLike = {
  userId?: string | null;
  key?: string | null;
  id?: string | null;
  name?: string | null;
  avatar?: string | null;
};

export function buildFriendTargetPayload(friend: FriendLike): Record<string, string> | null {
  const target: Record<string, string> = {};
  if (friend.userId) target.userId = String(friend.userId);
  else if (friend.key) target.userKey = String(friend.key);
  else if (friend.id) target.id = String(friend.id);
  else return null;
  if (friend.name) target.name = String(friend.name);
  if (friend.avatar) target.avatar = String(friend.avatar);
  return target;
}

export function useFriendActions() {
  return {
    remove: async (target: Record<string, unknown>) => removeFriend(target),
  } as const;
}

