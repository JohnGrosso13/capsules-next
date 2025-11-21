"use client";

import type { ChatMessage, ChatParticipant } from "@/components/providers/ChatProvider";
import { formatAttachmentSize } from "../utils";

export const MESSAGE_GROUP_WINDOW_MS = 5 * 60_000;

export function formatMessageTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatPresence(value: string | null): string | null {
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
  return "Active recently";
}

export function initialsFrom(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function typingDisplayName(participant: ChatParticipant): string {
  const name = typeof participant.name === "string" ? participant.name.trim() : "";
  if (name) return name;
  const id = typeof participant.id === "string" ? participant.id.trim() : "";
  if (!id) return "Someone";
  if (id.length >= 24 && /^[0-9a-f-]+$/i.test(id)) {
    return `User ${id.slice(0, 4)}...${id.slice(-4)}`;
  }
  return id;
}

export function describeTypingParticipants(participants: ChatParticipant[]): string {
  const names = participants.map(typingDisplayName);
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} is typing...`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing...`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]} are typing...`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} others are typing...`;
}

export function isContinuationOf(previous: ChatMessage | null | undefined, current: ChatMessage): boolean {
  if (!previous) return false;
  if ((previous.authorId ?? null) !== (current.authorId ?? null)) return false;
  const previousTime = Date.parse(previous.sentAt);
  const currentTime = Date.parse(current.sentAt);
  if (!Number.isFinite(previousTime) || !Number.isFinite(currentTime)) return false;
  return Math.abs(currentTime - previousTime) < MESSAGE_GROUP_WINDOW_MS;
}

export function buildMessageKey(message: ChatMessage, index: number): string {
  const identifier =
    message.id && message.id.trim().length > 0
      ? `${message.id}-${index}`
      : `${message.authorId ?? "message"}-${message.sentAt}-${index}`;
  return identifier.replace(/\s+/g, "_");
}

export function buildMessageCopyText(message: ChatMessage): string {
  const segments: string[] = [];
  if (message.body?.trim()) {
    segments.push(message.body.trim());
  }
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.length) {
    attachments.forEach((attachment) => {
      if (!attachment) return;
      const sizeLabel = formatAttachmentSize(attachment.size);
      const parts = [attachment.name?.trim() || "Attachment"];
      if (sizeLabel) parts.push(`(${sizeLabel})`);
      if (attachment.url) parts.push(attachment.url);
      segments.push(parts.join(" "));
    });
  }
  return segments.join("\n\n");
}
