import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { listNotificationsForUser, markNotificationsRead } from "@/server/notifications/service";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { notificationListResponseSchema } from "@/server/validation/schemas/notifications";

export const runtime = "nodejs";

const markRequestSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
  all: z.literal(true).optional(),
});

const markResponseSchema = notificationListResponseSchema.extend({
  updated: z.number(),
});

function parseLimit(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, 1), 100);
}

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const unreadOnly =
    url.searchParams.get("unread") === "1" ||
    url.searchParams.get("unread") === "true" ||
    url.searchParams.get("filter") === "unread";

  try {
    const options: { limit?: number; unreadOnly?: boolean } = { unreadOnly };
    if (limit !== null) {
      options.limit = limit;
    }

    const { notifications, unreadCount } = await listNotificationsForUser(ownerId, options);
    return validatedJson(notificationListResponseSchema, { notifications, unreadCount });
  } catch (error) {
    console.error("notifications.list error", error);
    const message = error instanceof Error ? error.message : "Failed to load notifications.";
    return returnError(500, "notifications_fetch_failed", message);
  }
}

export async function PATCH(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await parseJsonBody(req, markRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const ids = parsed.data.ids ?? [];
  const markAll = parsed.data.all === true;

  if (!markAll && (!Array.isArray(ids) || ids.length === 0)) {
    return returnError(400, "invalid_request", "Provide notification ids or set all=true.");
  }

  try {
    const updated = await markNotificationsRead(ownerId, { ids: markAll ? null : ids });
    const { notifications, unreadCount } = await listNotificationsForUser(ownerId, { limit: 30 });
    return validatedJson(markResponseSchema, { updated, notifications, unreadCount });
  } catch (error) {
    console.error("notifications.mark_read error", error);
    const message = error instanceof Error ? error.message : "Failed to update notifications.";
    return returnError(500, "notifications_update_failed", message);
  }
}

export async function POST(req: Request) {
  return PATCH(req);
}
