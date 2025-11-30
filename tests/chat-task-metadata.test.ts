import { describe, expect, test } from "vitest";

import { encodeMessagePayload, decodeMessagePayload } from "@/server/chat/utils";
import type { ChatMessageEventPayload } from "@/lib/chat/events";
import { ChatStore } from "@/components/providers/chat-store";

describe("chat task metadata", () => {
  test("encodes and decodes task payload with attachments", () => {
    const payload = encodeMessagePayload(
      "Hello world",
      [
        {
          id: "att-1",
          name: "file.txt",
          mimeType: "text/plain",
          size: 12,
          url: "https://example.com/file.txt",
          thumbnailUrl: null,
          storageKey: null,
          sessionId: null,
        },
      ],
      { id: "task-123", title: "Prep checklist" },
    );

    const decoded = decodeMessagePayload(payload);
    expect(decoded.text).toBe("Hello world");
    expect(decoded.attachments).toHaveLength(1);
    expect(decoded.task).toEqual({ id: "task-123", title: "Prep checklist" });
  });

  test("ChatStore stores task metadata from message events", () => {
    const store = new ChatStore();
    store.setCurrentUserId("user_a");

    const event: ChatMessageEventPayload = {
      type: "chat.message",
      conversationId: "chat:pair:user_a:user_b",
      senderId: "user_b",
      participants: [
        { id: "user_a", name: "Alice", avatar: null },
        { id: "user_b", name: "Bob", avatar: null },
      ],
      session: {
        type: "direct",
        title: "Alice & Bob",
        avatar: null,
        createdBy: null,
      },
      message: {
        id: "msg-1",
        body: "Tagged message",
        sentAt: new Date().toISOString(),
        reactions: [],
        attachments: [],
        taskId: "task-abc",
        taskTitle: "Launch plan",
      },
    };

    const changed = store.applyMessageEvent(event);
    expect(changed).toBe(true);

    const snapshot = store.getSnapshot();
    expect(snapshot.sessions).toHaveLength(1);
    const [session] = snapshot.sessions;
    if (!session) {
      throw new Error("Session missing from snapshot");
    }
    expect(session.messages).toHaveLength(1);
    const [message] = session.messages;
    if (!message) {
      throw new Error("Message missing from snapshot");
    }
    expect(message.taskId).toBe("task-abc");
    expect(message.taskTitle).toBe("Launch plan");
  });
});
