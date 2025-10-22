"use client";

import * as React from "react";
import Image from "next/image";
import {
  ArrowLeft,
  PaperPlaneTilt,
  Trash,
  UserPlus,
  Smiley,
  NotePencil,
} from "@phosphor-icons/react/dist/ssr";

import type {
  ChatMessage,
  ChatParticipant,
  ChatSession,
} from "@/components/providers/ChatProvider";
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

function typingDisplayName(participant: ChatParticipant): string {
  const name = typeof participant.name === "string" ? participant.name.trim() : "";
  if (name) return name;
  const id = typeof participant.id === "string" ? participant.id.trim() : "";
  return id || "Someone";
}

function describeTypingParticipants(participants: ChatParticipant[]): string {
  const names = participants.map(typingDisplayName);
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing...`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
}

// Discord-like quick reactions. These were previously corrupted to "??"
// which caused broken reactions to be saved and displayed.
// Use literal emoji here so the picker and stored reactions are correct.
const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

const MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;

function isContinuationOf(previous: ChatMessage | null | undefined, current: ChatMessage): boolean {
  if (!previous) return false;
  if ((previous.authorId ?? null) !== (current.authorId ?? null)) return false;
  const previousTime = Date.parse(previous.sentAt);
  const currentTime = Date.parse(current.sentAt);
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return false;
  return Math.abs(currentTime - previousTime) < MESSAGE_GROUP_WINDOW_MS;
}


type ChatConversationProps = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  onSend: (body: string) => Promise<void>;
  onBack?: () => void;
  onDelete?: () => void;
  onInviteParticipants?: () => void;
  onRenameGroup?: () => void;
  onTypingChange?: (conversationId: string, typing: boolean) => void;
  onToggleReaction?: (conversationId: string, messageId: string, emoji: string) => Promise<void>;
};

function renderConversationAvatar(
  session: ChatSession,
  remoteParticipants: ChatParticipant[],
  title: string,
) {
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
    const visible = (remoteParticipants.length ? remoteParticipants : session.participants).slice(
      0,
      3,
    );
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
          <span
            className={`${styles.conversationAvatarFallback} ${styles.conversationAvatarOverflow}`.trim()}
          >
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
  return (
    <span className={styles.conversationAvatarFallback}>
      {initialsFrom(primary?.name ?? title)}
    </span>
  );
}

function renderStatus(message: ChatMessage): React.ReactNode {
  if (message.status === "failed") {
    return (
      <span className={`${styles.messageStatus} ${styles.messageStatusFailed}`.trim()}>
        Failed to send
      </span>
    );
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
  onRenameGroup,
  onToggleReaction,
  onTypingChange,
}: ChatConversationProps) {
  const { user } = useCurrentUser();
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reactionTargetId, setReactionTargetId] = React.useState<string | null>(null);
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
    setReactionTargetId(null);
  }, [session.id]);

  React.useEffect(() => {
    if (!reactionTargetId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReactionTargetId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [reactionTargetId]);

  // Close the emoji picker if user clicks outside of it.
  React.useEffect(() => {
    if (!reactionTargetId) return;
    const onPointerDown = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;
      if (!el) return;
      if (el.closest('[data-role="reaction-picker"]')) return;
      if (el.closest('[data-role="reaction-button"]')) return;
      setReactionTargetId(null);
    };
    window.addEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, { capture: true } as AddEventListenerOptions);
    };
  }, [reactionTargetId]);

  const typingParticipants = React.useMemo(() => {
    if (!Array.isArray(session.typing) || session.typing.length === 0) {
      return [] as ChatParticipant[];
    }
    const seen = new Set<string>();
    const unique: ChatParticipant[] = [];
    session.typing.forEach((participant) => {
      if (!participant || typeof participant.id !== "string") return;
      if (selfIdentifiers.has(participant.id)) return;
      const key = participant.id.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      unique.push(participant);
    });
    return unique;
  }, [session.typing, selfIdentifiers]);

  const typingText = React.useMemo(
    () => (typingParticipants.length ? describeTypingParticipants(typingParticipants) : ""),
    [typingParticipants],
  );
  const primaryTypingParticipant = typingParticipants[0] ?? null;
  const typingRemainderCount = typingParticipants.length > 1 ? typingParticipants.length - 1 : 0;

  const handleToggleReaction = React.useCallback(
    (messageId: string, emoji: string) => {
      if (!onToggleReaction) return;
      void onToggleReaction(session.id, messageId, emoji).catch((error) => {
        console.error("chat reaction toggle failed", error);
      });
    },
    [onToggleReaction, session.id],
  );

  const handleReactionPickerToggle = React.useCallback((messageId: string) => {
    setReactionTargetId((current) => (current === messageId ? null : messageId));
  }, []);

  const handleReactionSelect = React.useCallback(
    (messageId: string, emoji: string) => {
      handleToggleReaction(messageId, emoji);
      setReactionTargetId(null);
    },
    [handleToggleReaction],
  );

  React.useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [session.messages.length]);

  const handleDraftChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setDraft(value);
      if (onTypingChange) {
        const hasContent = value.replace(/\s+/g, "").length > 0;
        onTypingChange(session.id, hasContent);
      }
    },
    [onTypingChange, session.id],
  );

  const handleDraftBlur = React.useCallback(() => {
    onTypingChange?.(session.id, false);
  }, [onTypingChange, session.id]);

  React.useEffect(() => {
    return () => {
      onTypingChange?.(session.id, false);
    };
  }, [onTypingChange, session.id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = draft.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setDraft("");
      onTypingChange?.(session.id, false);
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
            <button
              type="button"
              className={styles.conversationAction}
              onClick={onBack}
              aria-label="Back to chats"
            >
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
          {session.type === "group" && onRenameGroup ? (
            <button
              type="button"
              className={styles.conversationAction}
              onClick={onRenameGroup}
              aria-label="Rename group"
            >
              <NotePencil size={18} weight="duotone" />
            </button>
          ) : null}
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
              <button
                key={participant.id}
                type="button"
                className={styles.conversationParticipant}
                title={participant.name}
                onClick={() => onInviteParticipants?.()}
                disabled={!onInviteParticipants}
                aria-disabled={!onInviteParticipants}
                aria-label={participant.name ? `View ${participant.name}` : "View participant"}
              >
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
                <span className={styles.conversationParticipantInitials}>
                  {initialsFrom(participant.name)}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : null}

      <div ref={messagesRef} className={styles.messageList}>
        {session.messages.map((message, index) => {
          const baseKey =
            message.id && message.id.trim().length > 0
              ? `${message.id}-${index}`
              : `${message.authorId ?? "message"}-${message.sentAt}-${index}`;
          const messageKey = baseKey.replace(/\s+/g, "_");
          const previous = index > 0 ? session.messages[index - 1] : null;
          const isSelf = message.authorId ? selfIdentifiers.has(message.authorId) : false;
          const author = message.authorId ? participantMap.get(message.authorId) : null;
          const avatar = isSelf ? selfAvatar : (author?.avatar ?? null);
          const displayName = isSelf ? selfName : (author?.name ?? "Member");
          const statusNode = renderStatus(message);
          const grouped = isContinuationOf(previous, message);
          const showAvatar = !grouped;
          const showHeader = !grouped;
          const messageTimestamp = formatMessageTime(message.sentAt);
          const messageReactions = Array.isArray(message.reactions) ? message.reactions : [];
          const hasReactions = messageReactions.length > 0;
          const showReactions = Boolean(onToggleReaction) || hasReactions;
          const isPickerOpen = reactionTargetId === message.id;
          const itemClassName = `${styles.messageItem} ${
            isSelf ? styles.messageItemSelf : styles.messageItemOther
          } ${grouped ? styles.messageItemGrouped : ""}`.trim();
          const avatarClassName = `${styles.messageAvatar} ${
            showAvatar ? "" : styles.messageAvatarHidden
          }`.trim();
          const reactionClassName = `${styles.messageReactions} ${
            hasReactions || isPickerOpen ? styles.messageReactionsVisible : ""
          }`.trim();
          const messageTitle = showHeader ? undefined : messageTimestamp || undefined;
          return (
            <div key={messageKey} className={itemClassName}>
              <span className={avatarClassName} aria-hidden>
                {showAvatar ? (
                  avatar ? (
                    <Image
                      src={avatar}
                      alt=""
                      width={36}
                      height={36}
                      className={styles.messageAvatarImage}
                      sizes="36px"
                    />
                  ) : (
                    <span className={styles.messageAvatarFallback}>
                      {initialsFrom(displayName)}
                    </span>
                  )
                ) : null}
              </span>
              <div className={styles.messageBubbleGroup}>
                {showHeader ? (
                  <div className={styles.messageHeader}>
                    <span className={styles.messageAuthor}>{displayName}</span>
                    <time className={styles.messageTimestamp} dateTime={message.sentAt}>
                      {messageTimestamp}
                    </time>
                  </div>
                ) : null}
                <div
                  className={`${styles.messageBubble} ${isSelf ? styles.messageBubbleSelf : ""}`.trim()}
                  title={messageTitle}
                >
                  {message.body}
                </div>
                {showReactions ? (
                  <div className={reactionClassName}>
                    {messageReactions.map((reaction, reactionIndex) => {
                      const maxNames = 3;
                      const shown = (Array.isArray(reaction.users) ? reaction.users : []).slice(0, maxNames);
                      const nameList = shown.map((u) => (u?.name || u?.id || "").trim() || "Member").join(", ");
                      const remainder = Math.max(0, reaction.count - shown.length);
                      const tooltip =
                        nameList.length > 0
                          ? `${reaction.emoji} by ${nameList}${remainder > 0 ? ` and ${remainder} more` : ""}`
                          : `${reaction.emoji} x${reaction.count}`;
                      return (
                      <button
                        key={`${messageKey}-reaction-${reactionIndex}`}
                        type="button"
                        className={`${styles.messageReaction} ${
                          reaction.selfReacted ? styles.messageReactionActive : ""
                        }`.trim()}
                        onClick={() => handleToggleReaction(message.id, reaction.emoji)}
                        disabled={!onToggleReaction}
                        aria-pressed={reaction.selfReacted}
                        aria-label={`${reaction.emoji} reaction from ${reaction.count} ${
                          reaction.count === 1 ? "person" : "people"
                        }`}
                        title={tooltip}
                      >
                        <span className={styles.messageReactionEmoji}>{reaction.emoji}</span>
                        <span className={styles.messageReactionCount}>{reaction.count}</span>
                      </button>
                    );
                    })}
                    {onToggleReaction ? (
                      <div className={styles.messageReactionAdd}>
                        <button
                          type="button"
                          className={styles.messageReactionAddButton}
                          onClick={() => handleReactionPickerToggle(message.id)}
                          aria-expanded={isPickerOpen}
                          aria-label="Add reaction"
                          data-role="reaction-button"
                        >
                          <Smiley size={14} weight="duotone" />
                        </button>
                        {isPickerOpen ? (
                          <div
                            className={styles.messageReactionPicker}
                            role="menu"
                            data-role="reaction-picker"
                          >
                            {REACTION_OPTIONS.map((option, optionIndex) => (
                              <button
                                key={`${messageKey}-picker-${optionIndex}`}
                                type="button"
                                className={styles.messageReactionOption}
                                onClick={() => handleReactionSelect(message.id, option)}
                                aria-label={`React with ${option}`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {statusNode ? <div className={styles.messageMeta}>{statusNode}</div> : null}
              </div>
            </div>
          );
        })}
        {typingParticipants.length > 0 && typingText.length > 0 ? (
          <div className={styles.typingIndicatorRow}>
            {primaryTypingParticipant ? (
              <span className={styles.typingIndicatorAvatar} aria-hidden>
                {primaryTypingParticipant.avatar ? (
                  <Image
                    src={primaryTypingParticipant.avatar}
                    alt=""
                    width={36}
                    height={36}
                    className={styles.typingIndicatorAvatarImage}
                    sizes="36px"
                  />
                ) : (
                  <span className={styles.typingIndicatorInitials}>
                    {initialsFrom(typingDisplayName(primaryTypingParticipant))}
                  </span>
                )}
                {typingRemainderCount > 0 ? (
                  <span className={styles.typingIndicatorBadge}>+{typingRemainderCount}</span>
                ) : null}
              </span>
            ) : null}
            <div className={styles.typingIndicatorBubble} role="status" aria-live="polite">
              <span className={styles.typingIndicatorText}>{typingText}</span>
              <span className={styles.typingIndicatorDots} aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        ) : null}
      </div>
      {error ? <div className={styles.errorBanner}>{error}</div> : null}
      <form className={styles.composer} onSubmit={handleSubmit}>
        <input
          className={styles.messageInput}
          value={draft}
          onChange={handleDraftChange}
          onBlur={handleDraftBlur}
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

