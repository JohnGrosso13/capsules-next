"use client";

import * as React from "react";
import Image from "next/image";

import type { ChatSession } from "@/components/providers/ChatProvider";

import styles from "./chat.module.css";
import { ChatMenu } from "./ChatMenu";

function initialsFrom(name: string): string {
  const trimmed = name.trim();
  return trimmed ? (trimmed[0]?.toUpperCase() ?? "?") : "?";
}

function preview(text: string | null): string {
  const t = (text ?? "").trim();
  if (!t) return "No messages yet";
  return t.length > 120 ? `${t.slice(0, 119)}...` : t;
}

function formatRelativeTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const now = Date.now();
  const diff = Math.max(0, now - parsed);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < 45_000) return "Just now";
  if (diff < 50 * minute) return `${Math.max(1, Math.round(diff / minute))}m`;
  if (diff < 24 * hour) return `${Math.max(1, Math.round(diff / hour))}h`;
  if (diff < 7 * day) return `${Math.max(1, Math.round(diff / day))}d`;
  return new Date(parsed).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type ChatListProps = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  emptyNotice?: React.ReactNode;
};

export function ChatList({ sessions, activeSessionId, onSelect, onDelete, emptyNotice }: ChatListProps) {
  if (!sessions.length) {
    return (
      <div className={styles.chatEmpty}>
        {emptyNotice ?? <p>No chats yet. Start a conversation from your friends list.</p>}
      </div>
    );
  }

  return (
    <div className={styles.chatThreads}>
      {sessions.map((session, index) => {
        const isActive = session.id === activeSessionId;
        const avatar = session.friendAvatar ?? null;
        const name = session.friendName;
        const sub = preview(session.lastMessagePreview);
        const relativeTime = formatRelativeTime(session.lastMessageAt);
        return (
          <article
            key={`${session.id}-${index}`}
            className={`${styles.chatThread} ${isActive ? styles.chatThreadActive : ""}`.trim()}
          >
            <button
              type="button"
              className={styles.chatThreadMain}
              onClick={() => onSelect(session.id)}
              aria-expanded={isActive}
            >
              <span className={styles.chatThreadAvatar} aria-hidden>
                {avatar ? (
                  <Image
                    src={avatar}
                    alt=""
                    width={48}
                    height={48}
                    className={styles.chatThreadAvatarImage}
                    sizes="48px"
                  />
                ) : (
                  <span className={styles.chatThreadAvatarFallback}>{initialsFrom(name)}</span>
                )}
              </span>
              <span className={styles.chatThreadContent}>
                <span className={styles.chatThreadTopRow}>
                  <span className={styles.chatThreadName}>{name}</span>
                  {relativeTime ? (
                    <time className={styles.chatThreadTimestamp} dateTime={session.lastMessageAt ?? undefined}>
                      {relativeTime}
                    </time>
                  ) : null}
                </span>
                <span className={styles.chatThreadPreview}>{sub}</span>
              </span>
            </button>
            <div className={styles.chatThreadAside}>
              {session.unreadCount > 0 ? (
                <span className={styles.chatThreadBadge} aria-label={`${session.unreadCount} unread messages`}>
                  {session.unreadCount}
                </span>
              ) : null}
              <ChatMenu onDelete={() => onDelete(session.id)} />
            </div>
          </article>
        );
      })}
    </div>
  );
}

