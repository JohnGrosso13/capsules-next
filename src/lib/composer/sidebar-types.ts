"use client";

export type SidebarRecentChatListItem = {
  id: string;
  title: string;
  caption: string;
};

export type SidebarDraftListItem =
  | {
      kind: "draft";
      id: string;
      title: string;
      caption: string;
      projectId: string | null;
    }
  | {
      kind: "choice";
      key: string;
      title: string;
      caption: string;
    };

export type SidebarProjectListItem = {
  id: string;
  name: string;
  caption: string;
  draftCount: number;
};

export type ComposerSidebarData = {
  recentChats: SidebarRecentChatListItem[];
  drafts: SidebarDraftListItem[];
  projects: SidebarProjectListItem[];
  selectedProjectId: string | null;
};

export function truncateLabel(label: string, max = 72): string {
  const trimmed = label.trim();
  if (!trimmed) return "Untitled";
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diff = now - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "Just now";
  if (diff < hour) {
    const mins = Math.round(diff / minute);
    return `${mins}m ago`;
  }
  if (diff < day) {
    const hours = Math.round(diff / hour);
    return `${hours}h ago`;
  }
  if (diff < 7 * day) {
    const days = Math.round(diff / day);
    return `${days}d ago`;
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
