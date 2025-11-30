"use client";

import * as React from "react";
import { ChatsCircle, Broadcast, ArrowUp } from "@phosphor-icons/react/dist/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import styles from "./live-chat-rail.module.css";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import { useCurrentUser } from "@/services/auth/client";

type LiveChatStatus = "waiting" | "scheduled" | "live" | "ended";

export type LiveChatMessage = {
  id: string;
  authorName: string;
  body: string;
  sentAt: string;
  authorAvatar?: string | null;
};

export type LiveChatRailProps = {
  capsuleId?: string | null;
  capsuleName?: string | null;
  status?: LiveChatStatus;
  participantCount?: number | null;
  initialMessages?: LiveChatMessage[];
};

type CapsuleLiveChatEventDetail = {
  capsuleId?: string | null;
  capsuleName?: string | null;
  status?: LiveChatStatus;
  participantCount?: number | null;
  messages?: LiveChatMessage[];
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const EMPTY_MESSAGES: LiveChatMessage[] = [];

export function LiveChatRail({
  capsuleId: capsuleIdProp = null,
  capsuleName: capsuleNameProp = null,
  status: statusProp = "waiting",
  participantCount: participantCountProp = null,
  initialMessages = EMPTY_MESSAGES,
}: LiveChatRailProps = {}) {
  const { user } = useCurrentUser();
  const [capsuleId, setCapsuleId] = React.useState<string | null>(capsuleIdProp ?? null);
  const [capsuleName, setCapsuleName] = React.useState<string | null>(capsuleNameProp ?? null);
  const [status, setStatus] = React.useState<LiveChatStatus>(statusProp);
  const [participantCount, setParticipantCount] = React.useState<number | null>(
    participantCountProp ?? null,
  );
  const [messages, setMessages] = React.useState<LiveChatMessage[]>(initialMessages);
  const [draft, setDraft] = React.useState("");
  const supabaseRef = React.useRef<SupabaseClient | null>(null);
  const channelRef = React.useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const messageIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    setCapsuleId(capsuleIdProp ?? null);
  }, [capsuleIdProp]);

  React.useEffect(() => {
    setCapsuleName(capsuleNameProp ?? null);
  }, [capsuleNameProp]);

  React.useEffect(() => {
    setStatus(statusProp);
  }, [statusProp]);

  React.useEffect(() => {
    setParticipantCount(participantCountProp ?? null);
  }, [participantCountProp]);

  React.useEffect(() => {
    setMessages((prev) => (prev === initialMessages ? prev : initialMessages));
  }, [initialMessages]);

  React.useEffect(() => {
    const appendMessage = (incoming: LiveChatMessage) => {
      if (messageIdsRef.current.has(incoming.id)) return;
      messageIdsRef.current.add(incoming.id);
      setMessages((prev) => [...prev.slice(-99), incoming]);
    };

    const connect = async (capsule: string) => {
      try {
        supabaseRef.current = getBrowserSupabaseClient();
      } catch (error) {
        console.warn("livechat.supabase.unavailable", error);
        return;
      }
      const supabase = supabaseRef.current;
      const channelName = `capsule-live-chat:${capsule}`;
      const channel = supabase.channel(channelName, {
        config: { broadcast: { self: true } },
      });
      channel
        .on("broadcast", { event: "message" }, (payload) => {
          const data = payload?.payload as Partial<LiveChatMessage> | undefined;
          if (!data?.id || !data.body || !data.authorName || !data.sentAt) return;
          appendMessage({
            id: data.id,
            body: data.body,
            authorName: data.authorName,
            authorAvatar: data.authorAvatar ?? null,
            sentAt: data.sentAt,
          });
        })
        .subscribe();

      channelRef.current = channel;
    };

    if (!capsuleId) {
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      return;
    }

    messageIdsRef.current = new Set(initialMessages.map((m) => m.id));
    void connect(capsuleId);

    return () => {
      if (channelRef.current) {
        void channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [capsuleId, initialMessages]);

  React.useEffect(() => {
    const handleCapsuleEvent = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as CapsuleLiveChatEventDetail | undefined;
      if (!detail) return;
      if ("capsuleId" in detail) {
        setCapsuleId(detail.capsuleId ?? null);
      }
      if ("capsuleName" in detail) {
        setCapsuleName(detail.capsuleName ?? null);
      }
      if ("status" in detail && detail.status) {
        setStatus(detail.status);
      }
      if ("participantCount" in detail) {
        setParticipantCount(
          typeof detail.participantCount === "number" ? detail.participantCount : null,
        );
      }
      if (Array.isArray(detail.messages)) {
        setMessages(detail.messages);
      }
    };

    window.addEventListener("capsule:live-chat", handleCapsuleEvent as EventListener);
    return () => {
      window.removeEventListener("capsule:live-chat", handleCapsuleEvent as EventListener);
    };
  }, []);

  const canSend = status === "live" && Boolean(capsuleId) && Boolean(user);
  const hasMessages = messages.length > 0;
  const authorName = user?.name?.trim() || user?.email?.trim() || "You";

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSend) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `msg-${Math.random().toString(36).slice(2, 10)}`;
    const message: LiveChatMessage = {
      id,
      authorName,
      body: trimmed,
      sentAt: now,
      authorAvatar: user?.avatarUrl ?? null,
    };
    messageIdsRef.current.add(id);
    setMessages((prev) => [...prev.slice(-99), message]);
    setDraft("");
    const channel = channelRef.current;
    if (channel) {
      await channel.send({
        type: "broadcast",
        event: "message",
        payload: message,
      });
    }
  };

  let subtitle = "Live chat will unlock once your stream starts.";
  if (!capsuleId) {
    subtitle = "Select a capsule to prepare the live chat.";
  } else if (status === "scheduled") {
    subtitle = "You're scheduled—chat will open when you go live.";
  } else if (status === "live") {
    subtitle = hasMessages
      ? "Chat with your community in real time."
      : "No messages yet. Say hello!";
  } else if (status === "ended") {
    subtitle = "Stream has ended. Recaps will be available in Memories.";
  }

  const statusLabel =
    status === "live"
      ? "Live"
      : status === "scheduled"
        ? "Scheduled"
        : status === "ended"
          ? "Ended"
          : "Standby";

  return (
    <div className={styles.liveChat} data-status={status}>
      <header className={styles.header}>
        <div className={styles.headerIcon} aria-hidden>
          <ChatsCircle size={20} weight="bold" />
        </div>
        <div className={styles.headerMeta}>
          <div className={styles.headerTitleRow}>
            <span className={styles.headerTitle}>Live Chat</span>
            <span className={styles.statusBadge} data-badge={status}>
              <span className={styles.statusDot} />
              {statusLabel}
            </span>
          </div>
          <span className={styles.headerSubtitle}>{subtitle}</span>
          {capsuleName ? <span className={styles.headerCapsuleName}>{capsuleName}</span> : null}
        </div>
      </header>
      <div className={styles.participantRow}>
        <span className={styles.participantIcon} aria-hidden>
          <Broadcast size={18} weight="bold" />
        </span>
        <span className={styles.participantText}>
          {typeof participantCount === "number"
            ? `${participantCount} watching`
            : "Waiting for viewers"}
        </span>
      </div>
      <div className={styles.messageScroll} data-empty={!hasMessages}>
        {hasMessages ? (
          <ul className={styles.messageList}>
            {messages.map((message) => (
              <li key={message.id} className={styles.messageListItem}>
                <article className={styles.messageCard}>
                  <div className={styles.messageHeader}>
                    <span className={styles.messageAuthor}>{message.authorName}</span>
                    <time className={styles.messageTime} dateTime={message.sentAt}>
                      {formatTimestamp(message.sentAt)}
                    </time>
                  </div>
                  <p className={styles.messageBody}>{message.body}</p>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.messagePlaceholder}>Live chat messages will appear here.</div>
        )}
      </div>
      <form className={styles.composer} onSubmit={handleSend}>
        <div className={styles.composerField}>
          <input
            className={styles.composerInput}
            placeholder={
              canSend ? "Share something with the stream..." : "Chat is locked until you're live"
            }
            disabled={!canSend}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button className={styles.composerSend} type="submit" disabled={!canSend} aria-label="Send message">
            <ArrowUp size={18} weight="bold" />
          </button>
        </div>
      </form>
    </div>
  );
}
