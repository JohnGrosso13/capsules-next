import { ensureUserFromRequest } from "@/lib/auth/payload";
import { PRESENCE_CHANNEL } from "@/lib/realtime/ably-server";
import { listSocialGraph } from "@/lib/supabase/friends";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { friendSyncRequestSchema, friendSyncResponseSchema } from "@/server/validation/schemas/friends";

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, friendSyncRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const userPayload = parsed.data.user ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload);
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  try {
    const graph = await listSocialGraph(ownerId);
    const friends = graph.friends.map((friend) => ({
      id: friend.id,
      userId: friend.friendUserId,
      key: friend.user?.key ?? null,
      name: friend.user?.name ?? "Friend",
      avatar: friend.user?.avatarUrl ?? null,
      since: friend.since,
      status: "offline" as const,
    }));

    const eventsChannel = `user:${ownerId}:friends`;


    return validatedJson(friendSyncResponseSchema, {
      friends,
      graph,
      channels: { events: eventsChannel, presence: PRESENCE_CHANNEL },
    });
  } catch (error) {
    console.error("Friends sync error", error);
    return returnError(500, "friends_sync_failed", "Failed to load friends");
  }
}

