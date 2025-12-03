import type { ChatParticipant, ChatSessionDescriptor } from "@/lib/chat/events";

import {
  hydrateMessageAttachments,
  isLegacyStoredSession,
  isValidStoredSession,
  normalizeParticipant,
  normalizeReactions,
  persistMessageAttachments,
  sanitizeStoredAttachments,
} from "../helpers";
import type { ChatMessage, StoredMessage, StoredState } from "../types";
import { ChatEventMachine } from "./events";
import type { ChatSessionState } from "./types";

export class ChatPersistenceMachine extends ChatEventMachine {
  toStoredState(): StoredState {
    const sessions = Object.values(this.state.sessions).map((session) => ({
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
      messages: session.messages.slice(-this.messageLimit).map((message) => {
        const storedMessage: StoredMessage = {
          id: message.id,
          authorId: message.authorId,
          body: message.body,
          sentAt: message.sentAt,
        };
        if (message.reactions.length > 0) {
          storedMessage.reactions = message.reactions.map((reaction) => ({
            emoji: reaction.emoji,
            users: reaction.users.map((user) => ({
              id: user.id,
              name: user.name,
              avatar: user.avatar,
            })),
          }));
        }
        const persistedAttachments = persistMessageAttachments(message.attachments);
        if (persistedAttachments && persistedAttachments.length > 0) {
          storedMessage.attachments = persistedAttachments;
        }
        if (message.taskId) {
          const trimmedId = message.taskId.trim();
          if (trimmedId) {
            storedMessage.taskId = trimmedId;
          }
        }
        if (message.taskTitle) {
          const trimmedTitle = message.taskTitle.trim();
          if (trimmedTitle) {
            storedMessage.taskTitle = trimmedTitle;
          }
        }
        return storedMessage;
      }),
    }));
    return {
      activeSessionId: this.state.activeSessionId,
      sessions,
    };
  }

  hydrate(stored: StoredState): void {
    const sessions: Record<string, ChatSessionState> = {};
    stored.sessions.forEach((entry) => {
      let descriptor: ChatSessionDescriptor | null = null;
      if (isValidStoredSession(entry)) {
        const participants = entry.participants
          .map((participant) => normalizeParticipant(participant))
          .filter((participant): participant is ChatParticipant => Boolean(participant));
        descriptor = {
          id: entry.id,
          type: entry.type,
          title: entry.title,
          avatar: entry.avatar ?? null,
          createdBy: entry.createdBy ?? null,
          participants,
        };
      } else if (isLegacyStoredSession(entry)) {
        const participant = normalizeParticipant({
          id: entry.friendUserId,
          name: entry.friendName,
          avatar: entry.friendAvatar ?? null,
        });
        if (participant) {
          descriptor = {
            id: entry.id,
            type: "direct",
            title: entry.friendName,
            avatar: entry.friendAvatar ?? null,
            createdBy: null,
            participants: [participant],
          };
        }
      }
      if (!descriptor) return;
      const sanitized = this.sanitizeDescriptor(descriptor);
      const session: ChatSessionState = {
        id: sanitized.id,
        type: sanitized.type,
        title: sanitized.title,
        avatar: sanitized.avatar,
        createdBy: sanitized.createdBy,
        participants: sanitized.participants,
        messages: [],
        messageIndex: {},
        lastMessageTimestamp: 0,
        unreadCount: 0,
        typing: {},
      };
      entry.messages.slice(-this.messageLimit).forEach((storedMessage) => {
        if (
          storedMessage &&
          typeof storedMessage.id === "string" &&
          typeof storedMessage.authorId === "string" &&
          typeof storedMessage.body === "string" &&
          typeof storedMessage.sentAt === "string"
        ) {
          const reactionDescriptors =
            Array.isArray(storedMessage.reactions) && storedMessage.reactions.length > 0
              ? storedMessage.reactions.map((reaction) => ({
                  emoji: typeof reaction?.emoji === "string" ? reaction.emoji : "",
                  users: Array.isArray(reaction?.users) ? reaction.users : [],
                }))
              : [];
          const reactions = normalizeReactions(reactionDescriptors, (id) => this.isSelfId(id));
          const taskId =
            typeof storedMessage.taskId === "string" && storedMessage.taskId.trim().length
              ? storedMessage.taskId.trim()
              : null;
          const taskTitle =
            typeof storedMessage.taskTitle === "string" && storedMessage.taskTitle.trim().length
              ? storedMessage.taskTitle.trim()
              : null;
          const restoredMessage: ChatMessage = {
            id: storedMessage.id,
            authorId: storedMessage.authorId,
            body: storedMessage.body,
            sentAt: storedMessage.sentAt,
            status: "sent",
            reactions,
            attachments: hydrateMessageAttachments(
              sanitizeStoredAttachments(storedMessage.attachments),
            ),
            taskId,
            taskTitle,
          };
          session.messages.push(restoredMessage);
          session.messageIndex[restoredMessage.id] = session.messages.length - 1;
          const ts = Date.parse(restoredMessage.sentAt);
          if (Number.isFinite(ts)) {
            session.lastMessageTimestamp = ts;
          }
        }
      });
      sessions[session.id] = session;
    });
    this.state = {
      ...this.state,
      sessions,
      activeSessionId: typeof stored.activeSessionId === "string" ? stored.activeSessionId : null,
    };
  }
}
