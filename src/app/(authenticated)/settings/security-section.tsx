"use client";

import * as React from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import type { SessionActivity, SessionWithActivitiesResource } from "@clerk/types";

import { Button } from "@/components/ui/button";
import cards from "@/components/cards.module.css";

import layout from "./settings.module.css";
import styles from "./security-section.module.css";

type BlockedUser = {
  id: string;
  blockedId: string;
  name: string;
  avatarUrl: string | null;
  key: string | null;
  blockedAt: string | null;
  reason: string | null;
};

type PrivacySetting = "public" | "private";

function formatLastActive(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return "Unknown";
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) {
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    return formatter.format(diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMs / 3_600_000);
  if (Math.abs(diffHours) < 48) {
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    return formatter.format(diffHours, "hour");
  }
  return date.toLocaleString();
}

function describeActivity(activity: SessionActivity | undefined): string {
  if (!activity) return "Unknown device";
  const parts: string[] = [];
  if (activity.deviceType) {
    parts.push(activity.deviceType);
  } else if (activity.browserName) {
    parts.push(activity.browserName);
  }
  if (activity.browserVersion) {
    parts.push(activity.browserVersion);
  }
  const location = [activity.city, activity.country].filter(Boolean).join(", ");
  if (location) {
    parts.push(location);
  }
  return parts.length ? parts.join(" · ") : "Unknown device";
}

export function SecurityPrivacySection(): React.JSX.Element {
  const clerk = useClerk();
  const { sessionId: activeSessionId } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const [sessions, setSessions] = React.useState<SessionWithActivitiesResource[]>([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(false);
  const [sessionsError, setSessionsError] = React.useState<string | null>(null);
  const [revokingIds, setRevokingIds] = React.useState<Set<string>>(new Set());

  const [blocked, setBlocked] = React.useState<BlockedUser[]>([]);
  const [blockedLoading, setBlockedLoading] = React.useState(false);
  const [blockedError, setBlockedError] = React.useState<string | null>(null);
  const [unblockingId, setUnblockingId] = React.useState<string | null>(null);

  const [privacy, setPrivacy] = React.useState<PrivacySetting | null>(null);
  const [privacySaving, setPrivacySaving] = React.useState(false);
  const [privacyError, setPrivacyError] = React.useState<string | null>(null);

  const [requestNote, setRequestNote] = React.useState("");
  const [requestStatus, setRequestStatus] = React.useState<{
    type: "export" | "delete" | null;
    message: string | null;
    tone: "success" | "error" | null;
  }>({ type: null, message: null, tone: null });
  const [requestPending, setRequestPending] = React.useState<"export" | "delete" | null>(null);

  const refreshSessions = React.useCallback(async () => {
    if (!userLoaded || !user) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const result = await user.getSessions();
      setSessions(result ?? []);
    } catch (error) {
      console.error("security.sessions.load_failed", error);
      setSessionsError("Unable to load your sessions right now.");
    } finally {
      setSessionsLoading(false);
    }
  }, [user, userLoaded]);

  const handleRevokeSession = React.useCallback(
    async (id: string) => {
      const target = sessions.find((session) => session.id === id);
      if (!target) return;
      setRevokingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setSessionsError(null);
      try {
        await target.revoke();
        setSessions((prev) => prev.filter((session) => session.id !== id));
      } catch (error) {
        console.error("security.sessions.revoke_failed", error);
        setSessionsError("Unable to sign out that session. Try again.");
      } finally {
        setRevokingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [sessions],
  );

  const handleRevokeOthers = React.useCallback(async () => {
    if (!sessions.length) return;
    const targets = sessions.filter((session) => session.id !== activeSessionId);
    if (!targets.length) return;
    setSessionsLoading(true);
    try {
      for (const entry of targets) {
        try {
          await entry.revoke();
        } catch (error) {
          console.error("security.sessions.revoke_other_failed", error);
        }
      }
      await refreshSessions();
    } finally {
      setSessionsLoading(false);
    }
  }, [activeSessionId, refreshSessions, sessions]);

  const loadBlocked = React.useCallback(async () => {
    setBlockedLoading(true);
    setBlockedError(null);
    try {
      const response = await fetch("/api/friends/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: {} }),
      });
      if (!response.ok) {
        throw new Error(`Blocked list failed (${response.status})`);
      }
      const payload = (await response.json()) as {
        graph?: { blocked?: Array<unknown> };
      };
      const blockedList = Array.isArray(payload.graph?.blocked) ? payload.graph?.blocked : [];
      const normalized = blockedList
        .map((raw) => {
          const entry = raw as {
            id?: unknown;
            blockedId?: unknown;
            createdAt?: unknown;
            reason?: unknown;
            user?: { name?: unknown; avatarUrl?: unknown; key?: unknown } | null;
          };
          const blockedId = typeof entry.blockedId === "string" ? entry.blockedId : null;
          if (!blockedId) return null;
          const name =
            typeof entry.user?.name === "string" && entry.user.name.trim().length
              ? entry.user.name
              : "Blocked user";
          return {
            id: typeof entry.id === "string" ? entry.id : blockedId,
            blockedId,
            key: typeof entry.user?.key === "string" ? entry.user.key : null,
            name,
            avatarUrl: typeof entry.user?.avatarUrl === "string" ? entry.user.avatarUrl : null,
            blockedAt: typeof entry.createdAt === "string" ? entry.createdAt : null,
            reason: typeof entry.reason === "string" ? entry.reason : null,
          } satisfies BlockedUser;
        })
        .filter(Boolean) as BlockedUser[];
      setBlocked(normalized);
    } catch (error) {
      console.error("security.blocked.load_failed", error);
      setBlockedError("Unable to load blocked users.");
    } finally {
      setBlockedLoading(false);
    }
  }, []);

  const handleUnblock = React.useCallback(async (entry: BlockedUser) => {
    setUnblockingId(entry.blockedId);
    setBlockedError(null);
    try {
      const response = await fetch("/api/friends/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unblock",
          target: {
            userId: entry.blockedId,
            id: entry.blockedId,
            key: entry.key ?? undefined,
            name: entry.name ?? undefined,
            avatar: entry.avatarUrl ?? undefined,
          },
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Unblock failed (${response.status})`);
      }
      setBlocked((prev) => prev.filter((item) => item.blockedId !== entry.blockedId));
    } catch (error) {
      console.error("security.blocked.unblock_failed", error);
      setBlockedError("Unable to unblock that user right now.");
    } finally {
      setUnblockingId(null);
    }
  }, []);

  const loadPrivacy = React.useCallback(async () => {
    setPrivacySaving(true);
    setPrivacyError(null);
    try {
      const response = await fetch("/api/account/profile/privacy");
      if (!response.ok) {
        throw new Error(`Privacy fetch failed (${response.status})`);
      }
      const payload = (await response.json()) as { statsVisibility?: PrivacySetting };
      const visibility = payload.statsVisibility === "private" ? "private" : "public";
      setPrivacy(visibility);
    } catch (error) {
      console.error("security.privacy.load_failed", error);
      setPrivacyError("Unable to load privacy settings.");
    } finally {
      setPrivacySaving(false);
    }
  }, []);

  const savePrivacy = React.useCallback(
    async (next: PrivacySetting) => {
      if (privacy === next) return;
      setPrivacySaving(true);
      setPrivacyError(null);
      try {
        const response = await fetch("/api/account/profile/privacy", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ statsVisibility: next }),
        });
        if (!response.ok) {
          const message = await response.text().catch(() => "");
          throw new Error(message || `Privacy update failed (${response.status})`);
        }
        const payload = (await response.json()) as { statsVisibility?: PrivacySetting };
        setPrivacy(payload.statsVisibility === "private" ? "private" : "public");
      } catch (error) {
        console.error("security.privacy.update_failed", error);
        setPrivacyError("We couldn't save that privacy change. Try again.");
      } finally {
        setPrivacySaving(false);
      }
    },
    [privacy],
  );

  const submitPrivacyRequest = React.useCallback(
    async (type: "export" | "delete") => {
      setRequestPending(type);
      setRequestStatus({ type, message: null, tone: null });
      try {
        const response = await fetch("/api/account/privacy/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            note: requestNote.trim().length ? requestNote.trim() : undefined,
          }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || `Request failed (${response.status})`);
        }
        setRequestStatus({
          type,
          message:
            type === "export"
              ? "Data export request recorded. We'll follow up shortly."
              : "Delete request recorded. Our team will follow up before deleting anything.",
          tone: "success",
        });
      } catch (error) {
        console.error("security.privacy.request_failed", error);
        setRequestStatus({
          type,
          message: "Unable to record that request. Please try again.",
          tone: "error",
        });
      } finally {
        setRequestPending(null);
      }
    },
    [requestNote],
  );

  React.useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  React.useEffect(() => {
    void loadBlocked();
  }, [loadBlocked]);

  React.useEffect(() => {
    void loadPrivacy();
  }, [loadPrivacy]);

  const twoFactorEnabled = userLoaded ? Boolean(user?.twoFactorEnabled) : false;
  const passwordEnabled = userLoaded ? Boolean(user?.passwordEnabled) : false;

  return (
    <section aria-label="Security and privacy settings" className={styles.sectionCard}>
      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Sessions & devices</h3>
          <div className={styles.actionsRow}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={layout.settingsCtaSecondary}
              onClick={() => {
                void refreshSessions();
              }}
              loading={sessionsLoading}
            >
              Refresh
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void handleRevokeOthers();
              }}
              disabled={
                sessionsLoading ||
                !sessions.some((session) => session.id !== activeSessionId)
              }
            >
              Sign out others
            </Button>
          </div>
        </header>
        <div className={cards.cardBody}>
          <p className={styles.helper}>
            See everywhere you&apos;re signed in. Revoke sessions to sign out devices you no longer
            trust.
          </p>

          {sessionsError ? <p className={styles.error}>{sessionsError}</p> : null}
          {sessionsLoading && !sessions.length ? (
            <p className={styles.helper}>Loading your active sessions...</p>
          ) : null}

          {sessions.length ? (
            <div className={styles.sessionList}>
              {sessions.map((session) => {
                const isCurrent = session.id === activeSessionId;
                const lastActive =
                  session.lastActiveAt instanceof Date
                    ? session.lastActiveAt
                    : new Date(session.lastActiveAt);
                const busy = revokingIds.has(session.id);
                return (
                  <div key={session.id} className={styles.sessionRow}>
                    <div className={styles.sessionMeta}>
                      <span className={styles.sessionLabel}>
                        {isCurrent ? "This device" : "Signed in device"}
                      </span>
                      <span className={styles.sessionDetail}>
                        {describeActivity(session.latestActivity)}
                      </span>
                      <span className={styles.sessionSubtle}>
                        Last active {formatLastActive(lastActive)}
                      </span>
                    </div>
                    <div className={styles.sessionActions}>
                      <Button
                        type="button"
                        size="sm"
                        variant={isCurrent ? "secondary" : "outline"}
                        className={
                          isCurrent ? layout.settingsCtaSecondary : layout.settingsCtaSecondary
                        }
                        onClick={() => {
                          if (!isCurrent) {
                            void handleRevokeSession(session.id);
                          }
                        }}
                        disabled={isCurrent}
                        loading={busy}
                      >
                        {isCurrent ? "Current" : "Sign out"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!sessionsLoading && !sessions.length && !sessionsError ? (
            <p className={styles.helper}>No active sessions found.</p>
          ) : null}
        </div>
      </article>

      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Sign-in security</h3>
          <div className={styles.actionsRow}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={layout.settingsCtaSecondary}
            onClick={() => {
              clerk.openUserProfile?.();
            }}
          >
            Manage in Clerk
          </Button>
          </div>
        </header>
        <div className={cards.cardBody}>
          <div className={styles.securityGrid}>
            <div className={styles.securityItem}>
              <span className={styles.securityLabel}>Two-factor authentication</span>
              <p className={styles.securityStatus} data-state={twoFactorEnabled ? "on" : "off"}>
                {twoFactorEnabled ? "Enabled" : "Off"}
              </p>
              <p className={styles.helper}>
                Add an authenticator app or passkey to keep your account safe.
              </p>
            </div>
            <div className={styles.securityItem}>
              <span className={styles.securityLabel}>Password</span>
              <p className={styles.securityStatus} data-state={passwordEnabled ? "on" : "off"}>
                {passwordEnabled ? "Set" : "Not set"}
              </p>
              <p className={styles.helper}>
                Use a strong password and enable 2FA for better protection.
              </p>
            </div>
          </div>
        </div>
      </article>

      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Privacy</h3>
        </header>
        <div className={cards.cardBody}>
          <p className={styles.helper}>
            Control who can see your profile stats across Capsules.
          </p>
          {privacyError ? <p className={styles.error}>{privacyError}</p> : null}
          <div className={styles.privacyOptions} role="radiogroup" aria-label="Profile visibility">
            {(["public", "private"] as PrivacySetting[]).map((option) => {
              const label = option === "public" ? "Public" : "Private";
              const description =
                option === "public"
                  ? "Visible to everyone, including non-members."
                  : "Only visible to you.";
              const active = privacy === option;
              return (
                <label
                  key={option}
                  className={`${styles.privacyOption} ${active ? styles.privacyOptionActive : ""}`.trim()}
                >
                  <input
                    type="radio"
                    name="stats-visibility"
                    value={option}
                    checked={active}
                    disabled={privacySaving || privacy === null}
                    onChange={() => {
                      void savePrivacy(option);
                    }}
                  />
                  <span className={styles.privacyText}>
                    <span className={styles.privacyTitle}>{label}</span>
                    <span className={styles.privacyDescription}>{description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </article>

      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Blocked users</h3>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={layout.settingsCtaSecondary}
            onClick={() => {
              void loadBlocked();
            }}
            loading={blockedLoading}
          >
            Refresh
          </Button>
        </header>
        <div className={cards.cardBody}>
          <p className={styles.helper}>
            Unblock someone to allow invites, follows, and messages again.
          </p>
          {blockedError ? <p className={styles.error}>{blockedError}</p> : null}
          {blockedLoading && !blocked.length ? (
            <p className={styles.helper}>Loading blocked users…</p>
          ) : null}
          {blocked.length ? (
            <div className={styles.blockedList}>
              {blocked.map((entry) => (
                <div key={entry.blockedId} className={styles.blockedRow}>
                  <div className={styles.blockedMeta}>
                    <div className={styles.blockedAvatar} aria-hidden>
                      {entry.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.avatarUrl} alt="" />
                      ) : (
                        (entry.name ?? "U").charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className={styles.blockedName}>{entry.name}</p>
                      <p className={styles.blockedDetail}>
                        {entry.blockedAt
                          ? `Blocked ${formatLastActive(new Date(entry.blockedAt))}`
                          : "Blocked"}
                      </p>
                    </div>
                  </div>
                  <div className={styles.blockedActions}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={layout.settingsCtaSecondary}
                      onClick={() => {
                        void handleUnblock(entry);
                      }}
                      loading={unblockingId === entry.blockedId}
                    >
                      Unblock
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {!blockedLoading && !blocked.length && !blockedError ? (
            <p className={styles.helper}>You have not blocked anyone.</p>
          ) : null}
        </div>
      </article>

      <article className={`${cards.card} ${layout.card}`}>
        <header className={cards.cardHead}>
          <h3 className={layout.sectionTitle}>Data requests</h3>
        </header>
        <div className={cards.cardBody}>
          <p className={styles.helper}>
            Ask for a copy of your data or request account deletion. We log your request and will
            follow up before processing.
          </p>
          <label className={styles.noteLabel} htmlFor="privacy-note">
            Optional note
          </label>
          <textarea
            id="privacy-note"
            className={styles.noteInput}
            maxLength={800}
            value={requestNote}
            onChange={(event) => setRequestNote(event.target.value)}
            placeholder="Add context that helps us verify or scope your request."
          />
          <div className={styles.dataActions}>
            <Button
              type="button"
              variant="primary"
              className={layout.settingsCtaPrimary}
              onClick={() => {
                void submitPrivacyRequest("export");
              }}
              loading={requestPending === "export"}
            >
              Request data export
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={layout.settingsCtaSecondary}
              onClick={() => {
                void submitPrivacyRequest("delete");
              }}
              loading={requestPending === "delete"}
            >
              Request account deletion
            </Button>
          </div>
          {requestStatus.message ? (
            <p
              className={`${styles.requestStatus} ${
                requestStatus.tone === "error" ? styles.requestStatusError : styles.requestStatusSuccess
              }`.trim()}
            >
              {requestStatus.message}
            </p>
          ) : null}
        </div>
      </article>
    </section>
  );
}

export default SecurityPrivacySection;
