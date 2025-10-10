import type { FriendItem } from "@/hooks/useFriendsData";

export type ChatSessionType = "direct" | "group";

export type ChatParticipant = {
  id: string;
  name: string;
  avatar: string | null;
};

export type ChatMessage = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
  status: "pending" | "sent" | "failed";
};

export type ChatSession = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: ChatParticipant[];
  messages: ChatMessage[];
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
};

export type ChatSessionDescriptor = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: ChatParticipant[];
};

export type ChatMessageEventPayload = {
  type: "chat.message";
  conversationId: string;
  senderId: string;
  participants: ChatParticipant[];
  session?: {
    type?: ChatSessionType;
    title?: string | null;
    avatar?: string | null;
    createdBy?: string | null;
  };
  message: {
    id: string;
    body: string;
    sentAt: string;
  };
};

export type ChatSessionEventPayload = {
  type: "chat.session";
  conversationId: string;
  session: ChatSessionDescriptor;
};

export type StoredMessage = {
  id: string;
  authorId: string;
  body: string;
  sentAt: string;
};

export type StoredParticipant = {
  id: string;
  name: string;
  avatar: string | null;
};

export type StoredSession = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: StoredParticipant[];
  messages: StoredMessage[];
};

export type LegacyStoredSession = {
  id: string;
  friendUserId: string;
  friendName: string;
  friendAvatar: string | null;
  messages: StoredMessage[];
};

export type StoredState = {
  activeSessionId: string | null;
  sessions: Array<StoredSession | LegacyStoredSession>;
};

type ChatSessionInternal = {
  id: string;
  type: ChatSessionType;
  title: string;
  avatar: string | null;
  createdBy: string | null;
  participants: ChatParticipant[];
  messages: ChatMessage[];
  messageIndex: Map<string, number>;
  lastMessageTimestamp: number;
  unreadCount: number;
};

export type StorageAdapter = Pick<Storage, "getItem" | "setItem">;

export type ChatStoreSnapshot = {
  sessions: ChatSession[];
  activeSessionId: string | null;
  activeSession: ChatSession | null;
  unreadCount: number;
};

export type ChatStoreConfig = {
  storage?: StorageAdapter | null;
  storageKey?: string;
  messageLimit?: number;
  now?: () => number;
};

const DEFAULT_STORAGE_KEY = "capsule:chat:sessions";
const DEFAULT_MESSAGE_LIMIT = 100;

const USER_ID_PATTERN = /user[:_-][0-9a-z-]+/i;

function standardizeUserId(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const directMatch = /^user[_-][0-9a-z-]+$/i.exec(trimmed);
  if (directMatch) {
    return `user_${directMatch[0]!.slice("user".length + 1).replace(/[^0-9a-z-]/gi, "").toLowerCase()}`;
  }
  const embeddedMatch = USER_ID_PATTERN.exec(trimmed);
  if (!embeddedMatch) {
    return null;
  }
  const raw = embeddedMatch[0] ?? "";
  const separatorIndex = raw.search(/[:_-]/);
  if (separatorIndex === -1) return raw.toLowerCase();
  const suffix = raw.slice(separatorIndex + 1).replace(/[^0-9a-z-]/gi, "");
  if (!suffix) return null;
  return `user_${suffix.toLowerCase()}`;
}

function resolveParticipantId(data: Record<string, unknown>): string {
  const candidates: string[] = [];
  const pushCandidate = (value: unknown) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) candidates.push(trimmed);
    }
  };
  pushCandidate(data.userId);
  pushCandidate(data.id);
  pushCandidate((data as { user_id?: unknown }).user_id);
  pushCandidate((data as { identifier?: unknown }).identifier);
  pushCandidate((data as { key?: unknown }).key);
  pushCandidate((data as { clientId?: unknown }).clientId);
  pushCandidate((data as { client_id?: unknown }).client_id);
  pushCandidate((data as { user?: { id?: unknown; userId?: unknown } }).user?.id);
  pushCandidate((data as { user?: { id?: unknown; userId?: unknown } }).user?.userId);
  pushCandidate((data as { profile?: { id?: unknown; userId?: unknown } }).profile?.id);
  pushCandidate((data as { profile?: { id?: unknown; userId?: unknown } }).profile?.userId);

  for (const candidate of candidates) {
    const standardized = standardizeUserId(candidate);
    if (standardized) return standardized;
  }

  if (!candidates.length) return "";
  const userLike = candidates.find((value) => /^user[_:-]/i.test(value));
  if (userLike) return userLike;
  const nonClient = candidates.find((value) => !/^client[:]/i.test(value));
  if (nonClient) return nonClient;
  return candidates[0] ?? "";
}

function canonicalParticipantKey(id: string): string {
  const trimmed = id.trim().toLowerCase();
  if (!trimmed) return "";
  const standardized = standardizeUserId(trimmed);
  if (standardized) return standardized;
  const withoutClient = trimmed.startsWith("client:") ? trimmed.slice("client:".length) : trimmed;
  const embeddedStandardized = standardizeUserId(withoutClient);
  if (embeddedStandardized) return embeddedStandardized;
  if (withoutClient.includes(":") || withoutClient.includes("|") || withoutClient.includes("#")) {
    const base = withoutClient.split(/[:|#]/, 1)[0] ?? withoutClient;
    return base;
  }
  return withoutClient;
}

export function normalizeParticipant(entry: Partial<ChatParticipant> | ChatParticipant | null | undefined): ChatParticipant | null {
  if (!entry || typeof entry !== "object") return null;
  const data = entry as Record<string, unknown>;
  const idCandidate = resolveParticipantId(data);
  if (!idCandidate) return null;
  const rawName =
    typeof data.name === "string"
      ? (data.name as string)
      : typeof data.displayName === "string"
        ? (data.displayName as string)
        : "";
  const standardizedId = standardizeUserId(idCandidate) ?? idCandidate;
  const name = rawName.trim() || standardizedId;
  const avatarCandidate = typeof data.avatar === "string" ? (data.avatar as string).trim() : "";
  const avatar = avatarCandidate.length > 0 ? avatarCandidate : null;
  return { id: standardizedId, name, avatar };
}

export function mergeParticipants(...lists: Array<Iterable<ChatParticipant>>): ChatParticipant[] {
  const map = new Map<string, ChatParticipant>();
  for (const list of lists) {
    for (const entry of list) {
      const normalized = normalizeParticipant(entry);
      if (!normalized) continue;
      const key = canonicalParticipantKey(normalized.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, normalized);
        continue;
      }
      const name = normalized.name !== normalized.id ? normalized.name : existing.name;
      const avatar = normalized.avatar ?? existing.avatar ?? null;
      map.set(key, {
        id: normalized.id,
        name: name || normalized.id,
        avatar,
      });
    }
  }
  return Array.from(map.values());
}

function computeDefaultTitle(
  participants: ChatParticipant[],
  selfIds: Set<string>,
  type: ChatSessionType,
): string {
  const others = participants.filter((participant) => !selfIds.has(participant.id));
  if (type === "direct") {
    const primary = others[0] ?? participants[0] ?? null;
    return primary?.name ?? "Chat";
  }
  if (others.length === 0) return "Group chat";
  const [first, second] = others;
  if (others.length === 1) return `${first?.name ?? "Member"} & you`;
  if (others.length === 2) return `${first?.name ?? "Member"} & ${second?.name ?? "Member"}`;
  return `${first?.name ?? "Member"}, ${second?.name ?? "Member"} +${others.length - 2}`;
}

export function sanitizeMessageBody(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

function isValidStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") return false;
  const session = value as StoredSession;
  const typeCheck = session.type === "direct" || session.type === "group";
  return (
    typeof session.id === "string" &&
    typeCheck &&
    typeof session.title === "string" &&
    Array.isArray(session.participants) &&
    Array.isArray(session.messages)
  );
}

function isLegacyStoredSession(value: unknown): value is LegacyStoredSession {
  if (!value || typeof value !== "object") return false;
  const session = value as LegacyStoredSession;
  return (
    typeof session.id === "string" &&
    typeof session.friendUserId === "string" &&
    typeof session.friendName === "string" &&
    Array.isArray(session.messages)
  );
}

const createMessageId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

export class ChatStore {
  private sessions: Map<string, ChatSessionInternal> = new Map();
  private activeSessionId: string | null = null;
  private listeners = new Set<(snapshot: ChatStoreSnapshot) => void>();
  private storage: StorageAdapter | null;
  private storageKey: string;
  private messageLimit: number;
  private hydrated = false;
  private snapshot: ChatStoreSnapshot = {
    sessions: [],
    activeSessionId: null,
    activeSession: null,
    unreadCount: 0,
  };
  private now: () => number;
  private currentUserId: string | null = null;
  private selfClientId: string | null = null;

  constructor(config?: ChatStoreConfig) {
    this.storage = config?.storage ?? null;
    this.storageKey = config?.storageKey ?? DEFAULT_STORAGE_KEY;
    this.messageLimit = config?.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
    this.now = config?.now ?? Date.now;
  }

  setStorage(storage: StorageAdapter | null) {
    this.storage = storage;
  }

  setCurrentUserId(userId: string | null) {
    if (this.currentUserId === userId) return;
    this.currentUserId = userId ?? null;
    this.refreshSessionTitles();
  }

  setSelfClientId(clientId: string | null) {
    if (this.selfClientId === clientId) return;
    this.selfClientId = clientId ?? null;
    this.refreshSessionTitles();
  }

  getCurrentUserId(): string | null {
    return this.currentUserId;
  }

  getSelfClientId(): string | null {
    return this.selfClientId;
  }

  getSnapshot(): ChatStoreSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: ChatStoreSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  hydrateFromStorage(): void {
    if (!this.storage) {
      this.hydrated = true;
      this.emit();
      return;
    }
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (!raw) {
        this.hydrated = true;
        this.emit();
        return;
      }
      const parsed = JSON.parse(raw) as StoredState;
      if (!parsed || !Array.isArray(parsed.sessions)) {
        this.hydrated = true;
        this.emit();
        return;
      }
      this.sessions.clear();
      parsed.sessions.forEach((stored) => {
        let descriptor: ChatSessionDescriptor | null = null;
        if (isValidStoredSession(stored)) {
          const participants = stored.participants
            .map((participant) => normalizeParticipant(participant))
            .filter((participant): participant is ChatParticipant => Boolean(participant));
          descriptor = {
            id: stored.id,
            type: stored.type,
            title: stored.title,
            avatar: stored.avatar ?? null,
            createdBy: stored.createdBy ?? null,
            participants,
          };
        } else if (isLegacyStoredSession(stored)) {
          const participant = normalizeParticipant({
            id: stored.friendUserId,
            name: stored.friendName,
            avatar: stored.friendAvatar ?? null,
          });
          if (participant) {
            descriptor = {
              id: stored.id,
              type: "direct",
              title: stored.friendName,
              avatar: stored.friendAvatar ?? null,
              createdBy: null,
              participants: [participant],
            };
          }
        }
        if (!descriptor) return;
        const { session } = this.ensureSessionInternal(descriptor);
        session.messages = [];
        session.messageIndex = new Map();
        session.lastMessageTimestamp = 0;
        session.unreadCount = 0;
        stored.messages.slice(-this.messageLimit).forEach((storedMessage) => {
          if (
            storedMessage &&
            typeof storedMessage.id === "string" &&
            typeof storedMessage.authorId === "string" &&
            typeof storedMessage.body === "string" &&
            typeof storedMessage.sentAt === "string"
          ) {
            const restored: ChatMessage = {
              id: storedMessage.id,
              authorId: storedMessage.authorId,
              body: storedMessage.body,
              sentAt: storedMessage.sentAt,
              status: "sent",
            };
            session.messages.push(restored);
            session.messageIndex.set(restored.id, session.messages.length - 1);
            const ts = Date.parse(restored.sentAt);
            if (Number.isFinite(ts)) {
              session.lastMessageTimestamp = ts;
            }
          }
        });
      });
      if (typeof parsed.activeSessionId === "string") {
        this.activeSessionId = parsed.activeSessionId;
      }
    } catch (error) {
      console.error("ChatStore hydrate error", error);
    } finally {
      this.hydrated = true;
      this.emit();
    }
  }

  toStoredState(): StoredState {
    const snapshot = this.snapshot;
    return {
      activeSessionId: this.activeSessionId,
      sessions: snapshot.sessions.map((session) => ({
        id: session.id,
        type: session.type,
        title: session.title,
        avatar: session.avatar,
        createdBy: session.createdBy ?? null,
        participants: session.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          avatar: participant.avatar,
        })),
        messages: session.messages.slice(-this.messageLimit).map((message) => ({
          id: message.id,
          authorId: message.authorId,
          body: message.body,
          sentAt: message.sentAt,
        })),
      })),
    };
  }

  setActiveSession(sessionId: string | null) {
    this.activeSessionId = sessionId;
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.unreadCount = 0;
      }
    }
    this.emit();
  }

  deleteSession(sessionId: string) {
    if (!this.sessions.delete(sessionId)) return;
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    this.emit();
  }

  ensureSession(descriptor: ChatSessionDescriptor): ChatSessionInternal {
    const { session, changed } = this.ensureSessionInternal(descriptor);
    if (changed) {
      this.emit();
    }
    return session;
  }

  upsertParticipants(sessionId: string, participants: ChatParticipant[]) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const merged = mergeParticipants(session.participants, participants);
    const changed = merged.length !== session.participants.length ||
      merged.some((participant, index) => {
        const existing = session.participants[index];
        if (!existing) return true;
        return (
          existing.id !== participant.id ||
          existing.name !== participant.name ||
          existing.avatar !== participant.avatar
        );
      });
    if (!changed) return;
    session.participants = merged;
    this.emit();
  }

  addMessage(sessionId: string, message: ChatMessage, options: { isLocal: boolean }) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    let changed = false;
    const existingIndex = session.messageIndex.get(message.id);
    if (typeof existingIndex === "number") {
      const existing = session.messages[existingIndex];
      session.messages[existingIndex] = { ...existing, ...message };
      changed = true;
    } else {
      session.messages.push(message);
      session.messageIndex.set(message.id, session.messages.length - 1);
      if (!options.isLocal && this.activeSessionId !== session.id) {
        session.unreadCount += 1;
      }
      if (session.messages.length > this.messageLimit) {
        const excess = session.messages.length - this.messageLimit;
        const removed = session.messages.splice(0, excess);
        removed.forEach((removedMessage) => {
          session.messageIndex.delete(removedMessage.id);
        });
        session.messages.forEach((msg, index) => {
          session.messageIndex.set(msg.id, index);
        });
      }
      changed = true;
    }
    const timestamp = Date.parse(message.sentAt);
    session.lastMessageTimestamp = Number.isFinite(timestamp) ? timestamp : this.now();
    if (options.isLocal && this.activeSessionId === session.id) {
      session.unreadCount = 0;
    }
    if (changed) {
      this.emit();
    }
  }

  markMessageStatus(sessionId: string, messageId: string, status: ChatMessage["status"]) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const index = session.messageIndex.get(messageId);
    if (typeof index !== "number") return;
    const existing = session.messages[index];
    if (!existing || existing.status === status) return;
    session.messages[index] = { ...existing, status };
    this.emit();
  }

  applySessionEvent(descriptor: ChatSessionDescriptor) {
    const effective = {
      ...descriptor,
      participants: descriptor.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        avatar: participant.avatar ?? null,
      })),
    };
    const hasSelf = effective.participants.some((participant) => this.isSelfId(participant.id));
    if (!hasSelf) return;
    this.ensureSession(effective);
  }

  applyMessageEvent(payload: ChatMessageEventPayload) {
    if (!payload || payload.type !== "chat.message") return;
    const { conversationId } = payload;
    if (!conversationId) return;
    const participants = Array.isArray(payload.participants) ? payload.participants : [];
    const normalizedParticipants = participants
      .map((participant) => normalizeParticipant(participant))
      .filter((participant): participant is ChatParticipant => Boolean(participant));
    const hasSelf =
      normalizedParticipants.some((participant) => this.isSelfId(participant.id)) ||
      this.isSelfId(payload.senderId);
    if (!hasSelf) return;
    const descriptor: ChatSessionDescriptor = {
      id: conversationId,
      type:
        payload.session?.type ??
        (normalizedParticipants.length > 2 ||
        (payload.session?.type === "group" && normalizedParticipants.length > 0)
          ? "group"
          : "direct"),
      title: payload.session?.title ?? "",
      avatar: payload.session?.avatar ?? null,
      createdBy: payload.session?.createdBy ?? (payload.session?.type === "group" ? payload.senderId : null),
      participants: normalizedParticipants,
    };
    const session = this.ensureSessionInternal(descriptor).session;
    if (!payload.message || typeof payload.message.id !== "string" || typeof payload.message.body !== "string") {
      return;
    }
    const messageBody = sanitizeMessageBody(payload.message.body);
    if (!messageBody) return;
    const authorId = payload.senderId || payload.message.id;
    const chatMessage: ChatMessage = {
      id: payload.message.id,
      authorId,
      body: messageBody,
      sentAt: payload.message.sentAt ?? new Date().toISOString(),
      status: "sent",
    };
    const isLocal = this.isSelfId(authorId);
    this.addMessage(session.id, chatMessage, { isLocal });
  }

  resetUnread(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.unreadCount === 0) return;
    session.unreadCount = 0;
    this.emit();
  }

  updateFromFriends(friends: FriendItem[]) {
    if (!Array.isArray(friends) || !friends.length) return;
    const friendMap = new Map<string, FriendItem>();
    friends.forEach((friend) => {
      if (friend.userId) {
        friendMap.set(friend.userId, friend);
      }
    });
    const selfIds = this.getSelfIds();
    let changed = false;
    this.sessions.forEach((session) => {
      let participantsChanged = false;
      const updatedParticipants = session.participants.map((participant) => {
        const friend = friendMap.get(participant.id);
        if (!friend) return participant;
        const nextName = friend.name || participant.name;
        const nextAvatar = friend.avatar ?? participant.avatar ?? null;
        if (nextName !== participant.name || nextAvatar !== participant.avatar) {
          participantsChanged = true;
          return {
            ...participant,
            name: nextName,
            avatar: nextAvatar,
          };
        }
        return participant;
      });
      if (participantsChanged) {
        session.participants = updatedParticipants;
        changed = true;
      }
      if (session.type === "direct") {
        const nextTitle = computeDefaultTitle(session.participants, selfIds, "direct");
        if (session.title !== nextTitle) {
          session.title = nextTitle;
          changed = true;
        }
      }
    });
    if (changed) {
      this.emit();
    }
  }

  prepareLocalMessage(
    conversationId: string,
    body: string,
    options?: { selfParticipant?: ChatParticipant | null },
  ): {
    message: ChatMessage;
    session: {
      id: string;
      type: ChatSessionType;
      title: string;
      avatar: string | null;
      createdBy: string | null;
      participants: ChatParticipant[];
    };
  } | null {
    const session = this.sessions.get(conversationId);
    if (!session) return null;
    const trimmed = sanitizeMessageBody(body);
    if (!trimmed) return null;
    const selfIdentity = this.selfClientId ?? this.currentUserId;
    if (!selfIdentity) {
      throw new Error("Chat identity is not ready yet.");
    }
    const preferredSelf = options?.selfParticipant ?? null;
    if (!session.participants.some((participant) => participant.id === selfIdentity)) {
      const fallbackName = preferredSelf?.name ?? this.currentUserId ?? selfIdentity;
      session.participants = mergeParticipants(session.participants, [
        {
          id: selfIdentity,
          name: fallbackName,
          avatar: preferredSelf?.avatar ?? null,
        },
      ]);
    } else if (preferredSelf) {
      session.participants = mergeParticipants(session.participants, [preferredSelf]);
    }
    const messageId = createMessageId();
    const sentAt = new Date().toISOString();
    const localMessage: ChatMessage = {
      id: messageId,
      authorId: this.currentUserId ?? selfIdentity,
      body: trimmed,
      sentAt,
      status: "pending",
    };
    this.addMessage(session.id, localMessage, { isLocal: true });
    return {
      message: localMessage,
      session: {
        id: session.id,
        type: session.type,
        title: session.title,
        avatar: session.avatar,
        createdBy: session.createdBy,
        participants: session.participants.map((participant) => ({ ...participant })),
      },
    };
  }

  startSession(descriptor: ChatSessionDescriptor, options?: { activate?: boolean }): { created: boolean } {
    const { session, created, changed } = this.ensureSessionInternal(descriptor);
    if (options?.activate) {
      this.activeSessionId = session.id;
      session.unreadCount = 0;
    }
    if (created || changed || options?.activate) {
      this.emit();
    }
    return { created };
  }

  private getSelfIds(): Set<string> {
    const selfIds = new Set<string>();
    if (this.currentUserId) selfIds.add(this.currentUserId);
    if (this.selfClientId) selfIds.add(this.selfClientId);
    return selfIds;
  }

  private isSelfId(id: string | null | undefined): boolean {
    if (!id) return false;
    const normalized = id.trim();
    if (!normalized) return false;
    return normalized === this.currentUserId || normalized === this.selfClientId;
  }

  private sanitizeDescriptor(descriptor: ChatSessionDescriptor): ChatSessionDescriptor {
    const participants = mergeParticipants(descriptor.participants);
    const primarySelfId = this.currentUserId?.trim() || null;
    const secondarySelfId = this.selfClientId?.trim() || null;
    let ensuredParticipants = participants;
    if (primarySelfId) {
      ensuredParticipants = mergeParticipants(ensuredParticipants, [
        {
          id: primarySelfId,
          name: primarySelfId,
          avatar: null,
        },
      ]);
    } else if (!primarySelfId && secondarySelfId) {
      ensuredParticipants = mergeParticipants(ensuredParticipants, [
        {
          id: secondarySelfId,
          name: secondarySelfId,
          avatar: null,
        },
      ]);
    }
    const selfIds = this.getSelfIds();
    const type: ChatSessionType =
      descriptor.type === "group" || ensuredParticipants.length > 2 ? "group" : "direct";
    const titleCandidate = typeof descriptor.title === "string" ? descriptor.title.trim() : "";
    const title =
      titleCandidate || computeDefaultTitle(ensuredParticipants, selfIds, type);
    return {
      id: descriptor.id,
      type,
      title,
      avatar: descriptor.avatar ?? null,
      createdBy: descriptor.createdBy ?? null,
      participants: ensuredParticipants,
    };
  }

  private ensureSessionInternal(
    descriptor: ChatSessionDescriptor,
  ): { session: ChatSessionInternal; created: boolean; changed: boolean } {
    const sanitized = this.sanitizeDescriptor(descriptor);
    const map = this.sessions;
    let session = map.get(sanitized.id);
    let created = false;
    let changed = false;
    if (!session) {
      session = {
        id: sanitized.id,
        type: sanitized.type,
        title: sanitized.title,
        avatar: sanitized.avatar,
        createdBy: sanitized.createdBy,
        participants: sanitized.participants,
        messages: [],
        messageIndex: new Map(),
        lastMessageTimestamp: 0,
        unreadCount: 0,
      };
      map.set(session.id, session);
      created = true;
      changed = true;
    } else {
      const current = session as ChatSessionInternal;
      if (
        current.type !== sanitized.type ||
        current.title !== sanitized.title ||
        current.avatar !== sanitized.avatar ||
        current.createdBy !== sanitized.createdBy
      ) {
        current.type = sanitized.type;
        current.title = sanitized.title;
        current.avatar = sanitized.avatar;
        current.createdBy = sanitized.createdBy;
        changed = true;
      }
      const mergedParticipants = mergeParticipants(current.participants, sanitized.participants);
      if (
        mergedParticipants.length !== current.participants.length ||
        mergedParticipants.some((participant, index) => {
          const existing = current.participants[index];
          if (!existing) return true;
          return (
            existing.id !== participant.id ||
            existing.name !== participant.name ||
            existing.avatar !== participant.avatar
          );
        })
      ) {
        current.participants = mergedParticipants;
        changed = true;
      }
    }
    return { session: session!, created, changed };
  }

  private refreshSessionTitles() {
    let changed = false;
    const selfIds = this.getSelfIds();
    this.sessions.forEach((session) => {
      if (session.type === "direct") {
        const nextTitle = computeDefaultTitle(session.participants, selfIds, "direct");
        if (session.title !== nextTitle) {
          session.title = nextTitle;
          changed = true;
        }
      }
    });
    if (changed) {
      this.emit();
    }
  }

  private persist() {
    if (!this.hydrated || !this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.toStoredState()));
    } catch (error) {
      console.error("ChatStore persist error", error);
    }
  }

  private buildSnapshot(): ChatStoreSnapshot {
    const entries: Array<{ session: ChatSession; order: number }> = [];
    this.sessions.forEach((session) => {
      const messages = session.messages.map((message) => ({ ...message }));
      const lastMessage = messages[messages.length - 1] ?? null;
      entries.push({
        order: session.lastMessageTimestamp || (lastMessage ? Date.parse(lastMessage.sentAt) : 0) || 0,
        session: {
          id: session.id,
          type: session.type,
          title: session.title,
          avatar: session.avatar,
          createdBy: session.createdBy,
          participants: session.participants.map((participant) => ({ ...participant })),
          messages,
          unreadCount: session.unreadCount,
          lastMessageAt: lastMessage?.sentAt ?? null,
          lastMessagePreview: lastMessage?.body ?? null,
        },
      });
    });
    entries.sort((a, b) => b.order - a.order);
    const sessions = entries.map((entry) => entry.session);
    const activeSession = this.activeSessionId
      ? sessions.find((session) => session.id === this.activeSessionId) ?? null
      : null;
    const unreadCount = sessions.reduce((total, session) => total + session.unreadCount, 0);
    return {
      sessions,
      activeSessionId: this.activeSessionId,
      activeSession,
      unreadCount,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.persist();
    this.listeners.forEach((listener) => {
      listener(this.snapshot);
    });
  }
}

export const chatStoreTestUtils = {
  standardizeUserId,
  resolveParticipantId,
  canonicalParticipantKey,
  normalizeParticipant,
  mergeParticipants,
  sanitizeMessageBody,
};
