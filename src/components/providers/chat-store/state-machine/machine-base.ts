import { isGroupConversationId } from "@/lib/chat/channels";
import type { ChatParticipant, ChatSessionDescriptor } from "@/lib/chat/events";

import type { FriendItem } from "@/hooks/useFriendsData";
import {
  canonicalParticipantKey,
  mergeParticipants,
  normalizeParticipant,
  participantsEqual,
  sanitizeSessionDescriptor,
} from "../helpers";
import type { ChatMessage } from "../types";
import type { ChatState, FriendDirectory, SelfParticipantOptions } from "./types";

const PARTICIPANT_ID_PATTERN = /^[0-9a-f-]{24,}$/i;

function looksLikeParticipantIdentifier(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (PARTICIPANT_ID_PATTERN.test(trimmed)) {
    return true;
  }
  return (
    trimmed.startsWith("user_") ||
    trimmed.startsWith("clerk_") ||
    trimmed.startsWith("capsule:") ||
    trimmed.startsWith("urn:")
  );
}

export const DEFAULT_MESSAGE_LIMIT = 100;

export class ChatStateMachineBase {
  protected state: ChatState;
  protected readonly messageLimit: number;
  protected readonly now: () => number;
  protected readonly createMessageId: () => string;
  protected friendDirectory: FriendDirectory = new Map();

  constructor(options?: {
    now?: () => number;
    messageLimit?: number;
    createMessageId?: () => string;
  }) {
    this.messageLimit = options?.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
    this.now = options?.now ?? Date.now;
    this.createMessageId = options?.createMessageId ?? this.defaultMessageIdFactory;
    this.state = {
      sessions: {},
      activeSessionId: null,
      hydrated: false,
      self: {
        currentUserId: null,
        selfClientId: null,
        aliases: [],
      },
    };
  }

  getState(): ChatState {
    return this.state;
  }

  replaceState(next: ChatState) {
    this.state = {
      ...next,
      sessions: { ...next.sessions },
      self: {
        currentUserId: next.self.currentUserId,
        selfClientId: next.self.selfClientId,
        aliases: [...next.self.aliases],
      },
    };
  }

  setHydrated(): void {
    this.state = { ...this.state, hydrated: true };
  }

  isHydrated(): boolean {
    return this.state.hydrated;
  }

  setCurrentUserId(userId: string | null): boolean {
    const normalized = typeof userId === "string" ? userId.trim() : "";
    const nextId = normalized.length > 0 ? normalized : null;
    if (this.state.self.currentUserId === nextId) return false;
    this.state = {
      ...this.state,
      self: {
        ...this.state.self,
        currentUserId: nextId,
        aliases: this.registerAliasList(this.state.self.aliases, nextId),
      },
    };
    return true;
  }

  setSelfClientId(clientId: string | null): boolean {
    const normalized = typeof clientId === "string" ? clientId.trim() : "";
    const nextId = normalized.length > 0 ? normalized : null;
    if (this.state.self.selfClientId === nextId) return false;
    this.state = {
      ...this.state,
      self: {
        ...this.state.self,
        selfClientId: nextId,
        aliases: this.registerAliasList(this.state.self.aliases, nextId),
      },
    };
    return true;
  }

  applySelfParticipant(options: SelfParticipantOptions): boolean {
    const normalizedSelf = normalizeParticipant(options.participant);
    if (!normalizedSelf) return false;
    const aliasSet = new Set<string>();
    const addAlias = (value: string | null | undefined) => {
      if (!value || typeof value !== "string") return;
      const trimmed = value.trim();
      if (!trimmed) return;
      aliasSet.add(trimmed);
      const canonical = canonicalParticipantKey(trimmed);
      if (canonical) aliasSet.add(canonical);
    };
    addAlias(normalizedSelf.id);
    options.aliases.forEach((alias) => addAlias(alias));

    const nextAliases = Array.from(
      new Set(this.registerAliasSet(this.state.self.aliases, Array.from(aliasSet))),
    );

    const sessions = { ...this.state.sessions };
    let mutated = false;
    Object.values(sessions).forEach((session) => {
      const participants = session.participants.map((existing) => {
        const existingKey = canonicalParticipantKey(existing.id);
        if (aliasSet.has(existing.id) || (existingKey && aliasSet.has(existingKey))) {
          return { ...normalizedSelf };
        }
        return existing;
      });
      if (!participants.some((entry) => entry.id === normalizedSelf.id)) {
        participants.push({ ...normalizedSelf });
      }
      const merged = mergeParticipants(participants);
      if (!participantsEqual(session.participants, merged)) {
        session.participants = merged;
        mutated = true;
      }

      let messageChanged = false;
      session.messages.forEach((message, index) => {
        const author = typeof message.authorId === "string" ? message.authorId.trim() : "";
        if (!author) return;
        const canonicalAuthor = canonicalParticipantKey(author);
        if (aliasSet.has(author) || (canonicalAuthor && aliasSet.has(canonicalAuthor))) {
          if (message.authorId !== normalizedSelf.id) {
            session.messages[index] = { ...message, authorId: normalizedSelf.id };
            messageChanged = true;
          }
        }
      });
      if (messageChanged) {
        session.messageIndex = this.buildMessageIndex(session.messages);
        mutated = true;
      }
      if (session.createdBy) {
        const creator = session.createdBy.trim();
        const canonicalCreator = canonicalParticipantKey(creator);
        if (
          (creator && aliasSet.has(creator) && session.createdBy !== normalizedSelf.id) ||
          (canonicalCreator && aliasSet.has(canonicalCreator) && session.createdBy !== normalizedSelf.id)
        ) {
          session.createdBy = normalizedSelf.id;
          mutated = true;
        }
      }
    });

    if (!mutated && nextAliases.length === this.state.self.aliases.length) {
      return false;
    }

    this.state = {
      ...this.state,
      sessions,
      self: {
        ...this.state.self,
        aliases: nextAliases,
      },
    };

    return true;
  }

  getCurrentUserId(): string | null {
    return this.state.self.currentUserId;
  }

  getSelfClientId(): string | null {
    return this.state.self.selfClientId;
  }

  getSelfIds(): Set<string> {
    const set = new Set<string>(this.state.self.aliases);
    if (this.state.self.currentUserId) set.add(this.state.self.currentUserId);
    if (this.state.self.selfClientId) set.add(this.state.self.selfClientId);
    return set;
  }

  protected registerFriendLookup(
    directory: FriendDirectory,
    value: string | null | undefined,
    friend: FriendItem,
  ): void {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    directory.set(trimmed.toLowerCase(), friend);
    const canonical = canonicalParticipantKey(trimmed);
    if (canonical) {
      directory.set(canonical.toLowerCase(), friend);
    }
  }

  protected findFriendProfile(identifier: string | null | undefined): FriendItem | null {
    if (typeof identifier !== "string") return null;
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    const direct = this.friendDirectory.get(trimmed.toLowerCase());
    if (direct) return direct;
    const canonical = canonicalParticipantKey(trimmed);
    if (canonical) {
      return this.friendDirectory.get(canonical.toLowerCase()) ?? null;
    }
    return null;
  }

  protected enrichParticipant(participant: ChatParticipant): ChatParticipant {
    const friend = this.findFriendProfile(participant.id);
    if (!friend) {
      if (!participant.name || looksLikeParticipantIdentifier(participant.name)) {
        return { ...participant, name: participant.name || participant.id };
      }
      return participant;
    }
    const nextId = friend.userId?.trim() || participant.id;
    const friendName = friend.name?.trim();
    const fallbackName =
      participant.name && !looksLikeParticipantIdentifier(participant.name)
        ? participant.name
        : nextId;
    const nextName = friendName && friendName.length > 0 ? friendName : fallbackName;
    const nextAvatar = friend.avatar ?? participant.avatar ?? null;
    if (
      nextId === participant.id &&
      nextName === participant.name &&
      nextAvatar === participant.avatar
    ) {
      return participant;
    }
    return {
      ...participant,
      id: nextId,
      name: nextName,
      avatar: nextAvatar,
    };
  }

  protected registerAliasList(list: string[], value: string | null): string[] {
    if (!value) return list;
    const trimmed = value.trim();
    if (!trimmed) return list;
    const aliases = new Set(list);
    aliases.add(trimmed);
    const canonical = canonicalParticipantKey(trimmed);
    if (canonical) {
      aliases.add(canonical);
    }
    return Array.from(aliases);
  }

  protected registerAliasSet(list: string[], entries: string[]): string[] {
    const aliases = new Set(list);
    entries.forEach((value) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      aliases.add(trimmed);
      const canonical = canonicalParticipantKey(trimmed);
      if (canonical) aliases.add(canonical);
    });
    return Array.from(aliases);
  }

  protected isSelfId(id: string | null | undefined): boolean {
    if (!id) return false;
    const normalized = id.trim();
    if (!normalized) return false;
    if (normalized === this.state.self.currentUserId || normalized === this.state.self.selfClientId) {
      return true;
    }
    if (this.state.self.aliases.includes(normalized)) return true;
    const canonical = canonicalParticipantKey(normalized);
    return canonical ? this.state.self.aliases.includes(canonical) : false;
  }

  protected sanitizeDescriptor(descriptor: ChatSessionDescriptor): ChatSessionDescriptor {
    const primarySelfId = this.state.self.currentUserId?.trim() || null;
    const secondarySelfId = this.state.self.selfClientId?.trim() || null;
    const selfIds = this.getSelfIds();
    return sanitizeSessionDescriptor(descriptor, {
      selfIds,
      primarySelfId,
      secondarySelfId,
      isGroupConversation: (id) => isGroupConversationId(id),
    });
  }

  protected buildMessageIndex(messages: ChatMessage[]): Record<string, number> {
    const index: Record<string, number> = {};
    messages.forEach((message, idx) => {
      index[message.id] = idx;
    });
    return index;
  }

  protected defaultMessageIdFactory(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
