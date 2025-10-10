"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowLeft, PaperPlaneTilt, Trash, UserPlus } from "@phosphor-icons/react/dist/ssr";

import type { ChatMessage, ChatParticipant, ChatSession } from "@/components/providers/ChatProvider";
import { useCurrentUser } from "@/services/auth/client";

import styles from "./chat.module.css";

function formatMessageTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatPresence(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < 45_000) return "Active now";
  if (diff < hour) return `Active ${Math.max(1, Math.round(diff / minute))}m ago`;
  if (diff < 24 * hour) return `Active ${Math.max(1, Math.round(diff / hour))}h ago`;
  if (diff < 7 * day) return `Active ${Math.max(1, Math.round(diff / day))}d ago`;
  return `Active on ${new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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

type ChatConversationProps = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  onSend: (body: string) => Promise<void>;
  onBack?: () => void;
  onDelete?: () => void;
  onInviteParticipants?: () => void;
};

function renderConversationAvatar(session: ChatSession, remoteParticipants: ChatParticipant[], title: string) {
  if (session.avatar) {
    return (
      <Image
        src={session.avatar}
        alt=""
        width={44}
        height={44}
        className={styles.conversationAvatarImage}
        sizes="44px"
      />
    );
  }
  if (session.type === "group") {
    const visible = (remoteParticipants.length ? remoteParticipants : session.participants).slice(0, 3);
    return (
      <span className={styles.conversationAvatarGroup} aria-hidden>
        {visible.map((participant, index) =>
          participant.avatar ? (
            <Image
              key={`${participant.id}-${index}`}
              src={participant.avatar}
              alt=""
              width={44}
              height={44}
              className={styles.conversationAvatarImage}
              sizes="44px"
            />
          ) : (
            <span key={`${participant.id}-${index}`} className={styles.conversationAvatarFallback}>
              {initialsFrom(participant.name)}
            </span>
          ),
        )}
        {session.participants.length > visible.length ? (
          <span className={`${styles.conversationAvatarFallback} ${styles.conversationAvatarOverflow}`.trim()}>
            +{session.participants.length - visible.length}
          </span>
        ) : null}
      </span>
    );
  }
  const primary = remoteParticipants[0] ?? session.participants[0];
  if (primary?.avatar) {
    return (
      <Image
        src={primary.avatar}
        alt=""
        width={44}
        height={44}
        className={styles.conversationAvatarImage}
        sizes="44px"
      />
    );
  }
  return <span className={styles.conversationAvatarFallback}>{initialsFrom(primary?.name ?? title)}</span>;
}

function renderStatus(message: ChatMessage): React.ReactNode {
  if (message.status === "failed") {
    return <span className={`${styles.messageStatus} ${styles.messageStatusFailed}`.trim()}>Failed to send</span>;
  }
  if (message.status === "pending") {
    return <span className={styles.messageStatus}>Sending...</span>;
  }
  return null;
}

export function ChatConversation({
  session,
  currentUserId,
  selfClientId,
  onSend,
  onBack,
  onDelete,
  onInviteParticipants,
}: ChatConversationProps) {
  const { user } = useCurrentUser();
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const messagesRef = React.useRef<HTMLDivElement | null>(null);

  const selfIdentifiers = React.useMemo(() => {
    const ids = new Set<string>();
    if (currentUserId) ids.add(currentUserId);
    if (selfClientId) ids.add(selfClientId);
    return ids;
  }, [currentUserId, selfClientId]);

  const participantMap = React.useMemo(() => {
    const map = new Map<string, ChatParticipant>();
    session.participants.forEach((participant) => {
      map.set(participant.id, participant);
    });
    return map;
  }, [session.participants]);

  React.useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [session.messages.length]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setDraft("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message.";
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const selfName = user?.name || user?.email || "You";
  const selfAvatar = user?.avatarUrl || null;
  const remoteParticipants = React.useMemo(() => {
    return session.participants.filter((participant) => !selfIdentifiers.has(participant.id));
  }, [selfIdentifiers, session.participants]);

  const lastPresenceSource = session.lastMessageAt ?? session.messages.at(-1)?.sentAt ?? null;
  const presence =
    session.type === "group"
      ? `${session.participants.length} member${session.participants.length === 1 ? "" : "s"}`
      : formatPresence(lastPresenceSource);
  const title = session.title?.trim() || (remoteParticipants[0]?.name ?? "Chat");

  return (
    <div className={styles.conversation}>
      <div className={styles.conversationHeader}>
        <div className={styles.conversationHeaderLeft}>
          {onBack ? (
            <button type="button" className={styles.conversationAction} onClick={onBack} aria-label="Back to chats">
              <ArrowLeft size={18} weight="bold" />
            </button>
          ) : null}
          <span className={styles.conversationAvatar} aria-hidden>
            {renderConversationAvatar(session, remoteParticipants, title)}
          </span>
          <div className={styles.conversationTitleBlock}>
            <span className={styles.conversationTitle}>{title}</span>
            {presence ? <span className={styles.conversationSubtitle}>{presence}</span> : null}
          </div>
        </div>
        <div className={styles.conversationHeaderActions}>
          {session.type === "group" && onInviteParticipants ? (
            <button
              type="button"
              className={styles.conversationAction}
              onClick={onInviteParticipants}
              aria-label="Add participants"
            >
              <UserPlus size={18} weight="bold" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className={`${styles.conversationAction} ${styles.conversationActionDanger}`.trim()}
              onClick={onDelete}
              aria-label="Delete chat"
            >
              <Trash size={18} weight="duotone" />
            </button>
          ) : null}
        </div>
      </div>

      {session.type === "group" ? (
        <div className={styles.conversationParticipants}>
          {session.participants.map((participant) => (
            <span key={participant.id} className={styles.conversationParticipant} title={participant.name}>
              {participant.avatar ? (
                <Image
                  src={participant.avatar}
                  alt=""
                  width={28}
                  height={28}
                  className={styles.conversationParticipantAvatar}
                  sizes="28px"
                />
              ) : (
                <span className={styles.conversationParticipantInitials}>{initialsFrom(participant.name)}</span>
              )}
            </span>
          ))}
        </div>
      ) : null}

      <div ref={messagesRef} className={styles.messageList}>
        {session.messages.map((message) => {
          const isSelf = message.authorId ? selfIdentifiers.has(message.authorId) : false;
          const author = message.authorId ? participantMap.get(message.authorId) : null;
          const avatar = isSelf ? selfAvatar : author?.avatar ?? null;
          const displayName = isSelf ? selfName : author?.name ?? "Member";
          const statusNode = renderStatus(message);
          return (
            <div key={message.id} className={`${styles.messageItem} ${isSelf ? styles.messageItemSelf : styles.messageItemOther}`.trim()}>
              {!isSelf ? (
                <span className={styles.messageAvatar} aria-hidden>
                  {avatar ? (
                    <Image
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      className={styles.messageAvatarImage}
                      sizes="36px"
                    />
                  ) : (
                    <span className={styles.messageAvatarFallback}>{initialsFrom(displayName)}</span>
                  )}
                </span>
              ) : null}
              <div className={styles.messageBubbleGroup}>
                <div className={styles.messageHeader}>
                  {!isSelf ? <span className={styles.messageAuthor}>{displayName}</span> : null}
                  <span className={styles.messageTimestamp}>{formatMessageTime(message.sentAt)}</span>
                </div>
                <div className={`${styles.messageBubble} ${isSelf ? styles.messageBubbleSelf : ""}`.trim()}>{message.body}</div>
                {statusNode ? <div className={styles.messageMeta}>{statusNode}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          className={styles.messageInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={session.type === "group" ? "Message the group" : "Type a message"}
          disabled={sending}
          aria-label="Message"
        />
        <button type="submit" className={styles.sendButton} disabled={sending || !draft.trim()}>
          <PaperPlaneTilt size={18} weight="fill" className={styles.sendButtonIcon} />
          <span>Send</span>
        </button>
      </form>
    </div>
  );
}
