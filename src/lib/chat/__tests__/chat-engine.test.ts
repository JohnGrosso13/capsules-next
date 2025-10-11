"use client";

import { describe, expect, it } from "vitest";

import type { ChatParticipant } from "@/components/providers/chat-store";
import { ChatStore } from "@/components/providers/chat-store";
import { ChatEngine } from "@/lib/chat/chat-engine";
import { saveChatState } from "@/lib/chat/chat-storage";

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe("ChatEngine", () => {
  it("hydrates stored sessions and restores direct chat metadata", () => {
    const storage = new MemoryStorage();
    saveChatState(storage, {
      activeSessionId: "chat:pair:user_a:user_b",
      sessions: [
        {
          id: "chat:pair:user_a:user_b",
          type: "direct",
          title: "Bob",
          avatar: null,
          createdBy: null,
          participants: [
            { id: "user_a", name: "Alice", avatar: null },
            { id: "user_b", name: "Bob", avatar: null },
          ],
          messages: [
            {
              id: "msg-1",
              authorId: "user_a",
              body: "Hello",
              sentAt: new Date().toISOString(),
            },
          ],
        },
      ],
    });
    const store = new ChatStore();
    const engine = new ChatEngine(store);
    engine.hydrate(storage);
    const snapshot = engine.getSnapshot();
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.type).toBe("direct");
    expect(snapshot.sessions[0]?.participants.map((p) => p.id)).toContain("user_b");
  });

  it("keeps direct chats from becoming group when realtime payload includes extra participants", () => {
    const engine = new ChatEngine(new ChatStore());
    engine.setUserProfile({ id: "user_a", name: "Alice", email: null, avatarUrl: null });

    const bob: ChatParticipant = { id: "user_b", name: "Bob", avatar: null };
    engine.startDirectChat(bob, { activate: true });

    engine.dispatchRealtimeEvent({
      name: "chat.session",
      data: {
        type: "chat.session",
        conversationId: "chat:pair:user_a:user_b",
        session: {
          participants: [
            { id: "user_a", name: "Alice", avatar: null },
            { id: "user_b", name: "Bob", avatar: null },
            { id: "user_c", name: "Extra", avatar: null },
          ],
        },
      },
    });

    const session = engine
      .getSnapshot()
      .sessions.find((entry) => entry.id === "chat:pair:user_a:user_b");
    expect(session).toBeTruthy();
    expect(session?.type).toBe("direct");
    expect(session?.participants.length).toBeLessThanOrEqual(2);
    const participantIds = session?.participants.map((participant) => participant.id) ?? [];
    expect(participantIds).toContain("user_b");
  });

  it("uses the current user id when composing direct conversation ids", () => {
    const engine = new ChatEngine(new ChatStore());
    engine.setUserProfile({ id: "user_a", name: "Alice", email: null, avatarUrl: null });

    const result = engine.startDirectChat({ id: "user_b", name: "Bob", avatar: null });
    expect(result?.id).toBe("chat:pair:user_a:user_b");
  });
});
