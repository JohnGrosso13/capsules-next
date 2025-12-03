"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell, Check } from "@phosphor-icons/react/dist/ssr";

import styles from "./header-notifications.module.css";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

type HeaderNotificationsProps = {
  buttonClassName?: string | undefined;
  iconClassName?: string | undefined;
};

const FETCH_LIMIT = 20;

function normalizeNotification(value: unknown): NotificationItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const title = typeof record.title === "string" ? record.title : null;
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : null;
  if (!id || !title || !createdAt) return null;
  return {
    id,
    type: typeof record.type === "string" ? record.type : "generic",
    title,
    body: typeof record.body === "string" ? record.body : null,
    href: typeof record.href === "string" ? record.href : null,
    createdAt,
    readAt: typeof record.readAt === "string" ? record.readAt : null,
  };
}

function formatTimeAgo(value: string | null): string {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";
  const diff = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}

export function HeaderNotifications({
  buttonClassName,
  iconClassName,
}: HeaderNotificationsProps): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notifications, setNotifications] = React.useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  const applyPayload = React.useCallback((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const record = payload as Record<string, unknown>;
    const rawNotifications = Array.isArray(record.notifications)
      ? record.notifications
      : [];
    const normalized = rawNotifications
      .map((entry) => normalizeNotification(entry))
      .filter((entry): entry is NotificationItem => Boolean(entry));
    const unread =
      typeof record.unreadCount === "number" && Number.isFinite(record.unreadCount)
        ? record.unreadCount
        : normalized.filter((item) => !item.readAt).length;
    setNotifications(normalized);
    setUnreadCount(unread);
  }, []);

  const fetchNotifications = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/notifications?limit=${FETCH_LIMIT}`, {
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error("Unable to load notifications.");
      }
      applyPayload(payload);
    } catch (err) {
      console.error("header notifications fetch error", err);
      setError("Notifications unavailable");
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  const markRead = React.useCallback(
    async (ids: string[] | null) => {
      try {
        const response = await fetch("/api/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ids && ids.length ? { ids } : { all: true }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error("Unable to update notifications.");
        }
        applyPayload(payload);
      } catch (err) {
        console.error("header notifications update error", err);
        setError("Couldn't update notifications");
      }
    },
    [applyPayload],
  );

  const handleToggle = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleItemClick = React.useCallback(
    (item: NotificationItem) => {
      if (!item.readAt) {
        void markRead([item.id]);
      }
      setOpen(false);
      if (item.href) {
        router.push(item.href);
      }
    },
    [markRead, router],
  );

  React.useEffect(() => {
    if (open) {
      void fetchNotifications();
    }
  }, [open, fetchNotifications]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!open) return;
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={`${styles.button} ${buttonClassName ?? ""}`.trim()}
        aria-label="Notifications"
        title="Notifications"
        aria-expanded={open}
        onClick={handleToggle}
        data-unread={unreadCount > 0}
      >
        <Bell className={iconClassName ?? styles.icon} weight="duotone" />
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-label={`${unreadCount} unread notifications`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Notifications">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.panelTitle}>Notifications</p>
              <p className={styles.panelSubTitle}>
                {loading ? "Updating…" : unreadCount ? `${unreadCount} unread` : "All caught up"}
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.markAll}
                onClick={() => markRead(null)}
                disabled={loading || unreadCount === 0}
              >
                <Check size={18} weight="bold" />
                Mark all read
              </button>
            </div>
          </div>
          {error ? <div className={styles.error}>{error}</div> : null}
          <div className={styles.list} role="list">
            {notifications.length === 0 && !loading ? (
              <div className={styles.empty}>No notifications yet.</div>
            ) : null}
            {notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.item} ${!item.readAt ? styles.itemUnread : ""}`.trim()}
                onClick={() => handleItemClick(item)}
                role="listitem"
              >
                <div className={styles.itemText}>
                  <div className={styles.itemTitle}>{item.title}</div>
                  {item.body ? <p className={styles.itemBody}>{item.body}</p> : null}
                  <p className={styles.itemMeta}>{formatTimeAgo(item.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
