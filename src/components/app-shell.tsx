"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";

import { AiPrompterStage, type PrompterAction, type ComposerMode, type PrompterAttachment } from "@/components/ai-prompter-stage";
import { AiComposerDrawer, type ComposerDraft } from "@/components/ai-composer";
import { PrimaryHeader } from "@/components/primary-header";
import friendsStyles from "@/app/(authenticated)/friends/friends.module.css";
import homeStyles from "./home.module.css";
import { applyThemeVars } from "@/lib/theme";
import { UsersThree, ChatsCircle, Handshake } from "@phosphor-icons/react/dist/ssr";

import styles from "./app-shell.module.css";

type NavKey = "home" | "create" | "capsule" | "memory";

type Friend = {
  id: string | null;
  userId: string | null;
  key?: string | null;
  name: string;
  avatar?: string | null;
  since?: string | null;
  status?: "online" | "offline" | "away";
};

type RailTab = "friends" | "chats" | "requests";

type ComposerChoice = { key: string; label: string };

type ComposerState = {
  open: boolean;
  loading: boolean;
  prompt: string;
  draft: ComposerDraft | null;
  rawPost: Record<string, unknown> | null;
  message: string | null;
  choices: ComposerChoice[] | null;
};

const fallbackFriends: Friend[] = [
  { id: "capsules", userId: null, key: null, name: "Capsules Team", status: "online" },
  { id: "memory", userId: null, key: null, name: "Memory Bot", status: "online" },
  { id: "dream", userId: null, key: null, name: "Dream Studio", status: "online" },
];

const initialComposerState: ComposerState = {
  open: false,
  loading: false,
  prompt: "",
  draft: null,
  rawPost: null,
  message: null,
  choices: null,
};

const CHAT_REMINDER_KEY = "capsule:lastChatReminder";
const CHAT_UNREAD_COUNT_KEY = "capsule:unreadChatCount";

type ConnectionOverrideMap = Partial<Record<RailTab, { description?: string; badge?: number }>>;
type ConnectionSummaryDetail = Partial<Record<RailTab, { description?: string | null; badge?: number | null }>>;

const CONNECTION_TILE_DEFS: Array<{ key: RailTab; title: string; icon: React.ReactNode; href: string }> = [
  {
    key: "friends",
    title: "Friends",
    icon: <UsersThree size={28} weight="duotone" className="duo" />,
    href: "/friends?tab=friends",
  },
  {
    key: "chats",
    title: "Chats",
    icon: <ChatsCircle size={28} weight="duotone" className="duo" />,
    href: "/friends?tab=chats",
  },
  {
    key: "requests",
    title: "Requests",
    icon: <Handshake size={28} weight="duotone" className="duo" />,
    href: "/friends?tab=requests",
  },
];

const RAIL_TAB_DEFS: Array<{ key: RailTab; label: string; icon: React.ReactNode }> = CONNECTION_TILE_DEFS.map(
  ({ key, title, icon }) => ({ key, label: title, icon }),
);

function isRailTab(value: unknown): value is RailTab {
  return value === "friends" || value === "chats" || value === "requests";
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function formatFriendsSummary(count: number): string {
  if (count <= 0) return "Invite friends to build your capsule.";
  if (count === 1) return "1 friend is connected.";
  if (count <= 4) return `${count} friends are connected.`;
  return `${count} ${pluralize("friend", count)} are in your capsule.`;
}

function formatRequestsSummary(incoming: number, outgoing: number): string {
  if (incoming > 0) {
    return `${incoming} ${pluralize("request", incoming)} need your review.`;
  }
  if (outgoing > 0) {
    return `Waiting on ${outgoing} ${pluralize("invitation", outgoing)}.`;
  }
  return "No pending requests right now.";
}

function formatRelativeTime(from: number, to: number): string {
  const diff = Math.max(0, to - from);
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "moments ago";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return "1 week ago";
  return `${weeks} weeks ago`;
}

function formatChatSummary(unread: number, lastReminder: number | null, now: number): string {
  if (unread > 0) {
    return `${unread} unread ${pluralize("chat", unread)} waiting.`;
  }
  if (lastReminder) {
    return `Last chat ${formatRelativeTime(lastReminder, now)}.`;
  }
  return "You're all caught up on chats.";
}

function sanitizeOverrideText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > 220 ? `${trimmed.slice(0, 219)}...` : trimmed;
}

function coerceBadge(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const safe = Math.max(0, Math.round(value));
  return safe > 0 ? safe : null;
}

function readStoredTimestamp(value: string | null): number | null {
  if (!value) return null;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
    return numeric;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function coerceTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return readStoredTimestamp(value);
  return null;
}

function sanitizePollFromDraft(draft: ComposerDraft): { question: string; options: string[] } | null {
  if (!draft.poll) return null;
  const question = typeof draft.poll.question === "string" ? draft.poll.question : "";
  const options = Array.isArray(draft.poll.options)
    ? draft.poll.options.map((option) => String(option ?? "")).filter((option) => option.trim().length > 0)
    : [];
  if (!question.trim() && !options.length) return null;
  return {
    question,
    options: options.length ? options : ["Yes", "No"],
  };
}

function normalizeDraftFromPost(post: Record<string, unknown>): ComposerDraft {
  const kind = typeof post.kind === "string" ? post.kind.toLowerCase() : "text";
  const content = typeof post.content === "string" ? post.content : "";
  const mediaUrl = typeof post.mediaUrl === "string"
    ? post.mediaUrl
    : typeof post.media_url === "string"
    ? (post.media_url as string)
    : null;
  const mediaPrompt = typeof post.mediaPrompt === "string"
    ? post.mediaPrompt
    : typeof post.media_prompt === "string"
    ? (post.media_prompt as string)
    : null;
  let poll: { question: string; options: string[] } | null = null;
  const pollValue = (post as Record<string, unknown>).poll;
  if (pollValue && typeof pollValue === "object") {
    const pollRecord = pollValue as Record<string, unknown>;
    const question = typeof pollRecord.question === "string" ? pollRecord.question : "";
    const optionsRaw = Array.isArray(pollRecord.options) ? pollRecord.options : [];
    const options = optionsRaw.map((option) => String(option ?? ""));
    poll = { question, options: options.length ? options : ["", ""] };
  }
  const suggestions = Array.isArray((post as Record<string, unknown>).suggestions)
    ? (post as Record<string, unknown>).suggestions
        .map((suggestion) => String(suggestion ?? ""))
        .filter((suggestion) => suggestion.trim().length > 0)
    : undefined;

  return {
    kind,
    title: typeof post.title === "string" ? post.title : null,
    content,
    mediaUrl,
    mediaPrompt,
    poll,
    suggestions,
  };
}

function buildPostPayload(
  draft: ComposerDraft,
  rawPost: Record<string, unknown> | null,
  author?: { name?: string | null; avatar?: string | null },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    client_id: typeof rawPost?.client_id === "string" ? rawPost.client_id : crypto.randomUUID(),
    kind: (draft.kind ?? "text").toLowerCase(),
    content: draft.content ?? "",
    source: rawPost?.source ?? "ai-prompter",
  };

  if (author?.name) {
    payload.userName = author.name;
    payload.user_name = author.name;
  }

  if (author?.avatar) {
    payload.userAvatar = author.avatar;
    payload.user_avatar = author.avatar;
  }

  if (draft.title && draft.title.trim()) payload.title = draft.title.trim();

  if (draft.mediaUrl && draft.mediaUrl.trim()) {
    payload.mediaUrl = draft.mediaUrl.trim();
    payload.media_url = draft.mediaUrl.trim();
  }

  if (draft.mediaPrompt && draft.mediaPrompt.trim()) {
    payload.mediaPrompt = draft.mediaPrompt.trim();
    payload.media_prompt = draft.mediaPrompt.trim();
  }

  if (draft.kind.toLowerCase() === "poll") {
    const sanitized = sanitizePollFromDraft(draft);
    if (sanitized) payload.poll = sanitized;
  }

  if (rawPost?.capsule_id) payload.capsule_id = rawPost.capsule_id;
  if (rawPost?.capsuleId) payload.capsuleId = rawPost.capsuleId;

  return payload;
}

async function callAiPrompt(
  message: string,
  options?: Record<string, unknown>,
  post?: Record<string, unknown>,
  attachments?: PrompterAttachment[],
) {
  const body: Record<string, unknown> = { message };
  if (options && Object.keys(options).length) body.options = options;
  if (post) body.post = post;
  if (attachments && attachments.length) body.attachments = attachments;

  const response = await fetch("/api/ai/prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `AI request failed (${response.status})`);
  }

  return (await response.json()) as Record<string, unknown>;
}

async function callStyler(prompt: string, userEnvelope?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { prompt };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userEnvelope) {
    body.user = userEnvelope;
    try {
      headers["X-Capsules-User"] = JSON.stringify(userEnvelope);
    } catch {
      // ignore serialization issues
    }
  }

  const response = await fetch("/api/ai/styler", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });

  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    let parsedMessage = "";
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { message?: unknown; error?: unknown };
        if (typeof parsed.message === "string") {
          parsedMessage = parsed.message.trim();
        } else if (typeof parsed.error === "string") {
          parsedMessage = parsed.error.trim();
        }
      } catch {
        parsedMessage = raw.trim();
      }
    }
    console.error("Styler request failed", {
      status: response.status,
      message: parsedMessage,
      raw,
    });
    throw new Error(parsedMessage || `Styler request failed (${response.status})`);
  }
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    console.error("Styler response parse error", error, raw);
    throw new Error("Invalid styler response");
  }
}

async function persistPost(post: Record<string, unknown>, userEnvelope?: Record<string, unknown>) {
  const body: Record<string, unknown> = { post };
  if (userEnvelope) body.user = userEnvelope;
  const response = await fetch("/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Post failed (${response.status})`);
  }
  return response.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

type AppShellProps = {
  children: React.ReactNode;
  activeNav?: NavKey;
  showPrompter?: boolean;
  promoSlot?: React.ReactNode;
};

export function AppShell({ children, activeNav, showPrompter = true, promoSlot }: AppShellProps) {
  const pathname = usePathname();
  const { user } = useUser();
  const derivedActive: NavKey = React.useMemo(() => {
    if (activeNav) return activeNav;
    if (!pathname) return "home";
    if (pathname.startsWith("/create")) return "create";
    if (pathname.startsWith("/capsule")) return "capsule";
    if (pathname.startsWith("/memory")) return "memory";
    return "home";
  }, [activeNav, pathname]);

  const [friends, setFriends] = React.useState<Friend[]>(fallbackFriends);
  const [railMode, setRailMode] = React.useState<"tiles" | "connections">("tiles");
  const [activeRailTab, setActiveRailTab] = React.useState<RailTab>("friends");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [composer, setComposer] = React.useState<ComposerState>(initialComposerState);
  const [activeFriendTarget, setActiveFriendTarget] = React.useState<string | null>(null);
  const [friendActionPendingId, setFriendActionPendingId] = React.useState<string | null>(null);

  const [incomingRequestCount, setIncomingRequestCount] = React.useState(0);
  const [outgoingRequestCount, setOutgoingRequestCount] = React.useState(0);
  const [unreadChats, setUnreadChats] = React.useState(0);
  const [lastChatReminder, setLastChatReminder] = React.useState<number | null>(null);
  const [chatTicker, setChatTicker] = React.useState(0);
  const [connectionOverrides, setConnectionOverrides] = React.useState<ConnectionOverrideMap>({});


  React.useEffect(() => {
    try {
      const storedUnread = localStorage.getItem(CHAT_UNREAD_COUNT_KEY);
      if (storedUnread !== null) {
        const parsed = Number.parseInt(storedUnread, 10);
        if (!Number.isNaN(parsed)) {
          setUnreadChats(Math.max(0, parsed));
        }
      }
      const storedReminderRaw = localStorage.getItem(CHAT_REMINDER_KEY);
      const storedReminder = readStoredTimestamp(storedReminderRaw);
      if (storedReminder !== null) {
        setLastChatReminder(storedReminder);
      }
    } catch {
      // ignore storage read errors
    }
  }, []);

  React.useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (!event.key) return;
      if (event.key === CHAT_UNREAD_COUNT_KEY) {
        if (event.newValue === null) {
          setUnreadChats(0);
        } else {
          const parsed = Number.parseInt(event.newValue, 10);
          if (!Number.isNaN(parsed)) {
            setUnreadChats(Math.max(0, parsed));
          }
        }
      }
      if (event.key === CHAT_REMINDER_KEY) {
        if (event.newValue === null) {
          setLastChatReminder(null);
        } else {
          const timestamp = readStoredTimestamp(event.newValue);
          if (timestamp !== null) {
            setLastChatReminder(timestamp);
          }
        }
      }
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  React.useEffect(() => {
    try {
      if (unreadChats > 0) {
        localStorage.setItem(CHAT_UNREAD_COUNT_KEY, String(unreadChats));
      } else {
        localStorage.removeItem(CHAT_UNREAD_COUNT_KEY);
      }
    } catch {
      // ignore storage write errors
    }
  }, [unreadChats]);

  React.useEffect(() => {
    try {
      if (lastChatReminder) {
        localStorage.setItem(CHAT_REMINDER_KEY, String(lastChatReminder));
      } else {
        localStorage.removeItem(CHAT_REMINDER_KEY);
      }
    } catch {
      // ignore storage write errors
    }
  }, [lastChatReminder]);

  React.useEffect(() => {
    if (!lastChatReminder) return;
    setChatTicker(Date.now());
    const timer = window.setInterval(() => setChatTicker(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [lastChatReminder]);
  React.useEffect(() => {
    function handleChatStatus(event: Event) {
      const detail = (event as CustomEvent<{ unreadCount?: number; lastReceivedAt?: number | string | null; description?: string | null }>).detail;
      if (!detail || typeof detail !== "object") return;

      if (typeof detail.unreadCount === "number" && Number.isFinite(detail.unreadCount)) {
        setUnreadChats(Math.max(0, Math.round(detail.unreadCount)));
      }

      if (Object.prototype.hasOwnProperty.call(detail, "lastReceivedAt")) {
        const raw = (detail as { lastReceivedAt?: number | string | null }).lastReceivedAt;
        if (raw === null) {
          setLastChatReminder(null);
        } else if (raw !== undefined) {
          const timestamp = coerceTimestamp(raw);
          if (timestamp !== null) {
            setLastChatReminder(timestamp);
          }
        }
      }

      if (Object.prototype.hasOwnProperty.call(detail, "description")) {
        const overrideText = sanitizeOverrideText((detail as { description?: string | null }).description ?? null);
        setConnectionOverrides((prev) => {
          const next: ConnectionOverrideMap = { ...prev };
          const existing = next.chats ?? {};
          let changed = false;
          if (overrideText) {
            if (existing.description !== overrideText) {
              next.chats = { ...existing, description: overrideText };
              changed = true;
            }
          } else if (existing.description) {
            const rest = { ...existing };
            delete rest.description;
            if (Object.keys(rest).length) {
              next.chats = rest;
            } else {
              delete next.chats;
            }
            changed = true;
          }
          return changed ? next : prev;
        });
      }
    }

    window.addEventListener("capsule:chat:status", handleChatStatus as EventListener);
    return () => window.removeEventListener("capsule:chat:status", handleChatStatus as EventListener);
  }, []);

  React.useEffect(() => {
    function handleConnectionUpdate(event: Event) {
      const detail = (event as CustomEvent<ConnectionSummaryDetail>).detail;
      if (!detail || typeof detail !== "object") return;

      setConnectionOverrides((prev) => {
        let mutated = false;
        const next: ConnectionOverrideMap = { ...prev };

        (Object.entries(detail) as [string, ConnectionSummaryDetail[RailTab]][]).forEach(([rawKey, patch]) => {
          if (!isRailTab(rawKey)) return;

          if (patch == null) {
            if (next[rawKey]) {
              delete next[rawKey];
              mutated = true;
            }
            return;
          }

          const patchValue = patch as { description?: string | null; badge?: number | null };
          const current = { ...(next[rawKey] ?? {}) } as { description?: string; badge?: number };
          let localChanged = false;

          if (Object.prototype.hasOwnProperty.call(patchValue, "description")) {
            const normalized = sanitizeOverrideText(patchValue.description ?? null);
            if (normalized) {
              if (current.description !== normalized) {
                current.description = normalized;
                localChanged = true;
              }
            } else if (current.description) {
              delete current.description;
              localChanged = true;
            }
          }

          if (Object.prototype.hasOwnProperty.call(patchValue, "badge")) {
            const badgeRaw = patchValue.badge;
            if (badgeRaw === null) {
              if (current.badge !== undefined) {
                delete current.badge;
                localChanged = true;
              }
            } else {
              const normalizedBadge = coerceBadge(badgeRaw);
              if (normalizedBadge !== null) {
                if (current.badge !== normalizedBadge) {
                  current.badge = normalizedBadge;
                  localChanged = true;
                }
              } else if (current.badge !== undefined) {
                delete current.badge;
                localChanged = true;
              }
            }
          }

          if (localChanged) {
            mutated = true;
            if (Object.keys(current).length) {
              next[rawKey] = current;
            } else if (next[rawKey]) {
              delete next[rawKey];
            }
          }
        });

        return mutated ? next : prev;
      });
    }

    window.addEventListener("capsule:connections:update", handleConnectionUpdate as EventListener);
    return () => window.removeEventListener("capsule:connections:update", handleConnectionUpdate as EventListener);
  }, []);
  const currentUserName = React.useMemo(() => {
    if (!user) return null;
    return (user.fullName && user.fullName.trim())
      || (user.username && user.username.trim())
      || (user.firstName && user.firstName.trim())
      || (user.lastName && user.lastName.trim())
      || (user.primaryEmailAddress?.emailAddress ?? null);
  }, [user]);

  const currentUserAvatar = user?.imageUrl ?? null;

  const currentAuthor = React.useMemo(() => ({
    name: currentUserName ?? undefined,
    avatar: currentUserAvatar ?? undefined,
  }), [currentUserName, currentUserAvatar]);
  const currentUserEnvelope = React.useMemo(() => {
    if (!user) return null;
    return {
      clerk_id: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      full_name: currentUserName ?? null,
      avatar_url: currentUserAvatar ?? null,
      provider: user.primaryEmailAddress?.verification?.strategy ?? 'clerk',
      key: user.username ? `clerk:${user.username}` : undefined,
    };
  }, [user, currentUserName, currentUserAvatar]);

  const envelopeClerkId = currentUserEnvelope?.clerk_id ?? null;
  const envelopeEmail = currentUserEnvelope?.email ?? null;
  const envelopeFullName = currentUserEnvelope?.full_name ?? null;
  const envelopeAvatarUrl = currentUserEnvelope?.avatar_url ?? null;
  const envelopeProvider = currentUserEnvelope?.provider ?? null;
  const envelopeKey = currentUserEnvelope?.key ?? null;

  const envelopePayload = React.useMemo(() => {
    if (!envelopeClerkId && !envelopeEmail && !envelopeFullName && !envelopeAvatarUrl && !envelopeProvider && !envelopeKey) {
      return null;
    }
    return {
      clerk_id: envelopeClerkId,
      email: envelopeEmail,
      full_name: envelopeFullName,
      avatar_url: envelopeAvatarUrl,
      provider: envelopeProvider,
      key: envelopeKey || undefined,
    };
  }, [envelopeClerkId, envelopeEmail, envelopeFullName, envelopeAvatarUrl, envelopeProvider, envelopeKey]);


  const mapFriendList = React.useCallback((items: unknown[]): Friend[] => {
    return items.map((raw) => {
      const record = raw as Record<string, unknown>;
      const name = typeof record["name"] === "string"
        ? (record["name"] as string)
        : typeof record["user_name"] === "string"
        ? (record["user_name"] as string)
        : typeof record["userName"] === "string"
        ? (record["userName"] as string)
        : "Friend";
      const avatar = typeof record["avatar"] === "string"
        ? (record["avatar"] as string)
        : typeof record["avatarUrl"] === "string"
        ? (record["avatarUrl"] as string)
        : typeof record["userAvatar"] === "string"
        ? (record["userAvatar"] as string)
        : null;
      const statusValue = typeof record["status"] === "string" ? (record["status"] as string) : undefined;
      const status: Friend["status"] = statusValue === "online" || statusValue === "away" ? statusValue : "offline";
      return {
        id: typeof record["id"] === "string" ? (record["id"] as string) : null,
        userId:
          typeof record["userId"] === "string"
            ? (record["userId"] as string)
            : typeof record["user_id"] === "string"
            ? (record["user_id"] as string)
            : null,
        key:
          typeof record["key"] === "string"
            ? (record["key"] as string)
            : typeof record["userKey"] === "string"
            ? (record["userKey"] as string)
            : null,
        name,
        avatar,
        since: typeof record["since"] === "string" ? (record["since"] as string) : null,
        status,
      } satisfies Friend;
    });
  }, []);

  const buildFriendTargetPayload = React.useCallback((friend: Friend): Record<string, string> | null => {
    const target: Record<string, string> = {};
    if (friend.userId) {
      target.userId = friend.userId;
    } else if (friend.key) {
      target.userKey = friend.key;
    } else {
      return null;
    }
    if (friend.name) target.name = friend.name;
    if (friend.avatar) target.avatar = friend.avatar;
    return target;
  }, []);

  React.useEffect(() => {
    fetch("/api/friends/sync", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        const arr = Array.isArray(d?.friends) ? d.friends : [];
        const mapped = mapFriendList(arr);
        setFriends(mapped.length ? mapped : fallbackFriends);

        const rawGraph = d && typeof d === "object" ? (d as { graph?: unknown }).graph : null;
        const graph =
          rawGraph && typeof rawGraph === "object"
            ? (rawGraph as { incomingRequests?: unknown; outgoingRequests?: unknown })
            : null;
        const incoming = Array.isArray(graph?.incomingRequests) ? graph.incomingRequests.length : 0;
        const outgoing = Array.isArray(graph?.outgoingRequests) ? graph.outgoingRequests.length : 0;
        setIncomingRequestCount(incoming);
        setOutgoingRequestCount(outgoing);
      })
      .catch(() => {
        setFriends(fallbackFriends);
        setIncomingRequestCount(0);
        setOutgoingRequestCount(0);
      });
  }, [mapFriendList]);

  React.useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const connectionTiles = React.useMemo(() => {
    const now = chatTicker || Date.now();

    const defaults = {
      friends: {
        description: formatFriendsSummary(friends.length),
        badge: friends.length > 0 ? friends.length : null,
      },
      chats: {
        description: formatChatSummary(unreadChats, lastChatReminder, now),
        badge: unreadChats > 0 ? unreadChats : null,
      },
      requests: {
        description: formatRequestsSummary(incomingRequestCount, outgoingRequestCount),
        badge: incomingRequestCount > 0 ? incomingRequestCount : null,
      },
    } as const;

    return CONNECTION_TILE_DEFS.map((def) => {
      const override = connectionOverrides[def.key];
      const fallback = defaults[def.key];
      const description = override?.description ?? fallback.description;
      const badgeValue = override?.badge ?? fallback.badge;
      const badge = typeof badgeValue === "number" && badgeValue > 0 ? badgeValue : undefined;

      return {
        ...def,
        description,
        badge,
      };
    });
  }, [
    friends.length,
    unreadChats,
    lastChatReminder,
    incomingRequestCount,
    outgoingRequestCount,
    connectionOverrides,
    chatTicker,
  ]);

  function presenceClass(status?: string) {
    if (status === "online") return friendsStyles.online;
    if (status === "away") return friendsStyles.away ?? friendsStyles.online;
    return friendsStyles.offline;
  }

  const handleFriendNameClick = React.useCallback((identifier: string) => {
    setActiveFriendTarget((prev) => (prev === identifier ? null : identifier));
  }, []);

  const handleFriendRemove = React.useCallback(
    async (friend: Friend, identifier: string) => {
      const target = buildFriendTargetPayload(friend);
      if (!target) {
        setStatusMessage("That profile isn't ready for requests yet.");
        return;
      }
      setFriendActionPendingId(identifier);
      try {
        const res = await fetch("/api/friends/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", target }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const message =
            (data && typeof data.message === "string" && data.message)
              || (data && typeof data.error === "string" && data.error)
              || "Could not send that friend request.";
          throw new Error(message);
        }
        if (data && Array.isArray(data.friends)) {
          setFriends(mapFriendList(data.friends));
        }
        if (data && data.graph && typeof data.graph === "object") {
          const graph = data.graph as { incomingRequests?: unknown; outgoingRequests?: unknown };
          const incoming = Array.isArray(graph.incomingRequests) ? graph.incomingRequests.length : 0;
          const outgoing = Array.isArray(graph.outgoingRequests) ? graph.outgoingRequests.length : 0;
          setIncomingRequestCount(incoming);
          setOutgoingRequestCount(outgoing);
        }
        setStatusMessage(`${friend.name} removed from friends.`);
      } catch (error) {
        console.error("Friend request error", error);
        setStatusMessage(
          error instanceof Error && error.message ? error.message : "Couldn't remove that friend.",
        );
      } finally {
        setFriendActionPendingId(null);
        setActiveFriendTarget(null);
      }
    },
    [buildFriendTargetPayload, mapFriendList, setFriends, setStatusMessage],
  );

  const handleAiResponse = React.useCallback(
    (prompt: string, payload: Record<string, unknown>, previous?: { draft: ComposerDraft | null; raw: Record<string, unknown> | null }) => {
      const action = typeof payload.action === "string" ? payload.action : "draft_post";
      if (action === "draft_post") {
        const postRecord = (payload.post ?? {}) as Record<string, unknown>;
        const nextDraft = normalizeDraftFromPost(postRecord);
        setComposer({
          open: true,
          loading: false,
          prompt,
          draft: nextDraft,
          rawPost: postRecord,
          message: typeof payload.message === "string" ? payload.message : null,
          choices: null,
        });
        setStatusMessage(null);
        return;
      }

      if (action === "confirm_edit_choice") {
        const choicesArray = Array.isArray(payload.choices) ? payload.choices : [];
        const mapped: ComposerChoice[] = choicesArray.map((choice) => {
          const record = choice as Record<string, unknown>;
          const key = String(record.key ?? "option");
          const label = typeof record.label === "string" && record.label.trim() ? record.label : key;
          return { key, label };
        });
        setComposer({
          open: true,
          loading: false,
          prompt,
          draft: previous?.draft ?? null,
          rawPost: previous?.raw ?? null,
          message: typeof payload.message === "string" ? payload.message : "Choose how you'd like to continue.",
          choices: mapped.length ? mapped : null,
        });
        return;
      }

      if (action === "navigate") {
        setStatusMessage(typeof payload.message === "string" ? payload.message : "Navigation ready.");
        setComposer(initialComposerState);
        return;
      }

      setStatusMessage(typeof payload.message === "string" ? payload.message : "Capsule AI responded.");
      setComposer(initialComposerState);
    },
    [],
  );

  const submitManualPost = React.useCallback(
    async (content: string, attachments?: PrompterAttachment[]) => {
      const trimmed = content.trim();
      const hasAttachment = Boolean(attachments && attachments.length);
      if (!trimmed && !hasAttachment) return;
      setStatusMessage("Posting...");
      const nameValue = typeof envelopeFullName === "string" ? envelopeFullName.trim() : "";
      const avatarValue = typeof envelopeAvatarUrl === "string" ? envelopeAvatarUrl.trim() : "";
      const baseEnvelope = envelopePayload;
      const postEnvelope = baseEnvelope
        ? {
            ...baseEnvelope,
            full_name: nameValue || null,
            avatar_url: avatarValue || null,
          }
        : null;
      const mediaAttachment = attachments?.find((file) => file.mimeType.startsWith("image/"));
      const postPayload: Record<string, unknown> = {
        client_id: crypto.randomUUID(),
        kind: "text",
        content: trimmed,
        source: "ai-prompter",
        userName: nameValue || undefined,
        user_name: nameValue || undefined,
        userAvatar: avatarValue || undefined,
        user_avatar: avatarValue || undefined,
      };
      if (mediaAttachment) {
        postPayload.mediaUrl = mediaAttachment.url;
        postPayload.media_url = mediaAttachment.url;
      }
      if (attachments && attachments.length) {
        postPayload.attachments = attachments;
      }
      try {
        await persistPost(postPayload, postEnvelope ?? undefined);
        setStatusMessage("Posted to your feed.");
        window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "manual" } }));
      } catch (error) {
        console.error("Manual post error", error);
        setStatusMessage("Couldn't post right now.");
      }
    },
    [envelopePayload, envelopeFullName, envelopeAvatarUrl],
  );



  const runStyler = React.useCallback(async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setStatusMessage("Styling your capsule...");
    try {
      const payload = (await callStyler(trimmed, envelopePayload ?? undefined)) ?? {};
      const record = payload as Record<string, unknown>;
      const varsCandidate = record.vars;
      const safeVars: Record<string, string> = {};
      if (varsCandidate && typeof varsCandidate === "object") {
        Object.entries(varsCandidate as Record<string, unknown>).forEach(([key, value]) => {
          if (typeof key === "string" && key.startsWith("--") && typeof value === "string") {
            const normalizedKey = key.trim();
            if (normalizedKey.startsWith("--") && normalizedKey.length <= 80) {
              const normalizedValue = value.trim();
              if (normalizedValue.length <= 400) {
                safeVars[normalizedKey] = normalizedValue;
              }
            }
          }
        });
      }
      if (Object.keys(safeVars).length) {
        applyThemeVars(safeVars);
      }
      const summaryValue = typeof record.summary === "string" ? record.summary.trim() : "";
      setStatusMessage(summaryValue.length ? summaryValue : "Updated your capsule style.");
    } catch (error) {
      console.error("Styler error", error);
      setStatusMessage(
        error instanceof Error && error.message
          ? `Couldn't restyle yet: ${error.message}`
          : "Couldn't restyle yet.",
      );
    }
  }, [envelopePayload]);


  const runAiComposer = React.useCallback(
    async (prompt: string, mode: ComposerMode, attachments?: PrompterAttachment[]) => {
      setComposer({
        open: true,
        loading: true,
        prompt,
        draft: null,
        rawPost: null,
        message: null,
        choices: null,
      });
      setStatusMessage("Drafting with Capsule AI...");
      try {
        const options: Record<string, unknown> = {};
        if (mode === "poll") options.prefer = "poll";
        const payload = await callAiPrompt(
          prompt,
          Object.keys(options).length ? options : undefined,
          undefined,
          attachments,
        );
        handleAiResponse(prompt, payload);
      } catch (error) {
        console.error("AI draft error", error);
        setComposer((prev) => ({ ...prev, loading: false }));
        setStatusMessage("Could not reach Capsule AI right now.");
      }
    },
    [handleAiResponse],
  );

  const handlePrompterAction = React.useCallback(
    (action: PrompterAction) => {
      if (action.kind === "post_manual") {
        submitManualPost(action.content, action.attachments);
        return;
      }
      if (action.kind === "post_ai") {
        runAiComposer(action.prompt, action.mode, action.attachments);
        return;
      }
      if (action.kind === "style") {
        runStyler(action.prompt);
        return;
      }
      if (action.kind === "generate") {
        if (action.attachments && action.attachments.length) {
          submitManualPost(action.text, action.attachments);
          return;
        }
        setStatusMessage("Prompt received.");
      }
    },
    [runAiComposer, runStyler, submitManualPost],
  );

  const handleDraftChange = React.useCallback((next: ComposerDraft) => {
    setComposer((prev) => ({ ...prev, draft: next }));
  }, []);

  const handleComposerClose = React.useCallback(() => {
    setComposer(initialComposerState);
  }, []);

  const handleComposerChoice = React.useCallback(
    async (key: string) => {
      setComposer((prev) => ({ ...prev, loading: true, choices: null }));
      try {
        const payload = await callAiPrompt(composer.prompt, { force: key }, composer.rawPost ?? undefined);
        handleAiResponse(composer.prompt, payload, { draft: composer.draft, raw: composer.rawPost });
      } catch (error) {
        console.error("AI choice error", error);
        setComposer((prev) => ({ ...prev, loading: false }));
        setStatusMessage("Could not complete that request.");
      }
    },
    [composer.prompt, composer.draft, composer.rawPost, handleAiResponse],
  );

  const handleComposerPost = React.useCallback(async () => {
    if (!composer.draft) return;
    setComposer((prev) => ({ ...prev, loading: true }));
    try {
      const postPayload = buildPostPayload(composer.draft, composer.rawPost, currentAuthor);
      await persistPost(postPayload, currentUserEnvelope ?? undefined);
      setComposer(initialComposerState);
      setStatusMessage("Post published.");
      window.dispatchEvent(new CustomEvent("posts:refresh", { detail: { reason: "ai" } }));
    } catch (error) {
      console.error("Composer publish error", error);
      setComposer((prev) => ({ ...prev, loading: false }));
      setStatusMessage("Couldn't publish that post yet.");
    }
  }, [composer.draft, composer.rawPost, currentAuthor, currentUserEnvelope]);

  return (
    <div className={styles.outer}>
      <PrimaryHeader activeKey={derivedActive} />
      <div className={styles.page}>
        <main className={styles.main}>
          {showPrompter ? (
            <div className={styles.prompterStage}>
              <AiPrompterStage onAction={handlePrompterAction} statusMessage={statusMessage} />
            </div>
          ) : null}

          <div className={styles.layout}>
            <section className={styles.content}>
              {promoSlot ? <div className={styles.promoRowSpace}>{promoSlot}</div> : null}
              {children}
            </section>
            <aside className={styles.rail}>
              {railMode === "tiles" ? (
                <div className={homeStyles.connectionTiles}>
                  {connectionTiles.map((tile) => (
                    <button
                      key={tile.key}
                      type="button"
                      data-tile={tile.key}
                      className={homeStyles.connectionTile}
                      onClick={() => {
                        setActiveRailTab(tile.key);
                        setRailMode("connections");
                      }}
                    >
                      <div className={homeStyles.connectionTileHeader}>
                        <div className={homeStyles.connectionTileMeta}>
                          <span className={homeStyles.connectionTileIcon} aria-hidden>
                            {tile.icon}
                          </span>
                          <span className={homeStyles.connectionTileTitle}>{tile.title}</span>
                        </div>
                        {tile.badge ? <span className={homeStyles.connectionTileBadge}>{tile.badge}</span> : null}
                      </div>
                      <p className={homeStyles.connectionTileDescription}>{tile.description}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={homeStyles.railConnections}>
                  <div className={homeStyles.railHeaderRow}>
                    <button
                      type="button"
                      className={homeStyles.railBackBtn}
                      aria-label="Back to tiles"
                      onClick={() => setRailMode("tiles")}
                    >
                      &lt;
                    </button>
                  </div>
                  <div className={homeStyles.railTabs} role="tablist" aria-label="Connections">
                    {RAIL_TAB_DEFS.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={activeRailTab === tab.key}
                        className={`${homeStyles.railTab} ${activeRailTab === tab.key ? homeStyles.railTabActive : ""}`.trim()}
                        onClick={() => setActiveRailTab(tab.key)}
                      >
                        <span className={homeStyles.railTabIcon} aria-hidden>
                          {tab.icon}
                        </span>
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className={homeStyles.railPanel} hidden={activeRailTab !== "friends"}>
                    <div className={`${friendsStyles.list}`.trim()}>
                      {friends.map((f, i) => {
                        const identifier = f.userId ?? f.key ?? f.id ?? `friend-${i}`;
                        const listKey = `${identifier}-${i}`;
                        const canTarget = Boolean(f.userId || f.key || f.id);
                        const isOpen = activeFriendTarget === identifier;
                        const isPending = friendActionPendingId === identifier;
                        const sinceLabel = f.since ? new Date(f.since).toLocaleDateString() : null;
                        return (
                          <div key={listKey} className={friendsStyles.friendRow}>
                          <span className={friendsStyles.avatarWrap}>
                            {f.avatar ? (
                              <img className={friendsStyles.avatarImg} src={f.avatar} alt="" aria-hidden />
                            ) : (
                              <span className={friendsStyles.avatar} aria-hidden />
                            )}
                            <span className={`${friendsStyles.presence} ${presenceClass(f.status)}`.trim()} aria-hidden />
                          </span>
                          <div className={friendsStyles.friendMeta}>
                              <button
                                type="button"
                                className={`${friendsStyles.friendNameButton} ${friendsStyles.friendName}`.trim()}
                                onClick={() => handleFriendNameClick(identifier)}
                                aria-expanded={isOpen}
                              >
                                {f.name}
                              </button>
                              {sinceLabel ? <div className={friendsStyles.friendSince}>Since {sinceLabel}</div> : null}
                              {isOpen ? (
                                <div className={friendsStyles.friendActions}>
                                  <button
                                    type="button"
                                    className={friendsStyles.friendActionButton}
                                    onClick={() => handleFriendRemove(f, identifier)}
                                    disabled={!canTarget || isPending}
                                    aria-busy={isPending}
                                  >
                                    {isPending ? "Removing..." : "Delete"}
                                  </button>
                                </div>
                              ) : null}
                          </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className={homeStyles.railPanel} hidden={activeRailTab !== "chats"}>
                    <div className={friendsStyles.empty}>Chats are coming soon.</div>
                  </div>
                  <div className={homeStyles.railPanel} hidden={activeRailTab !== "requests"}>
                    <div className={friendsStyles.empty}>No pending requests.</div>
                  </div>
                </div>
              )}
            </aside>
          </div>
        </main>
      </div>
      <AiComposerDrawer
        open={composer.open}
        loading={composer.loading}
        draft={composer.draft}
        prompt={composer.prompt}
        message={composer.message}
        choices={composer.choices}
        onChange={handleDraftChange}
        onClose={handleComposerClose}
        onPost={handleComposerPost}
        onForceChoice={composer.choices ? handleComposerChoice : undefined}
      />
    </div>
  );
}























