"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowLeft, PaperPlaneTilt, Trash, UserPlus, Smiley } from "@phosphor-icons/react/dist/ssr";
import { createPortal } from "react-dom";

import type {
  ChatMessage,
  ChatParticipant,
  ChatSession,
} from "@/components/providers/ChatProvider";
import { useCurrentUser } from "@/services/auth/client";
import { useFriendsDataContext } from "@/components/providers/FriendsDataProvider";
import { requestFriend } from "@/lib/api/friends";

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

const REACTION_OPTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

type ChatConversationProps = {
  session: ChatSession;
  currentUserId: string | null;
  selfClientId: string | null;
  onSend: (body: string) => Promise<void>;
  onBack?: () => void;
  onDelete?: () => void;
  onInviteParticipants?: () => void;
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
  onToggleReaction,
  onTypingChange,
}: ChatConversationProps) {
  const { user } = useCurrentUser();
  const { friends } = useFriendsDataContext();
  const [draft, setDraft] = React.useState("");
  const [hoveredMessageId, setHoveredMessageId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reactionTargetId, setReactionTargetId] = React.useState<string | null>(null);
  const messagesRef = React.useRef<HTMLDivElement | null>(null);
  const membersAnchorRef = React.useRef<HTMLButtonElement | null>(null);
  const membersMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [membersOpen, setMembersOpen] = React.useState(false);
  const [menuCoords, setMenuCoords] = React.useState<{ top: number; left: number } | null>(null);
  const [friendPending, setFriendPending] = React.useState<Record<string, boolean>>({});

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
  const updateMenuCoords = React.useCallback(() => {
    const el = membersAnchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuCoords({ top: Math.round(rect.bottom + 8), left: Math.round(rect.left) });
  }, []);

  React.useEffect(() => {
    if (!membersOpen) return;
    const handlePointer = (event: MouseEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideTrigger = membersAnchorRef.current?.contains(target) ?? false;
      const insideMenu = membersMenuRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideMenu) setMembersOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMembersOpen(false);
      }
    };
    const handleLayoutChange = () => updateMenuCoords();
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleLayoutChange);
    window.addEventListener("scroll", handleLayoutChange, true);
    updateMenuCoords();
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleLayoutChange);
      window.removeEventListener("scroll", handleLayoutChange, true);
    };
  }, [membersOpen, updateMenuCoords]);

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

  const friendUserIdSet = React.useMemo(() => {
    const set = new Set<string>();
    friends.forEach((f) => {
      if (f.userId) set.add(String(f.userId).trim());
    });
    return set;
  }, [friends]);

  const isSelf = React.useCallback(
    (participantId: string | null | undefined) => {
      if (!participantId) return false;
      const id = participantId.trim();
      if (!id) return false;
      return id === currentUserId || id === selfClientId;
    },
    [currentUserId, selfClientId],
  );

  const handleAddFriend = React.useCallback(
    async (participant: ChatParticipant) => {
      const id = participant.id;
      if (!id || isSelf(id) || friendUserIdSet.has(id)) return;
      setFriendPending((prev) => ({ ...prev, [id]: true }));
      try {
        await requestFriend({ userId: id, name: participant.name, avatar: participant.avatar });
      } catch (err) {
        console.error("Friend request failed", err);
      } finally {
        setFriendPending((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [friendUserIdSet, isSelf],
  );

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
          {session.type === "group" ? (
            <button
              type="button"
              className={`${styles.conversationAvatar} ${styles.conversationAvatarButton}`.trim()}
              aria-haspopup="menu"
              aria-expanded={membersOpen}
              aria-label="Show group members"
              onClick={() => {
                setMembersOpen((prev) => !prev);
                if (!membersOpen) {
                  // position menu near the avatar group
                  // coords will update via effect as well
                  const el = membersAnchorRef.current;
                  if (el) {
                    const rect = el.getBoundingClientRect();
                    setMenuCoords({ top: Math.round(rect.bottom + 8), left: Math.round(rect.left) });
                  }
                }
              }}
              ref={membersAnchorRef}
            >
              {renderConversationAvatar(session, remoteParticipants, title)}
            </button>
          ) : (
            <span className={styles.conversationAvatar} aria-hidden>
              {renderConversationAvatar(session, remoteParticipants, title)}
            </span>
          )}
          {session.type === "group" ? null : (
            <div className={styles.conversationTitleBlock}>
              <span className={styles.conversationTitle}>{title}</span>
              {presence ? <span className={styles.conversationSubtitle}>{presence}</span> : null}
            </div>
          )}
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

        {session.type === "group" && membersOpen
          ? createPortal(
              <div
                ref={membersMenuRef}
                className={styles.membersMenuPanel}
                role="menu"
                style={{ position: "fixed", top: menuCoords?.top ?? 0, left: menuCoords?.left ?? 0, zIndex: 1600 }}
              >
                <div className={styles.membersMenuHeader}>{presence}</div>
                <ul className={styles.membersMenuList}>
                  {session.participants.map((participant) => {
                    const alreadyFriend = participant.id ? friendUserIdSet.has(participant.id) : false;
                    const disabled = isSelf(participant.id) || alreadyFriend || Boolean(friendPending[participant.id]);
                    return (
                      <li key={participant.id} className={styles.membersMenuItem}>
                        <span className={styles.membersMenuAvatar} aria-hidden>
                          {participant.avatar ? (
                            <Image
                              src={participant.avatar}
                              alt=""
                              width={28}
                              height={28}
                              className={styles.membersMenuAvatarImage}
                              sizes="28px"
                            />
                          ) : (
                            <span className={styles.membersMenuInitials}>{initialsFrom(participant.name)}</span>
                          )}
                        </span>
                        <span className={styles.membersMenuName}>
                          {isSelf(participant.id) ? `${participant.name} (You)` : participant.name}
                        </span>
                        <span className={styles.membersMenuActionWrap}>
                          {alreadyFriend ? (
                            <span className={styles.membersMenuStatus}>Friends</span>
                          ) : isSelf(participant.id) ? null : (
                            <button
                              type="button"
                              className={styles.membersMenuAction}
                              disabled={disabled}
                              onClick={() => void handleAddFriend(participant)}
                            >
                              {friendPending[participant.id] ? "Sending..." : "Add Friend"}
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>,
              document.body,
            )
          : null}

        </div>
      </div>


      <div ref={messagesRef} className={styles.messageList}>
        {session.messages.map((message) => {
          const isSelf = message.authorId ? selfIdentifiers.has(message.authorId) : false;
          const author = message.authorId ? participantMap.get(message.authorId) : null;
          const avatar = isSelf ? selfAvatar : (author?.avatar ?? null);
          const displayName = isSelf ? selfName : (author?.name ?? "Member");
          const statusNode = renderStatus(message);
          const messageReactions = Array.isArray(message.reactions) ? message.reactions : [];
          const showReactions = messageReactions.length > 0 || Boolean(onToggleReaction);
          const isPickerOpen = reactionTargetId === message.id;
          return (
            <div
              key={message.id}
              className={`${styles.messageItem} ${isSelf ? styles.messageItemSelf : styles.messageItemOther}`.trim()}
            >
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
                    <span className={styles.messageAvatarFallback}>
                      {initialsFrom(displayName)}
                    </span>
                  )}
                </span>
              ) : null}
              <div className={styles.messageBubbleGroup}>
                <div className={styles.messageHeader}>
                  {!isSelf ? <span className={styles.messageAuthor}>{displayName}</span> : null}
                  <span className={styles.messageTimestamp}>
                    {formatMessageTime(message.sentAt)}
                  </span>
                </div>
                <div
                  className={`${styles.messageBubble} ${isSelf ? styles.messageBubbleSelf : ""}`.trim()}
                >
                  {message.body}
                </div>
                <div className={styles.messageHoverBar} data-open={hoveredMessageId === message.id || isPickerOpen}>
                  {REACTION_OPTIONS.slice(0, 5).map((option) => (
                    <button
                      key={`${message.id}-quick-${option}`}
                      type="button"
                      className={styles.messageQuickReact}
                      onClick={() => handleReactionSelect(message.id, option)}
                      aria-label={`React with ${option}`}
                    >
                      {option}
                    </button>
                  ))}
                  {onToggleReaction ? (
                    <div className={styles.messageHoverMore}>
                      <button
                        type="button"
                        className={styles.messageHoverMoreButton}
                        onClick={() => handleReactionPickerToggle(message.id)}
                        aria-expanded={isPickerOpen}
                        aria-label="More reactions"
                      >
                        <Smiley size={14} weight="duotone" />
                      </button>
                      {isPickerOpen ? (
                        <div className={styles.messageReactionPicker} role="menu">
                          {REACTION_OPTIONS.map((option) => (
                            <button
                              key={`${message.id}-${option}`}
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



