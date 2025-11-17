import { describe, expect, it } from "vitest";

import { ChatStateMachine } from "@/components/providers/chat-store/state-machine";
import type { ChatSessionDescriptor } from "@/lib/chat/events";
import { TYPING_TTL_MS } from "@/components/providers/chat-store/typing";

function createDescriptor(overrides: Partial<ChatSessionDescriptor> = {}): ChatSessionDescriptor {
  return {
    id: "conversation-1",
    type: "group",
    title: "",
    avatar: null,
    createdBy: null,
    participants: [
      { id: "self-user", name: "Self", avatar: null },
      { id: "friend-1", name: "Friend", avatar: null },
    ],
    ...overrides,
  };
}

describe("ChatStateMachine", () => {
  it("ensures sessions and merges participant updates", () => {
    const machine = new ChatStateMachine();
    machine.setCurrentUserId("self-user");

    const created = machine.applySessionEvent(
      createDescriptor({ title: "Initial", participants: createDescriptor().participants }),
    );
    expect(created).toBe(true);

    const updated = machine.applySessionEvent(
      createDescriptor({
        title: "Renamed",
        participants: [
          { id: "self-user", name: "Self", avatar: null },
          { id: "friend-1", name: "Friend", avatar: null },
          { id: "friend-2", name: "New Friend", avatar: null },
        ],
      }),
    );
    expect(updated).toBe(true);

    const session = machine.getState().sessions["conversation-1"]!;
    expect(session.title).toBe("Renamed");
    expect(session.participants.map((p) => p.id).sort()).toEqual([
      "friend-1",
      "friend-2",
      "self-user",
    ]);
  });

  it("trims message history to the configured limit and maintains unread counts", () => {
    let now = 1_000_000;
    const machine = new ChatStateMachine({ messageLimit: 3, now: () => now });
    machine.setCurrentUserId("self-user");

    machine.ensureSession(createDescriptor());

    const addRemote = (id: string) => {
      now += 10;
      machine.addMessage(
        "conversation-1",
        {
          id,
          authorId: "friend-1",
          body: `message-${id}`,
          sentAt: new Date(now).toISOString(),
          status: "sent",
          reactions: [],
          attachments: [],
        },
        { isLocal: false },
      );
    };

    addRemote("m1");
    addRemote("m2");
    addRemote("m3");

    expect(machine.getState().sessions["conversation-1"]!.unreadCount).toBe(3);

    machine.setActiveSession("conversation-1");
    now += 10;
    machine.addMessage(
      "conversation-1",
      {
        id: "m4",
        authorId: "self-user",
        body: "local message",
        sentAt: new Date(now).toISOString(),
        status: "sent",
        reactions: [],
        attachments: [],
      },
      { isLocal: true },
    );

    const session = machine.getState().sessions["conversation-1"]!;
    expect(session.unreadCount).toBe(0);
    expect(session.messages.map((message) => message.id)).toEqual(["m2", "m3", "m4"]);
    expect(session.messageIndex).not.toHaveProperty("m1");
    expect(session.messageIndex).toMatchObject({ m2: 0, m3: 1, m4: 2 });
  });

  it("applies typing events and prunes expired entries", () => {
    let now = 5_000;
    const machine = new ChatStateMachine({ now: () => now });
    machine.setCurrentUserId("self-user");

    const applied = machine.applyTypingEvent({
      type: "chat.typing",
      conversationId: "conversation-typing",
      senderId: "friend-typing",
      typing: true,
      participants: [
        { id: "self-user", name: "Self", avatar: null },
        { id: "friend-typing", name: "Typer", avatar: null },
      ],
    });

    expect(applied).toBe(true);

    const typingState = machine.getState().sessions["conversation-typing"]!.typing;
    const entry = Object.values(typingState)[0];
    expect(entry?.participant.id).toBe("friend-typing");

    now += TYPING_TTL_MS + 100;
    const pruned = machine.pruneTyping();
    expect(pruned).toBe(true);
    expect(Object.keys(machine.getState().sessions["conversation-typing"]!.typing)).toHaveLength(0);
  });

  it("updates existing messages with edit events and refreshes metadata", () => {
    const machine = new ChatStateMachine();
    machine.setCurrentUserId("self-user");
    machine.ensureSession(createDescriptor());

    const sentAt = new Date().toISOString();
    machine.addMessage(
      "conversation-1",
      {
        id: "message-edit",
        authorId: "friend-1",
        body: "hello",
        sentAt,
        status: "sent",
        reactions: [],
        attachments: [],
      },
      { isLocal: false },
    );

    const nextSentAt = new Date(Date.now() + 5000).toISOString();
    const updated = machine.applyMessageUpdateEvent("conversation-1", "message-edit", {
      body: "updated body",
      attachments: [
        {
          id: "attach-1",
          name: "file.txt",
          mimeType: "text/plain",
          url: "https://example.com/file.txt",
          thumbnailUrl: null,
          storageKey: null,
          sessionId: null,
        },
      ],
      participants: [{ id: "friend-2", name: "Editor", avatar: null }],
      senderId: "friend-2",
      sentAt: nextSentAt,
    });

    expect(updated).toBe(true);

    const session = machine.getState().sessions["conversation-1"]!;
    const message = session.messages.find((entry) => entry.id === "message-edit");
    expect(message?.body).toBe("updated body");
    expect(message?.sentAt).toBe(nextSentAt);
    expect(message?.attachments).toHaveLength(1);
    expect(session.participants.some((participant) => participant.id === "friend-2")).toBe(true);
    expect(session.lastMessageTimestamp).toBe(Date.parse(nextSentAt));
  });

  it("deletes messages and rebuilds message indices", () => {
    const machine = new ChatStateMachine();
    machine.setCurrentUserId("self-user");
    machine.ensureSession(createDescriptor());

    const add = (id: string, body: string) =>
      machine.addMessage(
        "conversation-1",
        {
          id,
          authorId: "friend-1",
          body,
          sentAt: new Date().toISOString(),
          status: "sent",
          reactions: [],
          attachments: [],
        },
        { isLocal: false },
      );

    add("m-delete-1", "first");
    add("m-delete-2", "second");

    const deleted = machine.applyMessageDeleteEvent("conversation-1", "m-delete-1", {});
    expect(deleted).toBe(true);

    const session = machine.getState().sessions["conversation-1"]!;
    expect(session.messages.map((m) => m.id)).toEqual(["m-delete-2"]);
    expect(session.messageIndex).toMatchObject({ "m-delete-2": 0 });
  });

  it("applies reaction events and upserts participants", () => {
    const machine = new ChatStateMachine();
    machine.setCurrentUserId("self-user");
    machine.ensureSession(createDescriptor());
    const beforeParticipants = machine.getState().sessions["conversation-1"]!.participants.length;
    machine.addMessage(
      "conversation-1",
      {
        id: "message-1",
        authorId: "friend-1",
        body: "hello",
        sentAt: new Date().toISOString(),
        status: "sent",
        reactions: [],
        attachments: [],
      },
      { isLocal: false },
    );

    const changed = machine.applyReactionEvent({
      type: "chat.reaction",
      conversationId: "conversation-1",
      messageId: "message-1",
      emoji: "\u{1F44D}",
      action: "added",
      actor: { id: "friend-1", name: "Friend", avatar: null },
      reactions: [
        {
          emoji: "\u{1F44D}",
          users: [
            { id: "friend-1", name: "Friend", avatar: null },
            { id: "self-user", name: "Self", avatar: null },
          ],
        },
      ],
      participants: [
        { id: "self-user", name: "Self", avatar: null },
        { id: "friend-1", name: "Friend", avatar: null },
        { id: "friend-3", name: "New Friend", avatar: null },
      ],
    });

    expect(changed).toBe(true);

    const session = machine.getState().sessions["conversation-1"]!;
    expect(session.participants.length).toBeGreaterThan(beforeParticipants);
    const message = session.messages[0]!;
    expect(message.reactions[0]).toMatchObject({
      emoji: "\u{1F44D}",
      count: 2,
      selfReacted: true,
    });
    expect(session.participants.some((participant) => participant.id === "friend-3")).toBe(true);
  });
});
