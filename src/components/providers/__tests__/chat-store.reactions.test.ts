import { describe, expect, it } from "vitest";

import { ChatStore } from "@/components/providers/chat-store";

describe("ChatStore reactions", () => {
  const conversationId = "chat:pair:user_a:user_b";
  const sentAt = new Date(1700000000000).toISOString();

  const setupStore = () => {
    const store = new ChatStore();
    store.setCurrentUserId("user_a");
    store.ensureSession({
      id: conversationId,
      type: "direct",
      title: "Bob",
      avatar: null,
      createdBy: null,
      participants: [
        { id: "user_a", name: "Alice", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
    });
    store.addMessage(
      conversationId,
      {
        id: "msg-1",
        authorId: "user_a",
        body: "Hello",
        sentAt,
        status: "sent",
        reactions: [],
        attachments: [],
      },
      { isLocal: false },
    );
    return store;
  };

  it("applies reaction events and tracks self participation", () => {
    const store = setupStore();
    store.setCurrentUserId("user_b");

    store.applyReactionEvent({
      type: "chat.reaction",
      conversationId,
      messageId: "msg-1",
      emoji: "👍",
      action: "added",
      actor: { id: "user_b", name: "Bob", avatar: null },
      reactions: [
        {
          emoji: "👍",
          users: [{ id: "user_b", name: "Bob", avatar: null }],
        },
      ],
      participants: [
        { id: "user_a", name: "Alice", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
    });

    const message = store
      .getSnapshot()
      .sessions.find((session) => session.id === conversationId)
      ?.messages.find((m) => m.id === "msg-1");

    expect(message?.reactions).toHaveLength(1);
    expect(message?.reactions[0]?.emoji).toBe("👍");
    expect(message?.reactions[0]?.count).toBe(1);
    expect(message?.reactions[0]?.selfReacted).toBe(true);
  });

  it("removes reactions when payload is empty", () => {
    const store = setupStore();
    store.applyReactionEvent({
      type: "chat.reaction",
      conversationId,
      messageId: "msg-1",
      emoji: "👍",
      action: "added",
      actor: { id: "user_b", name: "Bob", avatar: null },
      reactions: [
        {
          emoji: "👍",
          users: [{ id: "user_b", name: "Bob", avatar: null }],
        },
      ],
      participants: [
        { id: "user_a", name: "Alice", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
    });

    store.applyReactionEvent({
      type: "chat.reaction",
      conversationId,
      messageId: "msg-1",
      emoji: "👍",
      action: "removed",
      actor: { id: "user_b", name: "Bob", avatar: null },
      reactions: [],
      participants: [
        { id: "user_a", name: "Alice", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
    });

    const message = store
      .getSnapshot()
      .sessions.find((session) => session.id === conversationId)
      ?.messages.find((m) => m.id === "msg-1");

    expect(message?.reactions ?? []).toHaveLength(0);
  });

  it("merges skin tone emoji reactions without duplication", () => {
    const store = setupStore();

    store.applyReactionEvent({
      type: "chat.reaction",
      conversationId,
      messageId: "msg-1",
      emoji: "👍🏻",
      action: "added",
      actor: { id: "user_a", name: "Alice", avatar: null },
      reactions: [
        {
          emoji: "👍🏻",
          users: [
            { id: "user_a", name: "Alice", avatar: null },
            { id: "user_b", name: "Bob", avatar: null },
          ],
        },
      ],
      participants: [
        { id: "user_a", name: "Alice", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
    });

    const message = store
      .getSnapshot()
      .sessions.find((session) => session.id === conversationId)
      ?.messages.find((m) => m.id === "msg-1");

    expect(message?.reactions).toBeTruthy();
    expect(message?.reactions[0]?.emoji).toBe("👍🏻");
    expect(message?.reactions[0]?.count).toBe(2);
    expect(message?.reactions[0]?.selfReacted).toBe(true);
  });
});
