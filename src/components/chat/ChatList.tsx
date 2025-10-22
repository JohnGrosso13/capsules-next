"use client";

import * as React from "react";
import Image from "next/image";

import type { ChatParticipant, ChatSession } from "@/components/providers/ChatProvider";

import styles from "./chat.module.css";
import { ChatMenu } from "./ChatMenu";

type ChatListProps = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  emptyNotice?: React.ReactNode;
  selfIdentifiers: string[];
};

function buildSelfSet(selfIdentifiers: string[]): Set<string> {
  return selfIdentifiers.reduce((set, id) => {
    if (typeof id === "string" && id.trim()) {
      set.add(id.trim());
    }
    return set;
  }, new Set<string>());
}

function initialsFrom(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function formatPreview(text: string | null): string {
  const t = (text ?? "").trim();
  if (!t) return "No messages yet";
  return t.length > 120 ? `${t.slice(0, 119)}…` : t;
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

function selectRemoteParticipants(session: ChatSession, selfSet: Set<string>): ChatParticipant[] {
  return session.participants.filter((participant) => !selfSet.has(participant.id));
}

function resolveSessionTitle(session: ChatSession, selfSet: Set<string>): string {
  const trimmed = session.title?.trim();
  if (trimmed) return trimmed;
  const others = selectRemoteParticipants(session, selfSet);
  if (session.type === "group") {
    if (!others.length) return "Group chat";
    if (others.length === 1) return `${others[0]!.name} & you`;
    if (others.length === 2) return `${others[0]!.name} & ${others[1]!.name}`;
    return `${others[0]!.name}, ${others[1]!.name} +${others.length - 2}`;
  }
  return others[0]?.name ?? session.participants[0]?.name ?? "Chat";
}

function resolvePreview(session: ChatSession, selfSet: Set<string>): string {
  const lastMessage = session.messages.at(-1);
  if (!lastMessage) return "No messages yet";
  const summary = formatPreview(lastMessage.body);
  if (!lastMessage.authorId) return summary;
  if (selfSet.has(lastMessage.authorId)) {
    return `You: ${summary}`;
  }
  const author = session.participants.find(
    (participant) => participant.id === lastMessage.authorId,
  );
  if (author) {
    return `${author.name}: ${summary}`;
  }
  return summary;
}

function renderAvatarStack(participants: ChatParticipant[], limit = 3): React.ReactNode {
  if (!participants.length) {
    return <span className={styles.chatThreadAvatarFallback}>?</span>;
  }
  const visible = participants.slice(0, limit);
  const overflow = participants.length - visible.length;
  return (
    <span className={styles.chatThreadAvatarStack}>
      {visible.map((participant, index) => (
        <span key={`${participant.id}-${index}`} className={styles.chatThreadAvatarStackItem}>
          {participant.avatar ? (
            <Image
              src={participant.avatar}
              alt=""
              width={48}
              height={48}
              className={styles.chatThreadAvatarImage}
              sizes="48px"
            />
          ) : (
            <span className={styles.chatThreadAvatarFallback}>
              {initialsFrom(participant.name)}
            </span>
          )}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className={`${styles.chatThreadAvatarStackItem} ${styles.chatThreadAvatarOverflow}`.trim()}
        >
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}

function renderAvatar(
  session: ChatSession,
  remoteParticipants: ChatParticipant[],
  title: string,
): React.ReactNode {
  if (session.avatar) {
    return (
      <Image
        src={session.avatar}
        alt=""
        width={48}
        height={48}
        className={styles.chatThreadAvatarImage}
        sizes="48px"
      />
    );
  }
  if (session.type === "group") {
    return renderAvatarStack(remoteParticipants.length ? remoteParticipants : session.participants);
  }
  const primary = remoteParticipants[0] ?? session.participants[0];
  if (primary?.avatar) {
    return (
      <Image
        src={primary.avatar}
        alt=""
        width={48}
        height={48}
        className={styles.chatThreadAvatarImage}
        sizes="48px"
      />
    );
  }
  return (
    <span className={styles.chatThreadAvatarFallback}>{initialsFrom(primary?.name ?? title)}</span>
  );
}

export function ChatList({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  emptyNotice,
  selfIdentifiers,
}: ChatListProps) {
  const selfSet = React.useMemo(() => buildSelfSet(selfIdentifiers), [selfIdentifiers]);

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
        const remoteParticipants = selectRemoteParticipants(session, selfSet);
        const title = resolveSessionTitle(session, selfSet);
        const preview = resolvePreview(session, selfSet);
        const relativeTime = formatRelativeTime(session.lastMessageAt);
        const participantCount = session.participants.length;

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
                {renderAvatar(session, remoteParticipants, title)}
              </span>
              <span className={styles.chatThreadContent}>
                <span className={styles.chatThreadTopRow}>
                  <span className={styles.chatThreadTitleBlock}>
                    <span className={styles.chatThreadName}>{title}</span>
                    {session.type === "group" ? (
                      <span className={styles.chatThreadTag}>Group · {participantCount}</span>
                    ) : null}
                  </span>
                  {relativeTime ? (
                    <time
                      className={styles.chatThreadTimestamp}
                      dateTime={session.lastMessageAt ?? undefined}
                    >
                      {relativeTime}
                    </time>
                  ) : null}
                </span>
                <span className={styles.chatThreadPreview}>{preview}</span>
              </span>
            </button>
            <div className={styles.chatThreadAside}>
              {session.unreadCount > 0 ? (
                <span
                  className={styles.chatThreadBadge}
                  aria-label={`${session.unreadCount} unread messages`}
                >
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
