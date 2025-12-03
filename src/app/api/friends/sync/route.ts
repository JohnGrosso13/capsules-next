import { ensureUserFromRequest } from "@/lib/auth/payload";
import { buildPresenceChannelList, friendEventsChannel } from "@/services/realtime/friends";
import { listSocialGraph } from "@/lib/supabase/friends";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import {
  friendSyncRequestSchema,
  friendSyncResponseSchema,
} from "@/server/validation/schemas/friends";

export const runtime = "nodejs";

async function handle(req: Request) {
  const parsed = await parseJsonBody(req, friendSyncRequestSchema);
  const data = parsed.success ? parsed.data : { user: {} };

  const userPayload = data.user ?? {};
  const ownerId = await ensureUserFromRequest(req, userPayload, {
    allowGuests: process.env.NODE_ENV !== "production",
  });
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

    const eventsChannel = friendEventsChannel(ownerId);
    const presenceChannels = buildPresenceChannelList(
      ownerId,
      graph.friends.map((friend) => friend.friendUserId),
    );

    return validatedJson(friendSyncResponseSchema, {
      friends,
      graph,
      channels: { events: eventsChannel, presence: presenceChannels },
      viewerId: ownerId,
    });
  } catch (error) {
    console.error("Friends sync error", error);
    return returnError(500, "friends_sync_failed", "Failed to load friends");
  }
}

export async function POST(req: Request) {
  return handle(req);
}

// Some environments prefetch without a body; support GET as a convenience in dev.
export async function GET(req: Request) {
  return handle(req);
}
