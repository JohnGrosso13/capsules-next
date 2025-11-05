import { useFriendsActions } from "@/lib/friends/store";
import { buildFriendTargetPayload } from "@/lib/friends/targets";

export type FriendLike = {
  userId?: string | null;
  key?: string | null;
  id?: string | null;
  name?: string | null;
  avatar?: string | null;
};

export function useFriendActions() {
  const actions = useFriendsActions();

  return {
    remove: async (friend: FriendLike) => {
      const target = buildFriendTargetPayload(friend);
      if (!target) {
        throw new Error("Unable to resolve friend target");
      }
      await actions.performTargetedMutation("remove", target);
    },
  } as const;
}
