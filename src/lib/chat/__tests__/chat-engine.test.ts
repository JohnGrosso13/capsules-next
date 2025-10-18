"use client";

import { describe, expect, it, beforeEach, afterEach, vi, type Mock } from "vitest";

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
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    const defaultResponse = {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        conversationId: "",
        participants: [],
        messages: [],
        session: { type: "direct", title: "", avatar: null, createdBy: null },
      }),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(defaultResponse);
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete (globalThis as typeof globalThis & { fetch?: typeof fetch }).fetch;
    }
  });

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

  it("creates a group chat via API and stores session metadata", async () => {
    const fetchMock = globalThis.fetch as unknown as Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        conversationId: "chat:group:test",
        participants: [
          { id: "user_self", name: "Self", avatar: null },
          { id: "user_b", name: "Bob", avatar: null },
        ],
        session: { type: "group", title: "Crew", avatar: null, createdBy: "user_self" },
      }),
    } as Response);

    const store = new ChatStore();
    const engine = new ChatEngine(store);
    engine.setUserProfile({ id: "user_self", name: "Self", email: null, avatarUrl: null });

    const result = await engine.startGroupChat(
      [{ id: "user_b", name: "Bob", avatar: null }],
      "Crew",
      { activate: true },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/groups",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result?.id).toBe("chat:group:test");
    const session = engine.getSnapshot().sessions.find((entry) => entry.id === "chat:group:test");
    expect(session).toBeTruthy();
    expect(session?.type).toBe("group");
    expect(session?.title).toBe("Crew");
    expect(session?.participants.map((participant) => participant.id)).toContain("user_b");
  });

  it("adds members to an existing group chat via API", async () => {
    const fetchMock = globalThis.fetch as unknown as Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        conversationId: "chat:group:test",
        participants: [
          { id: "user_self", name: "Self", avatar: null },
          { id: "user_b", name: "Bob", avatar: null },
          { id: "user_c", name: "Cara", avatar: null },
        ],
        session: { type: "group", title: "Crew", avatar: null, createdBy: "user_self" },
      }),
    } as Response);

    const store = new ChatStore();
    store.startSession({
      id: "chat:group:test",
      type: "group",
      title: "Crew",
      avatar: null,
      createdBy: "user_self",
      participants: [
        { id: "user_self", name: "Self", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
    });

    const engine = new ChatEngine(store);
    await engine.addParticipantsToGroup("chat:group:test", [
      { id: "user_c", name: "Cara", avatar: null },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/groups/chat%3Agroup%3Atest/members",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const session = engine.getSnapshot().sessions.find((entry) => entry.id === "chat:group:test");
    expect(session?.participants.map((participant) => participant.id)).toContain("user_c");
  });

  it("renames a group chat via API and updates the session title", async () => {
    const fetchMock = globalThis.fetch as unknown as Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        conversationId: "chat:group:test",
        participants: [
          { id: "user_self", name: "Self", avatar: null },
          { id: "user_b", name: "Bob", avatar: null },
        ],
        session: { type: "group", title: "New Crew", avatar: null, createdBy: "user_self" },
      }),
    } as Response);

    const store = new ChatStore();
    store.startSession({
      id: "chat:group:test",
      type: "group",
      title: "Crew",
      avatar: null,
      createdBy: "user_self",
      participants: [
        { id: "user_self", name: "Self", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
    });

    const engine = new ChatEngine(store);
    await engine.renameGroupChat("chat:group:test", "New Crew");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/groups/chat%3Agroup%3Atest",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
    const session = engine.getSnapshot().sessions.find((entry) => entry.id === "chat:group:test");
    expect(session?.title).toBe("New Crew");
  });

  it("loads group conversation history and preserves session metadata", async () => {
    const fetchMock = globalThis.fetch as unknown as Mock;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        conversationId: "chat:group:test",
        participants: [
          { id: "user_self", name: "Self", avatar: null },
          { id: "user_b", name: "Bob", avatar: null },
        ],
        session: { type: "group", title: "Crew", avatar: null, createdBy: "user_self" },
        messages: [
          {
            id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            conversationId: "chat:group:test",
            senderId: "user_b",
            body: "Hey team",
            sentAt: new Date().toISOString(),
            reactions: [],
          },
        ],
      }),
    } as Response);

    const store = new ChatStore();
    const engine = new ChatEngine(store);

    // Access private method via casting for testing
    await (engine as unknown as { loadConversationHistory(id: string): Promise<void> }).loadConversationHistory(
      "chat:group:test",
    );

    const session = engine.getSnapshot().sessions.find((entry) => entry.id === "chat:group:test");
    expect(session).toBeTruthy();
    expect(session?.type).toBe("group");
    expect(session?.title).toBe("Crew");
    expect(session?.messages).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/chat/messages?conversationId=chat%3Agroup%3Atest&limit=50",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
