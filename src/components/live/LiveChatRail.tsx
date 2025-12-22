"use client";

import * as React from "react";
import { ChatsCircle, Broadcast, ArrowUp } from "@phosphor-icons/react/dist/ssr";

import styles from "./live-chat-rail.module.css";
import { getRealtimeClientFactory } from "@/config/realtime-client";
import type { RealtimeAuthPayload, RealtimeClient } from "@/ports/realtime";
import { getCapsuleLiveChatChannel } from "@/shared/live-chat";
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
const MAX_MESSAGES = 100;

async function fetchLiveChatAuth(capsuleId: string): Promise<RealtimeAuthPayload> {
  const response = await fetch(`/api/live/chat/token?capsuleId=${encodeURIComponent(capsuleId)}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const contentType = response.headers.get("Content-Type") ?? "";
    let message = "Unable to fetch live chat token.";
    if (contentType.includes("application/json")) {
      try {
        const data = (await response.json()) as { message?: string; error?: string };
        if (data?.message) {
          message = data.message;
        } else if (data?.error) {
          message = data.error;
        }
      } catch {
        // ignore parse failures
      }
    } else {
      message = (await response.text().catch(() => message)) || message;
    }
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return (await response.json()) as RealtimeAuthPayload;
}

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
  const [connecting, setConnecting] = React.useState(false);
  const [connected, setConnected] = React.useState(false);
  const [chatError, setChatError] = React.useState<string | null>(null);

  const clientFactoryRef = React.useRef(getRealtimeClientFactory());
  const clientRef = React.useRef<RealtimeClient | null>(null);
  const activeChannelRef = React.useRef<string | null>(null);
  const unsubscribeRef = React.useRef<(() => Promise<void> | void) | null>(null);
  const presenceUnsubRef = React.useRef<(() => Promise<void> | void) | null>(null);
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
    messageIdsRef.current = new Set(initialMessages.map((m) => m.id));
    setMessages((prev) => (prev === initialMessages ? prev : initialMessages));
  }, [initialMessages]);

  const cleanupConnection = React.useCallback(async () => {
    setConnected(false);
    const presenceCleanup = presenceUnsubRef.current;
    presenceUnsubRef.current = null;
    if (presenceCleanup) {
      try {
        await presenceCleanup();
      } catch (error) {
        console.warn("livechat.presence.unsubscribe.error", error);
      }
    }

    const subscriptionCleanup = unsubscribeRef.current;
    unsubscribeRef.current = null;
    if (subscriptionCleanup) {
      try {
        await subscriptionCleanup();
      } catch (error) {
        console.warn("livechat.unsubscribe.error", error);
      }
    }

    const client = clientRef.current;
    clientRef.current = null;
    const factory = clientFactoryRef.current;
    const activeChannel = activeChannelRef.current;
    activeChannelRef.current = null;
    if (client && activeChannel) {
      try {
        await client.presence(activeChannel).leave();
      } catch (error) {
        console.warn("livechat.presence.leave.error", error);
      }
    }
    if (client && factory) {
      try {
        await factory.release(client);
      } catch (error) {
        console.warn("livechat.client.release.error", error);
      }
    }
  }, []);

  React.useEffect(() => {
    const appendMessage = (incoming: LiveChatMessage) => {
      if (messageIdsRef.current.has(incoming.id)) return;
      messageIdsRef.current.add(incoming.id);
      setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), incoming]);
    };

    const factory = clientFactoryRef.current;
    if (!factory) {
      setChatError("Realtime chat is not configured.");
      return undefined;
    }
    if (!capsuleId || !user) {
      void cleanupConnection();
      setChatError(null);
      return undefined;
    }

    let cancelled = false;
    const channelName = getCapsuleLiveChatChannel(capsuleId);

    const connect = async () => {
      setConnecting(true);
      setChatError(null);
      setConnected(false);

      try {
        const client = await factory.getClient(() => fetchLiveChatAuth(capsuleId));
        if (cancelled) {
          await factory.release(client);
          return;
        }
        clientRef.current = client;
        activeChannelRef.current = channelName;

        const unsubscribe = await client.subscribe(channelName, (event) => {
          const payload = event?.data as Partial<LiveChatMessage> | undefined;
          if (!payload || typeof payload !== "object") return;
          if (!payload.id || !payload.body || !payload.authorName || !payload.sentAt) return;
          appendMessage({
            id: String(payload.id),
            body: String(payload.body),
            authorName: String(payload.authorName),
            authorAvatar: payload.authorAvatar ?? null,
            sentAt: String(payload.sentAt),
          });
        });
        unsubscribeRef.current = unsubscribe;

        const presence = client.presence(channelName);
        const refreshPresence = async () => {
          try {
            const members = await presence.getMembers();
            if (!cancelled) {
              setParticipantCount(members.length);
            }
          } catch (error) {
            console.warn("livechat.presence.refresh.error", error);
          }
        };

        await refreshPresence();
        const presenceUnsub = await presence.subscribe(() => {
          void refreshPresence();
        });
        presenceUnsubRef.current = presenceUnsub;

        await presence.enter({
          capsuleId,
          capsuleName,
          userName: user.name ?? user.email ?? "Viewer",
        });

        if (!cancelled) {
          setConnected(true);
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : "Unable to connect to live chat.";
        const status = (error as { status?: number }).status;
        const resolvedMessage =
          status === 401 ? "Sign in to chat with the stream." : message;
        if (!cancelled) {
          setChatError(resolvedMessage);
          await cleanupConnection();
        }
      } finally {
        if (!cancelled) {
          setConnecting(false);
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      void cleanupConnection();
    };
  }, [capsuleId, capsuleName, user, cleanupConnection]);

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

  const canSend =
    status === "live" && Boolean(capsuleId) && Boolean(user) && connected && !chatError;
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
    setMessages((prev) => [...prev.slice(-(MAX_MESSAGES - 1)), message]);
    setDraft("");
    const client = clientRef.current;
    const channelName = capsuleId ? getCapsuleLiveChatChannel(capsuleId) : null;
    if (client && channelName) {
      try {
        await client.publish(channelName, "message", message);
      } catch (error) {
        console.warn("livechat.publish.error", error);
        setChatError("Unable to send message. Please try again.");
      }
    }
  };

  let subtitle = "Live chat will unlock once your stream starts.";
  if (chatError) {
    subtitle = chatError;
  } else if (!capsuleId) {
    subtitle = "Select a capsule to prepare the live chat.";
  } else if (!user) {
    subtitle = "Sign in to chat with the stream.";
  } else if (connecting && !connected) {
    subtitle = "Connecting to live chat...";
  } else if (status === "scheduled") {
    subtitle = "Your chat will open when you go live.";
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
              canSend
                ? "Share something with the stream..."
                : chatError || !user
                  ? "Sign in to chat"
                  : "Chat is locked until you're live"
            }
            disabled={!canSend}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className={styles.composerSend}
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
          >
            <ArrowUp size={18} weight="bold" />
          </button>
        </div>
      </form>
    </div>
  );
}
