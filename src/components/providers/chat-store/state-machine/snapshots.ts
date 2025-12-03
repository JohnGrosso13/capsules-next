import type { FriendItem } from "@/hooks/useFriendsData";

import { computeDefaultTitle, mergeParticipants, participantsEqual } from "../helpers";
import type { ChatSession } from "../types";
import { collectTypingSnapshot, pruneTypingEntries } from "../typing";
import type { FriendDirectory } from "./types";
import { ChatPersistenceMachine } from "./persistence";

export class ChatSnapshotMachine extends ChatPersistenceMachine {
  updateFromFriends(friends: FriendItem[]): boolean {
    const normalized = Array.isArray(friends) ? friends : [];
    const directory: FriendDirectory = new Map();
    normalized.forEach((friend) => {
      this.registerFriendLookup(directory, friend.userId, friend);
      this.registerFriendLookup(directory, friend.key, friend);
    });
    this.friendDirectory = directory;
    if (normalized.length === 0) return false;
    const selfIds = this.getSelfIds();
    const sessions = { ...this.state.sessions };
    let changed = false;
    Object.values(sessions).forEach((session) => {
      const updatedParticipants = session.participants.map((participant) =>
        this.enrichParticipant(participant),
      );
      const mergedParticipants = mergeParticipants(updatedParticipants);
      if (!participantsEqual(session.participants, mergedParticipants)) {
        session.participants = mergedParticipants;
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
    if (!changed) return false;
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  refreshSessionTitles(): boolean {
    const selfIds = this.getSelfIds();
    const sessions = { ...this.state.sessions };
    let changed = false;
    Object.values(sessions).forEach((session) => {
      if (session.type === "direct") {
        const nextTitle = computeDefaultTitle(session.participants, selfIds, "direct");
        if (session.title !== nextTitle) {
          session.title = nextTitle;
          changed = true;
        }
      }
    });
    if (!changed) return false;
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }

  buildSnapshot(now: number = this.now()): {
    sessions: ChatSession[];
    activeSessionId: string | null;
    activeSession: ChatSession | null;
    unreadCount: number;
  } {
    const selfIds = this.getSelfIds();
    const entries: Array<{ order: number; session: ChatSession }> = [];
    Object.values(this.state.sessions).forEach((session) => {
      const typingSnapshot = collectTypingSnapshot(session.typing ?? {}, now, { selfIds });
      const messages = session.messages.map((message) => ({ ...message }));
      const lastMessage = messages[messages.length - 1] ?? null;
      entries.push({
        order:
          session.lastMessageTimestamp || (lastMessage ? Date.parse(lastMessage.sentAt) : 0) || 0,
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
          lastMessagePreview:
            (lastMessage?.body && lastMessage.body.trim().length ? lastMessage.body : "") ||
            (lastMessage &&
            Array.isArray(lastMessage.attachments) &&
            lastMessage.attachments.length
              ? lastMessage.attachments.length === 1
                ? `Attachment: ${lastMessage.attachments[0]?.name ?? "Attachment"}`
                : `Attachments (${lastMessage.attachments.length})`
              : null),
          typing: typingSnapshot.participants,
        },
      });
      if (typingSnapshot.changed) {
        session.typing = typingSnapshot.typing;
      }
    });

    entries.sort((a, b) => b.order - a.order);
    const sessions = entries.map((entry) => entry.session);
    const activeSession = this.state.activeSessionId
      ? sessions.find((session) => session.id === this.state.activeSessionId) ?? null
      : null;
    const unreadCount = sessions.reduce((total, session) => total + session.unreadCount, 0);
    return {
      sessions,
      activeSessionId: this.state.activeSessionId,
      activeSession,
      unreadCount,
    };
  }

  pruneTyping(now: number = this.now()): boolean {
    const sessions = { ...this.state.sessions };
    let changed = false;
    Object.entries(sessions).forEach(([id, session]) => {
      const snapshot = pruneTypingEntries(session.typing ?? {}, now);
      if (snapshot.changed) {
        sessions[id] = {
          ...session,
          typing: snapshot.typing,
        };
        changed = true;
      }
    });
    if (!changed) return false;
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }
}
