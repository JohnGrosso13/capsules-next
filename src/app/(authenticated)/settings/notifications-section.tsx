"use client";

import * as React from "react";

import cards from "@/components/cards.module.css";
import { notificationSettingsSchema } from "@/server/validation/schemas/notifications";
import type { NotificationSettings } from "@/shared/notifications";

import layout from "./settings.module.css";
import styles from "./notifications-section.module.css";

type ToggleKey = keyof NotificationSettings;

type NotificationsSettingsSectionProps = {
  initialSettings: NotificationSettings;
};

const OPTIONS: Array<{
  key: ToggleKey;
  title: string;
  description: string;
}> = [
  {
    key: "commentOnPost",
    title: "Comments on my posts",
    description: "Get notified when someone comments on something you've shared.",
  },
  {
    key: "commentReply",
    title: "Replies to my comments",
    description: "Pings when someone responds to your comment threads.",
  },
  {
    key: "mention",
    title: "Mentions",
    description: "Alerts when someone @mentions you in posts or comments.",
  },
  {
    key: "postLike",
    title: "Likes on my posts",
    description: "Heads-up when someone likes your post.",
  },
  {
    key: "capsuleNewPost",
    title: "New posts in my capsules",
    description: "Alerts when collaborators publish new posts in capsules you belong to.",
  },
  {
    key: "friendRequest",
    title: "Friend requests",
    description: "Pings when another member sends you a friend request.",
  },
  {
    key: "friendRequestAccepted",
    title: "Friend request accepted",
    description: "Confirmation when someone accepts your friend request.",
  },
  {
    key: "capsuleInvite",
    title: "Capsule invites",
    description: "Invitations to join a capsule or collaborate on new drops.",
  },
  {
    key: "capsuleInviteAccepted",
    title: "Capsule invite accepted",
    description: "Updates when someone accepts your capsule invite.",
  },
  {
    key: "capsuleInviteDeclined",
    title: "Capsule invite declined",
    description: "Letdowns happen—get notified if an invite is declined.",
  },
  {
    key: "capsuleRequestPending",
    title: "Capsule join requests",
    description: "Alerts owners when a viewer requests to join a capsule.",
  },
  {
    key: "capsuleRequestApproved",
    title: "Join request approved",
    description: "Know when your request to join a capsule is approved.",
  },
  {
    key: "capsuleRequestDeclined",
    title: "Join request declined",
    description: "Find out if your capsule join request is declined.",
  },
  {
    key: "capsuleRoleChanged",
    title: "Role changes",
    description: "Notifications for promotions or role updates inside capsules.",
  },
  {
    key: "ladderChallenge",
    title: "Ladder challenges",
    description: "Heads-ups when someone challenges you on a capsule ladder.",
  },
  {
    key: "ladderChallengeResolved",
    title: "Challenge results",
    description: "Match outcomes or resolution updates for your ladder challenges.",
  },
  {
    key: "directMessage",
    title: "Direct messages",
    description: "New DMs from other members.",
  },
  {
    key: "groupMessage",
    title: "Group chat messages",
    description: "New messages in group or party chats you're in.",
  },
  {
    key: "mentionInChat",
    title: "Mentions in chat",
    description: "Alerts when someone @mentions you inside chats.",
  },
  {
    key: "followNew",
    title: "New followers",
    description: "Updates when someone new follows you.",
  },
  {
    key: "ladderMatchScheduled",
    title: "Ladder matches scheduled",
    description: "Scheduling updates or match slots on ladders.",
  },
  {
    key: "ladderInvitedToJoin",
    title: "Invited to a ladder",
    description: "Invitations to participate in a ladder.",
  },
  {
    key: "partyInvite",
    title: "Party invites",
    description: "Invitations to join a party or group session.",
  },
  {
    key: "partyInviteAccepted",
    title: "Party invite accepted",
    description: "Notifications when someone accepts your party invite.",
  },
  {
    key: "liveEventStarting",
    title: "Live sessions starting",
    description: "Alerts when a live event or stream is kicking off.",
  },
  {
    key: "streamStatus",
    title: "Stream health/status",
    description: "Issues or updates about your live streams or recordings.",
  },
];

function coerceSettings(
  fallback: NotificationSettings,
  updates: Partial<NotificationSettings> | null,
): NotificationSettings {
  if (!updates) return fallback;
  const parsed = notificationSettingsSchema.safeParse({
    ...fallback,
    ...updates,
  });
  return parsed.success ? parsed.data : fallback;
}

export function NotificationsSettingsSection({
  initialSettings,
}: NotificationsSettingsSectionProps): React.JSX.Element {
  const [settings, setSettings] = React.useState<NotificationSettings>(initialSettings);
  const [savingKey, setSavingKey] = React.useState<ToggleKey | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleToggle = React.useCallback(
    async (key: ToggleKey) => {
      const nextValue = !settings[key];
      setSettings((prev) => ({ ...prev, [key]: nextValue }));
      setSavingKey(key);
      setError(null);

      try {
        const response = await fetch("/api/notifications/settings", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: nextValue }),
        });
        const payload = (await response.json().catch(() => null)) as
          | Partial<NotificationSettings>
          | { error?: string }
          | null;

        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Unable to save your preference right now.";
          throw new Error(message);
        }

        setSettings((prev) => coerceSettings(prev, payload as Partial<NotificationSettings>));
      } catch (err) {
        console.error("notifications settings update error", err);
        setSettings((prev) => ({ ...prev, [key]: !nextValue }));
        const message =
          err instanceof Error && err.message
            ? err.message
            : "We couldn't save that change. Please try again.";
        setError(message);
      } finally {
        setSavingKey(null);
      }
    },
    [settings],
  );

  React.useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(timer);
  }, [error]);

  return (
    <article className={`${cards.card} ${layout.card} ${styles.card}`.trim()}>
      <header className={cards.cardHead}>
        <div>
          <p className={styles.cardTitle}>Notifications</p>
          <p className={styles.cardSubtitle}>Choose which updates reach your bell.</p>
        </div>
        {error ? (
          <span className={styles.error} role="status">
            {error}
          </span>
        ) : null}
      </header>
      <div className={cards.cardBody}>
        <div className={styles.options}>
          {OPTIONS.map((option) => {
            const enabled = Boolean(settings[option.key]);
            const isSaving = savingKey === option.key;
            return (
              <div key={option.key} className={styles.option}>
                <div className={styles.optionText}>
                  <div className={styles.optionTitle}>{option.title}</div>
                  <p className={styles.optionDescription}>{option.description}</p>
                </div>
                <button
                  type="button"
                  className={`${styles.toggle} ${enabled ? styles.toggleOn : ""} ${
                    isSaving ? styles.toggleBusy : ""
                  }`.trim()}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={option.title}
                  disabled={isSaving}
                  onClick={() => handleToggle(option.key)}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}
