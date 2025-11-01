import type { ChatParticipant, ChatSessionType, ChatSessionDescriptor } from "@/lib/chat/events";

import type {
  ChatMessageAttachment,
  ChatMessageReaction,
  MessageAttachmentInput,
  StoredMessageAttachment,
  StoredSession,
  LegacyStoredSession,
} from "@/components/providers/chat-store/types";

const USER_ID_PATTERN = /user[:_-][0-9a-z-]+/i;
const MAX_EMOJI_LENGTH = 32;

export function standardizeUserId(value: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const directMatch = /^user[_-][0-9a-z-]+$/i.exec(trimmed);
  if (directMatch) {
    return `user_${directMatch[0]!
      .slice("user".length + 1)
      .replace(/[^0-9a-z-]/gi, "")
      .toLowerCase()}`;
  }
  const embeddedMatch = USER_ID_PATTERN.exec(trimmed);
  if (!embeddedMatch) return null;
  const raw = embeddedMatch[0] ?? "";
  const separatorIndex = raw.search(/[:_-]/);
  if (separatorIndex === -1) return raw.toLowerCase();
  const suffix = raw.slice(separatorIndex + 1).replace(/[^0-9a-z-]/gi, "");
  if (!suffix) return null;
  return `user_${suffix.toLowerCase()}`;
}

export function resolveParticipantId(data: Record<string, unknown>): string {
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

export function canonicalParticipantKey(id: string): string {
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

export function typingKey(id: string | null | undefined): string | null {
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  const canonical = canonicalParticipantKey(trimmed);
  return canonical || trimmed;
}

export function normalizeParticipant(
  entry: Partial<ChatParticipant> | ChatParticipant | null | undefined,
): ChatParticipant | null {
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

export type ReactionDescriptorInput = {
  emoji: string;
  users?: Array<Partial<ChatParticipant> | ChatParticipant | null | undefined>;
};

export function normalizeReactions(
  descriptors: ReactionDescriptorInput[] | undefined,
  isSelf: (id: string | null | undefined) => boolean,
): ChatMessageReaction[] {
  if (!Array.isArray(descriptors) || descriptors.length === 0) {
    return [];
  }
  const emojiMap = new Map<string, Map<string, ChatParticipant>>();
  descriptors.forEach((descriptor) => {
    if (!descriptor) return;
    const emoji = typeof descriptor.emoji === "string" ? descriptor.emoji.trim() : "";
    if (!emoji) return;
    const users = Array.isArray(descriptor.users) ? descriptor.users : [];
    let userMap = emojiMap.get(emoji);
    if (!userMap) {
      userMap = new Map<string, ChatParticipant>();
      emojiMap.set(emoji, userMap);
    }
    users.forEach((user) => {
      const normalized = normalizeParticipant(user);
      if (!normalized) return;
      userMap!.set(normalized.id, normalized);
    });
  });
  const reactions: ChatMessageReaction[] = [];
  emojiMap.forEach((userMap, emoji) => {
    const users = Array.from(userMap.values()).sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nameCompare !== 0) return nameCompare;
      return a.id.localeCompare(b.id);
    });
    reactions.push({
      emoji,
      count: users.length,
      users,
      selfReacted: users.some((user) => isSelf(user.id)),
    });
  });
  reactions.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.emoji.localeCompare(b.emoji);
  });
  return reactions;
}

export function reactionsEqual(a: ChatMessageReaction[], b: ChatMessageReaction[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left.emoji !== right.emoji) return false;
    if (left.count !== right.count) return false;
    if (left.selfReacted !== right.selfReacted) return false;
    if (left.users.length !== right.users.length) return false;
    for (let userIndex = 0; userIndex < left.users.length; userIndex += 1) {
      if (left.users[userIndex]!.id !== right.users[userIndex]!.id) {
        return false;
      }
    }
  }
  return true;
}

export function participantsEqual(a: ChatParticipant[], b: ChatParticipant[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) return false;
    if (left.id !== right.id || left.name !== right.name || left.avatar !== right.avatar) {
      return false;
    }
  }
  return true;
}

export function computeDefaultTitle(
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

function sanitizeStoredAttachment(value: unknown): StoredMessageAttachment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<StoredMessageAttachment>;
  const id = typeof record.id === "string" && record.id.trim().length ? record.id.trim() : null;
  const name = typeof record.name === "string" && record.name.trim().length ? record.name.trim() : null;
  const mimeType =
    typeof record.mimeType === "string" && record.mimeType.trim().length ? record.mimeType.trim() : null;
  const url = typeof record.url === "string" && record.url.trim().length ? record.url.trim() : null;
  if (!id || !name || !mimeType || !url) return null;
  const size =
    typeof record.size === "number" && Number.isFinite(record.size) && record.size >= 0
      ? Math.floor(record.size)
      : 0;
  const thumbnailUrl =
    typeof record.thumbnailUrl === "string" && record.thumbnailUrl.trim().length
      ? record.thumbnailUrl.trim()
      : null;
  const storageKey =
    typeof record.storageKey === "string" && record.storageKey.trim().length
      ? record.storageKey.trim()
      : null;
  const sessionId =
    typeof record.sessionId === "string" && record.sessionId.trim().length
      ? record.sessionId.trim()
      : null;
  return {
    id,
    name,
    mimeType,
    size,
    url,
    thumbnailUrl,
    storageKey,
    sessionId,
  };
}

export function sanitizeStoredAttachments(value: unknown): StoredMessageAttachment[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, StoredMessageAttachment>();
  value.forEach((entry) => {
    const attachment = sanitizeStoredAttachment(entry);
    if (attachment && !merged.has(attachment.id)) {
      merged.set(attachment.id, attachment);
    }
  });
  return Array.from(merged.values());
}

export function hydrateMessageAttachments(
  attachments: StoredMessageAttachment[] | undefined,
): ChatMessageAttachment[] {
  if (!attachments?.length) return [];
  return attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: Number.isFinite(attachment.size) && attachment.size >= 0 ? attachment.size : 0,
    url: attachment.url,
    thumbnailUrl: attachment.thumbnailUrl ?? null,
    storageKey: attachment.storageKey ?? null,
    sessionId: attachment.sessionId ?? null,
  }));
}

export function persistMessageAttachments(
  attachments: ChatMessageAttachment[] | undefined,
): StoredMessageAttachment[] | undefined {
  if (!attachments?.length) return undefined;
  const merged = new Map<string, ChatMessageAttachment>();
  attachments.forEach((attachment) => {
    if (attachment && attachment.id && !merged.has(attachment.id)) {
      merged.set(attachment.id, attachment);
    }
  });
  if (!merged.size) return undefined;
  return Array.from(merged.values()).map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: Number.isFinite(attachment.size) && attachment.size >= 0 ? Math.floor(attachment.size) : 0,
    url: attachment.url,
    thumbnailUrl: attachment.thumbnailUrl ?? null,
    storageKey: attachment.storageKey ?? null,
    sessionId: attachment.sessionId ?? null,
  }));
}

export function sanitizeIncomingAttachments(
  attachments: MessageAttachmentInput,
): ChatMessageAttachment[] {
  if (!attachments?.length) return [];
  const merged = new Map<string, ChatMessageAttachment>();
  attachments.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const id = typeof entry.id === "string" && entry.id.trim().length ? entry.id.trim() : null;
    const name =
      typeof entry.name === "string" && entry.name.trim().length ? entry.name.trim() : null;
    const mimeType =
      typeof entry.mimeType === "string" && entry.mimeType.trim().length
        ? entry.mimeType.trim()
        : null;
    const url = typeof entry.url === "string" && entry.url.trim().length ? entry.url.trim() : null;
    if (!id || !name || !mimeType || !url) return;
    const size =
      typeof entry.size === "number" && Number.isFinite(entry.size) && entry.size >= 0
        ? Math.floor(entry.size)
        : 0;
    const thumbnailUrl =
      typeof entry.thumbnailUrl === "string" && entry.thumbnailUrl.trim().length
        ? entry.thumbnailUrl.trim()
        : null;
    const storageKey =
      typeof entry.storageKey === "string" && entry.storageKey.trim().length
        ? entry.storageKey.trim()
        : null;
    const sessionId =
      typeof entry.sessionId === "string" && entry.sessionId.trim().length
        ? entry.sessionId.trim()
        : null;
    if (merged.has(id)) return;
    merged.set(id, {
      id,
      name,
      mimeType,
      size,
      url,
      thumbnailUrl,
      storageKey,
      sessionId,
    });
  });
  return Array.from(merged.values());
}

export function normalizeLocalAttachments(
  attachments: ChatMessageAttachment[] | undefined,
): ChatMessageAttachment[] {
  if (!attachments?.length) return [];
  const merged = new Map<string, ChatMessageAttachment>();
  attachments.forEach((attachment) => {
    if (!attachment || typeof attachment.id !== "string") return;
    const id = attachment.id.trim();
    if (!id || merged.has(id)) return;
    merged.set(id, {
      id,
      name: attachment.name?.trim() || id,
      mimeType: attachment.mimeType?.trim() || "application/octet-stream",
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size) && attachment.size >= 0
          ? Math.floor(attachment.size)
          : 0,
      url: attachment.url?.trim() || "",
      thumbnailUrl: attachment.thumbnailUrl ?? null,
      storageKey: attachment.storageKey ?? null,
      sessionId: attachment.sessionId ?? null,
    });
  });
  return Array.from(merged.values()).filter((attachment) => attachment.url.length > 0);
}

export function isValidStoredSession(value: unknown): value is StoredSession {
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

export function isLegacyStoredSession(value: unknown): value is LegacyStoredSession {
  if (!value || typeof value !== "object") return false;
  const session = value as LegacyStoredSession;
  return (
    typeof session.id === "string" &&
    typeof session.friendUserId === "string" &&
    typeof session.friendName === "string" &&
    Array.isArray(session.messages)
  );
}

export function sanitizeSessionDescriptor(
  descriptor: ChatSessionDescriptor,
  options: {
    selfIds: Set<string>;
    primarySelfId: string | null;
    secondarySelfId: string | null;
    isGroupConversation: (id: string) => boolean;
  },
): ChatSessionDescriptor {
  const participants = mergeParticipants(descriptor.participants);
  const ensuredParticipants = (() => {
    if (options.primarySelfId) {
      return mergeParticipants(participants, [
        { id: options.primarySelfId, name: options.primarySelfId, avatar: null },
      ]);
    }
    if (options.secondarySelfId) {
      return mergeParticipants(participants, [
        { id: options.secondarySelfId, name: options.secondarySelfId, avatar: null },
      ]);
    }
    return participants;
  })();
  const groupConversation = options.isGroupConversation(descriptor.id);
  let type: ChatSessionType;
  if (descriptor.type === "group" || groupConversation) {
    type = "group";
  } else if (descriptor.type === "direct" || !groupConversation) {
    type = "direct";
  } else {
    type = ensuredParticipants.length > 2 ? "group" : "direct";
  }
  let normalizedParticipants = ensuredParticipants;
  if (type === "direct" && normalizedParticipants.length > 2) {
    const selfKeys = new Set(Array.from(options.selfIds, (id) => canonicalParticipantKey(id)));
    const selfEntry = normalizedParticipants.find((participant) =>
      selfKeys.has(canonicalParticipantKey(participant.id)),
    );
    const others = normalizedParticipants.filter(
      (participant) => !selfKeys.has(canonicalParticipantKey(participant.id)),
    );
    const trimmed: ChatParticipant[] = [];
    if (selfEntry) trimmed.push(selfEntry);
    if (others.length) trimmed.push(others[0]!);
    normalizedParticipants = trimmed.length ? trimmed : normalizedParticipants.slice(0, 2);
  }
  const titleCandidate = typeof descriptor.title === "string" ? descriptor.title.trim() : "";
  const title = titleCandidate || computeDefaultTitle(normalizedParticipants, options.selfIds, type);
  return {
    id: descriptor.id,
    type,
    title,
    avatar: descriptor.avatar ?? null,
    createdBy: descriptor.createdBy ?? null,
    participants: normalizedParticipants,
  };
}
export function sanitizeReactionEmoji(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const limited = trimmed.length > MAX_EMOJI_LENGTH ? trimmed.slice(0, MAX_EMOJI_LENGTH) : trimmed;
  const hasEmoji = /\p{Extended_Pictographic}/u.test(limited);
  if (!hasEmoji) return "";
  return limited;
}




