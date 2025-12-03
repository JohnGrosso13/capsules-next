"use server";

import { friendEventsChannel, buildPresenceChannelList } from "@/services/realtime/friends";
import { listSocialGraph } from "@/server/friends/service";
import {
  performFriendMutation,
  type FriendMutationOutcome,
} from "@/server/friends/mutations";
import type { FriendUpdateRequest, FriendAction } from "@/server/validation/schemas/friends";
import type { SocialGraphSnapshot } from "@/lib/supabase/friends";
import type { FriendsChannelInfo } from "@/lib/friends/types";
import { ensureUserSession } from "@/server/actions/session";

type MutationInput = Omit<FriendUpdateRequest, "user">;

export type FriendsSnapshotActionResult = {
  viewerId: string;
  graph: SocialGraphSnapshot;
  channels: FriendsChannelInfo;
};

export type FriendMutationActionInput = MutationInput;

export type FriendMutationActionResult = Pick<FriendMutationOutcome, "action" | "result" | "graph"> & {
  channels?: FriendsChannelInfo;
};

export async function loadFriendsSnapshotAction(): Promise<FriendsSnapshotActionResult> {
  const { supabaseUserId } = await ensureUserSession();
  const graph = await listSocialGraph(supabaseUserId);
  const channels: FriendsChannelInfo = {
    events: friendEventsChannel(supabaseUserId),
    presence: buildPresenceChannelList(
      supabaseUserId,
      graph.friends.map((friend) => friend.friendUserId),
    ),
  };
  return {
    viewerId: supabaseUserId,
    graph,
    channels,
  };
}

export async function mutateFriendsGraphAction(
  input: FriendMutationActionInput,
): Promise<FriendMutationActionResult> {
  const { supabaseUserId } = await ensureUserSession();
  const request: FriendUpdateRequest = {
    ...input,
    action: input.action as FriendAction,
  };
  const outcome = await performFriendMutation(supabaseUserId, request);
  const channels: FriendsChannelInfo = {
    events: friendEventsChannel(supabaseUserId),
    presence: buildPresenceChannelList(
      supabaseUserId,
      outcome.graph.friends.map((friend) => friend.friendUserId),
    ),
  };
  return {
    action: outcome.action,
    result: outcome.result,
    graph: outcome.graph,
    channels,
  };
}
