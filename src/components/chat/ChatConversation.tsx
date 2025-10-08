"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowLeft, PaperPlaneTilt, Trash } from "@phosphor-icons/react/dist/ssr";

import type { ChatMessage, ChatSession } from "@/components/providers/ChatProvider";
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
  return trimmed ? (trimmed[0]?.toUpperCase() ?? "?") : "?";
}

type ChatConversationProps = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  onSend: (body: string) => Promise<void>;
  onBack?: () => void;
  onDelete?: () => void;
};

function renderStatus(message: ChatMessage): React.ReactNode {
  if (message.status === "failed") {
    return <span className={`${styles.messageStatus} ${styles.messageStatusFailed}`.trim()}>Failed to send</span>;
  }
  if (message.status === "pending") {
    return <span className={styles.messageStatus}>Sending...</span>;
  }
  return null;
}

export function ChatConversation({ session, currentUserId, selfClientId, onSend, onBack, onDelete }: ChatConversationProps) {
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
  const lastPresenceSource = session.lastMessageAt ?? session.messages.at(-1)?.sentAt ?? null;
  const presence = formatPresence(lastPresenceSource);

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
            {session.friendAvatar ? (
              <Image
                src={session.friendAvatar}
                alt=""
                width={44}
                height={44}
                className={styles.conversationAvatarImage}
                sizes="44px"
              />
            ) : (
              <span className={styles.conversationAvatarFallback}>{initialsFrom(session.friendName)}</span>
            )}
          </span>
          <div className={styles.conversationTitleBlock}>
            <span className={styles.conversationTitle}>{session.friendName}</span>
            {presence ? <span className={styles.conversationSubtitle}>{presence}</span> : null}
          </div>
        </div>
        <div className={styles.conversationHeaderActions}>
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
      <div ref={messagesRef} className={styles.messageList}>
        {session.messages.map((message) => {
          const isSelf = message.authorId ? selfIdentifiers.has(message.authorId) : false;
          const avatar = isSelf ? selfAvatar : session.friendAvatar;
          const displayName = isSelf ? selfName : session.friendName;
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
          placeholder="Type a message"
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


