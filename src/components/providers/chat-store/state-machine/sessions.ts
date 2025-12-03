import type { ChatParticipant, ChatSessionDescriptor } from "@/lib/chat/events";

import { mergeParticipants, participantsEqual } from "../helpers";
import type { ChatMessage } from "../types";
import { ChatStateMachineBase } from "./machine-base";
import type { SessionEnsureResult } from "./types";

export class ChatSessionMachine extends ChatStateMachineBase {
  ensureSession(descriptor: ChatSessionDescriptor): SessionEnsureResult {
    const sanitized = this.sanitizeDescriptor(descriptor);
    const sessions = { ...this.state.sessions };
    let session = sessions[sanitized.id];
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
        messageIndex: {},
        lastMessageTimestamp: 0,
        unreadCount: 0,
        typing: {},
      };
      sessions[session.id] = session;
      created = true;
      changed = true;
    } else {
      if (
        session.type !== sanitized.type ||
        session.title !== sanitized.title ||
        session.avatar !== sanitized.avatar ||
        session.createdBy !== sanitized.createdBy
      ) {
        session.type = sanitized.type;
        session.title = sanitized.title;
        session.avatar = sanitized.avatar;
        session.createdBy = sanitized.createdBy;
        changed = true;
      }

      const mergedParticipants = mergeParticipants(session.participants, sanitized.participants);
      if (!participantsEqual(session.participants, mergedParticipants)) {
        session.participants = mergedParticipants;
        changed = true;
      }

      if (!session.typing) {
        session.typing = {};
      }
    }

    if (created || changed) {
      this.state = {
        ...this.state,
        sessions,
      };
    }

    return { session: session!, created, changed };
  }

  setActiveSession(sessionId: string | null): boolean {
    if (this.state.activeSessionId === sessionId) return false;
    const sessions = { ...this.state.sessions };
    if (sessionId && sessions[sessionId]) {
      sessions[sessionId] = { ...sessions[sessionId], unreadCount: 0 };
    }
    this.state = {
      ...this.state,
      sessions,
      activeSessionId: sessionId,
    };
    return true;
  }

  deleteSession(sessionId: string): boolean {
    if (!this.state.sessions[sessionId]) return false;
    const sessions = { ...this.state.sessions };
    delete sessions[sessionId];
    const activeSessionId =
      this.state.activeSessionId === sessionId ? null : this.state.activeSessionId;
    this.state = {
      ...this.state,
      sessions,
      activeSessionId,
    };
    return true;
  }

  remapSessionId(oldId: string, newId: string): boolean {
    const sourceId = typeof oldId === "string" ? oldId.trim() : "";
    const targetId = typeof newId === "string" ? newId.trim() : "";
    if (!sourceId || !targetId || sourceId === targetId) return false;

    const sessions = { ...this.state.sessions };
    const sourceSession = sessions[sourceId];
    if (!sourceSession) return false;

    const resolveMessage = (existing: ChatMessage | undefined, incoming: ChatMessage): ChatMessage => {
      if (!existing) return { ...incoming };
      if (existing.status === "sent") return existing;
      if (incoming.status === "sent") return { ...incoming };
      if (existing.status === "failed" && incoming.status === "pending") return { ...incoming };
      return existing;
    };

    const accumulateMessages = (base: Map<string, ChatMessage>, messages: ChatMessage[]) => {
      messages.forEach((message) => {
        const current = base.get(message.id);
        base.set(message.id, resolveMessage(current, message));
      });
    };

    let targetSession = sessions[targetId];
    if (!targetSession || targetSession === sourceSession) {
      delete sessions[sourceId];
      sourceSession.id = targetId;
      sessions[targetId] = sourceSession;
      targetSession = sourceSession;
    } else {
      const participantMerge = mergeParticipants(
        sourceSession.participants,
        targetSession.participants,
      );
      targetSession.participants = participantMerge;

      const messages = new Map<string, ChatMessage>();
      accumulateMessages(messages, targetSession.messages);
      accumulateMessages(messages, sourceSession.messages);
      const mergedMessages = Array.from(messages.values()).sort((a, b) => {
        if (a.id === b.id) return 0;
        const leftTs = Date.parse(a.sentAt);
        const rightTs = Date.parse(b.sentAt);
        if (Number.isFinite(leftTs) && Number.isFinite(rightTs)) {
          return leftTs - rightTs;
        }
        if (Number.isFinite(leftTs)) return -1;
        if (Number.isFinite(rightTs)) return 1;
        return a.sentAt.localeCompare(b.sentAt);
      });

      targetSession.messages = mergedMessages;
      targetSession.messageIndex = this.buildMessageIndex(mergedMessages);
      targetSession.lastMessageTimestamp = mergedMessages.reduce((latest, message) => {
        const ts = Date.parse(message.sentAt);
        return Number.isFinite(ts) ? Math.max(latest, ts) : latest;
      }, Math.max(targetSession.lastMessageTimestamp, sourceSession.lastMessageTimestamp));
      targetSession.unreadCount = Math.max(targetSession.unreadCount, sourceSession.unreadCount);
      if (!targetSession.createdBy && sourceSession.createdBy) {
        targetSession.createdBy = sourceSession.createdBy;
      }
      if (!targetSession.title && sourceSession.title) {
        targetSession.title = sourceSession.title;
      }
      if (!targetSession.avatar && sourceSession.avatar) {
        targetSession.avatar = sourceSession.avatar;
      }
      delete sessions[sourceId];
    }

    const activeSessionId =
      this.state.activeSessionId === sourceId ? targetId : this.state.activeSessionId;

    this.state = {
      ...this.state,
      sessions,
      activeSessionId,
    };
    return true;
  }

  upsertParticipants(sessionId: string, participants: ChatParticipant[]): boolean {
    const session = this.state.sessions[sessionId];
    if (!session) return false;
    const enriched = participants.map((participant) => this.enrichParticipant(participant));
    const merged = mergeParticipants(session.participants, enriched);
    if (participantsEqual(session.participants, merged)) {
      return false;
    }
    const sessions = { ...this.state.sessions };
    sessions[sessionId] = { ...session, participants: merged };
    this.state = {
      ...this.state,
      sessions,
    };
    return true;
  }
}
