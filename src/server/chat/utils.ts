import { createHash } from "node:crypto";

import type {
  ChatGroupMessageReactionRow,
  ChatGroupMessageRow,
  ChatMessageReactionRow,
  ChatMessageRow,
  ChatParticipantRow,
} from "./repository";
import {
  ChatMessageAttachmentRecord,
  ChatMessageReactionRecord,
  ChatMessageRecord,
  ChatParticipantSummary,
  ChatServiceError,
} from "./types";

export const MAX_BODY_LENGTH = 4000;
export const MAX_REACTION_EMOJI_LENGTH = 32;

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGE_ID_NAMESPACE = "capsules.chat.message:v1";

type RawChatMessagePayload = {
  text?: string;
  attachments?: unknown;
};

type RawChatMessageAttachment = {
  id?: unknown;
  name?: unknown;
  mimeType?: unknown;
  size?: unknown;
  url?: unknown;
  thumbnailUrl?: unknown;
  storageKey?: unknown;
  sessionId?: unknown;
};

export function sanitizeBody(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_BODY_LENGTH);
}

export function sanitizeAttachment(value: unknown): ChatMessageAttachmentRecord | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawChatMessageAttachment;
  const id = typeof raw.id === "string" && raw.id.trim().length ? raw.id.trim() : null;
  const name = typeof raw.name === "string" && raw.name.trim().length ? raw.name.trim() : null;
  const mimeType =
    typeof raw.mimeType === "string" && raw.mimeType.trim().length ? raw.mimeType.trim() : null;
  const url = typeof raw.url === "string" && raw.url.trim().length ? raw.url.trim() : null;
  if (!id || !name || !mimeType || !url) return null;
  const size =
    typeof raw.size === "number" && Number.isFinite(raw.size) && raw.size >= 0
      ? Math.floor(raw.size)
      : 0;
  const thumbnailUrl =
    typeof raw.thumbnailUrl === "string" && raw.thumbnailUrl.trim().length
      ? raw.thumbnailUrl.trim()
      : null;
  const storageKey =
    typeof raw.storageKey === "string" && raw.storageKey.trim().length
      ? raw.storageKey.trim()
      : null;
  const sessionId =
    typeof raw.sessionId === "string" && raw.sessionId.trim().length
      ? raw.sessionId.trim()
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

export function sanitizeAttachments(value: unknown): ChatMessageAttachmentRecord[] {
  if (!Array.isArray(value)) return [];
  const sanitized = value
    .map((entry) => sanitizeAttachment(entry))
    .filter((entry): entry is ChatMessageAttachmentRecord => Boolean(entry));
  if (!sanitized.length) return [];
  const unique = new Map<string, ChatMessageAttachmentRecord>();
  sanitized.forEach((attachment) => {
    if (!unique.has(attachment.id)) {
      unique.set(attachment.id, attachment);
    }
  });
  return Array.from(unique.values());
}

export function encodeMessagePayload(
  body: string,
  attachments: ChatMessageAttachmentRecord[],
): string {
  const text = sanitizeBody(body ?? "");
  if (!attachments.length) return text;
  try {
    return JSON.stringify({
      text,
      attachments,
    });
  } catch {
    return text;
  }
}

export function decodeMessagePayload(raw: string): {
  text: string;
  attachments: ChatMessageAttachmentRecord[];
} {
  if (!raw || typeof raw !== "string") {
    return { text: "", attachments: [] };
  }
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return { text: sanitizeBody(raw), attachments: [] };
  }
  try {
    const parsed = JSON.parse(trimmed) as RawChatMessagePayload;
    const text =
      typeof parsed?.text === "string" && parsed.text.trim().length
        ? sanitizeBody(parsed.text)
        : "";
    const attachments = sanitizeAttachments(parsed?.attachments);
    if (!attachments.length && !text) {
      return { text: sanitizeBody(raw), attachments: [] };
    }
    return { text, attachments };
  } catch {
    return { text: sanitizeBody(raw), attachments: [] };
  }
}

export function sanitizeReactionEmoji(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  const limited =
    trimmed.length > MAX_REACTION_EMOJI_LENGTH ? trimmed.slice(0, MAX_REACTION_EMOJI_LENGTH) : trimmed;
  const hasEmoji = /\p{Extended_Pictographic}/u.test(limited);
  if (!hasEmoji) return "";
  return limited;
}

export function normalizeId(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

export function resolveSentAt(row: ChatMessageRow | ChatGroupMessageRow): string {
  return row.client_sent_at ?? row.created_at;
}

export function toMessageRecord(
  row: ChatMessageRow | ChatGroupMessageRow,
  reactions: ChatMessageReactionRecord[] = [],
): ChatMessageRecord {
  const payload = decodeMessagePayload(row.body ?? "");
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: payload.text,
    sentAt: resolveSentAt(row),
    reactions,
    attachments: payload.attachments,
  };
}

export function toParticipantSummary(
  row: ChatParticipantRow | undefined,
  fallbackId: string,
): ChatParticipantSummary {
  if (!row) {
    return {
      id: fallbackId,
      name: fallbackId,
      avatar: null,
    };
  }
  const name =
    (typeof row.full_name === "string" && row.full_name.trim().length
      ? row.full_name.trim()
      : null) ??
    (typeof row.user_key === "string" && row.user_key.trim().length ? row.user_key.trim() : null) ??
    row.id;
  const avatar =
    typeof row.avatar_url === "string" && row.avatar_url.trim().length ? row.avatar_url.trim() : null;
  return {
    id: row.id,
    name,
    avatar,
  };
}

export function buildReactionSummaries(
  rows: Array<ChatMessageReactionRow | ChatGroupMessageReactionRow>,
  participantMap: Map<string, ChatParticipantRow>,
): Map<string, ChatMessageReactionRecord[]> {
  const reactionMap = new Map<string, Map<string, Map<string, ChatParticipantSummary>>>();

  rows.forEach((row) => {
    const emoji = sanitizeReactionEmoji(row.emoji ?? "");
    if (!emoji) return;
    const reactionMessageId = row.message_id;
    if (!reactionMessageId) return;

    const participantSummary = toParticipantSummary(participantMap.get(row.user_id), row.user_id);

    let messageEntry = reactionMap.get(reactionMessageId);
    if (!messageEntry) {
      messageEntry = new Map();
      reactionMap.set(reactionMessageId, messageEntry);
    }

    let emojiEntry = messageEntry.get(emoji);
    if (!emojiEntry) {
      emojiEntry = new Map();
      messageEntry.set(emoji, emojiEntry);
    }

    emojiEntry.set(participantSummary.id, participantSummary);
  });

  const summaries = new Map<string, ChatMessageReactionRecord[]>();
  reactionMap.forEach((emojiMap, messageId) => {
    const reactionSummaries: ChatMessageReactionRecord[] = [];
    emojiMap.forEach((participantEntries, emoji) => {
      const users = Array.from(participantEntries.values());
      users.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      reactionSummaries.push({
        emoji,
        count: users.length,
        users,
      });
    });
    reactionSummaries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.emoji.localeCompare(b.emoji);
    });
    summaries.set(messageId, reactionSummaries);
  });

  return summaries;
}

export function buildConversationTitle(
  participants: ChatParticipantSummary[],
  senderId: string,
): string {
  const others = participants.filter((participant) => participant.id !== senderId);
  const primary = others[0] ?? participants[0] ?? null;
  return primary?.name ?? "Chat";
}

export function buildGroupConversationTitle(
  participants: ChatParticipantSummary[],
  explicitTitle?: string | null,
): string {
  const trimmed = typeof explicitTitle === "string" ? explicitTitle.trim() : "";
  if (trimmed) return trimmed;
  if (!participants.length) return "Group chat";
  if (participants.length === 1) {
    return `${participants[0]?.name ?? "Member"} & others`;
  }
  if (participants.length === 2) {
    return `${participants[0]?.name ?? "Member"} & ${participants[1]?.name ?? "Member"}`;
  }
  return `${participants[0]?.name ?? "Member"}, ${participants[1]?.name ?? "Member"} +${
    participants.length - 2
  }`;
}

export function formatUuidFromBytes(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canonicalizeMessageId(messageId: string, conversationId: string): string {
  const trimmed = typeof messageId === "string" ? messageId.trim() : "";
  if (!trimmed) {
    throw new ChatServiceError("invalid_message_id", 400, "Message id is required.");
  }
  if (UUID_PATTERN.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const digest = createHash("sha256")
    .update(MESSAGE_ID_NAMESPACE)
    .update("|")
    .update(conversationId)
    .update("|")
    .update(trimmed)
    .digest();

  const uuidBytes = Buffer.from(digest.subarray(0, 16));
  uuidBytes[6] = ((uuidBytes[6] ?? 0) & 0x0f) | 0x50;
  uuidBytes[8] = ((uuidBytes[8] ?? 0) & 0x3f) | 0x80;

  return formatUuidFromBytes(uuidBytes);
}

export type ResolvedIdentity = {
  canonicalId: string;
  profile: ChatParticipantRow | null;
};

export function mergeParticipantMaps(
  primary: Map<string, ChatParticipantRow>,
  fallbacks: Iterable<ResolvedIdentity>,
) {
  for (const entry of fallbacks) {
    if (!entry?.profile) continue;
    if (!primary.has(entry.canonicalId)) {
      primary.set(entry.canonicalId, entry.profile);
    }
  }
}
