"use client";

export type PartyPanelVariant = "default" | "compact";

export type ParticipantProfile = {
  name: string | null;
  avatar: string | null;
};

export type InviteStatus = {
  message: string;
  tone: "success" | "warning" | "info";
};

export type PartyTranscriptSegment = {
  id: string;
  text: string;
  speakerId: string | null;
  speakerName: string | null;
  startTime?: number;
  endTime?: number;
  language?: string | null;
  final?: boolean;
};

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "";
  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return "Just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function initialsFromName(name: string | null | undefined): string {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
