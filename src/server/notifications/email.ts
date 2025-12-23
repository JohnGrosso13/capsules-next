import { getDatabaseAdminClient } from "@/config/database";
import { getEmailService } from "@/config/email";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type NotificationType,
} from "@/shared/notifications";

import { getNotificationSettings, isEmailNotificationEnabled } from "./service";

type RecipientProfile = {
  email: string | null;
  name: string | null;
};

type SendNotificationEmailInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  data?: Record<string, unknown> | null;
  actorName?: string | null;
  respectPreferences?: boolean;
  settingsCache?: Map<string, NotificationSettings>;
};

function buildAbsoluteHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const base = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null;
  if (!base) return href;
  try {
    const url = new URL(href, base);
    return url.toString();
  } catch {
    return href;
  }
}

async function fetchRecipientProfile(userId: string): Promise<RecipientProfile> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("users")
    .select<{ email: string | null; full_name: string | null }>("email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (result.error) {
    console.warn("notifications.email.profile_lookup_failed", result.error);
    return { email: null, name: null };
  }

  return {
    email: result.data?.email ?? null,
    name: result.data?.full_name ?? null,
  };
}

function renderNotificationEmailHtml(params: {
  title: string;
  body?: string | null;
  href?: string | null;
  actorName?: string | null;
}): { html: string; text: string } {
  const buttonHref = buildAbsoluteHref(params.href);
  const safeBody = params.body ?? "";
  const actor = params.actorName ? `<p style="margin:0 0 12px 0;color:#64748b;">From: ${params.actorName}</p>` : "";
  const html = `
  <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#0b1222; color:#e2e8f0; padding:24px;">
    <div style="max-width:560px; margin:0 auto; background:#0f172a; border:1px solid #1e293b; border-radius:16px; padding:24px;">
      <h2 style="margin-top:0; color:#e2e8f0; font-size:20px;">${params.title}</h2>
      ${actor}
      <p style="margin:0 0 18px 0; line-height:1.6; color:#cbd5e1;">${safeBody || ""}</p>
      ${
        buttonHref
          ? `<a href="${buttonHref}" style="display:inline-block; padding:12px 18px; background:linear-gradient(120deg,#2563eb,#22d3ee); color:#0b1222; border-radius:10px; font-weight:700; text-decoration:none;">Open in Capsules</a>`
          : ""
      }
      <p style="margin:18px 0 0 0; color:#64748b; font-size:12px;">You can manage email preferences in Settings &gt; Notifications.</p>
    </div>
  </div>
`;

  const textLines = [
    params.title,
    params.actorName ? `From: ${params.actorName}` : null,
    safeBody,
    buttonHref ? `Open: ${buttonHref}` : null,
    "Manage preferences in Settings > Notifications.",
  ].filter(Boolean);

  return { html, text: textLines.join("\n\n") };
}

export async function sendNotificationEmail(input: SendNotificationEmailInput): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") {
    console.warn("notifications.email.skipped_edge_runtime");
    return;
  }
  const normalizedUserId = input.userId.trim();
  if (!normalizedUserId) return;

  const respectPreferences = input.respectPreferences !== false;
  let settings: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS };

  if (respectPreferences) {
    if (input.settingsCache?.has(normalizedUserId)) {
      settings = input.settingsCache.get(normalizedUserId)!;
    } else {
      settings = await getNotificationSettings(normalizedUserId);
      if (input.settingsCache) {
        input.settingsCache.set(normalizedUserId, settings);
      }
    }

    if (!isEmailNotificationEnabled(input.type, settings)) {
      return;
    }
  }

  const profile = await fetchRecipientProfile(normalizedUserId);
  if (!profile.email) return;

  const { html, text } = renderNotificationEmailHtml({
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
    actorName: input.actorName ?? (input.data?.actorName as string | null) ?? null,
  });

  try {
    const emailService = getEmailService();
    await emailService.send({
      to: profile.email,
      subject: input.title,
      html,
      text,
    });
  } catch (error) {
    console.warn("notifications.email.send_failed", error);
  }
}

export async function sendNotificationEmails(
  recipients: string[],
  payload: Omit<SendNotificationEmailInput, "userId">,
  options: { respectPreferences?: boolean } = {},
): Promise<void> {
  const unique = Array.from(new Set(recipients.map((id) => id?.trim()).filter(Boolean))) as string[];
  if (!unique.length) return;
  const cache = payload.settingsCache ?? new Map<string, NotificationSettings>();

  await Promise.all(
    unique.map((userId) => {
      const respectPreferences =
        options.respectPreferences ?? payload.respectPreferences ?? undefined;
      const emailInput: SendNotificationEmailInput = {
        ...payload,
        userId,
        settingsCache: cache,
      };
      if (typeof respectPreferences !== "undefined") {
        emailInput.respectPreferences = respectPreferences;
      }
      return sendNotificationEmail(emailInput);
    }),
  );
}
