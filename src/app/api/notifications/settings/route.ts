import { ensureUserFromRequest } from "@/lib/auth/payload";
import { getNotificationSettings, updateNotificationSettings } from "@/server/notifications/service";
import type { NotificationSettings } from "@/shared/notifications";
import { returnError, validatedJson, parseJsonBody } from "@/server/validation/http";
import { notificationSettingsSchema } from "@/server/validation/schemas/notifications";

export const runtime = "nodejs";

const updateSchema = notificationSettingsSchema.partial();

export async function GET(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  try {
    const settings = await getNotificationSettings(ownerId);
    return validatedJson(notificationSettingsSchema, settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load notification settings.";
    return returnError(500, "notification_settings_fetch_failed", message);
  }
}

export async function PATCH(req: Request) {
  const ownerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!ownerId) {
    return returnError(401, "auth_required", "Authentication required");
  }

  const parsed = await parseJsonBody(req, updateSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const payload = Object.entries(parsed.data).reduce<Partial<NotificationSettings>>((acc, [key, value]) => {
    if (typeof value !== "undefined") {
      acc[key as keyof NotificationSettings] = Boolean(value);
    }
    return acc;
  }, {});

  try {
    const settings = await updateNotificationSettings(ownerId, payload);
    return validatedJson(notificationSettingsSchema, settings);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update notification settings.";
    return returnError(500, "notification_settings_update_failed", message);
  }
}

export async function POST(req: Request) {
  return PATCH(req);
}
