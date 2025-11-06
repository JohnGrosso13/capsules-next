import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  loadChatHistoryAction,
  loadChatInboxAction,
  sendChatMessageAction,
} from "@/services/chat/actions";
import type { ChatMessageRecord, ChatParticipantSummary } from "@/server/chat/types";

vi.mock("@/server/actions/session", () => ({
  ensureUserSession: vi.fn(),
}));

vi.mock("@/server/chat/service", () => ({
  sendDirectMessage: vi.fn(),
  updateMessageAttachments: vi.fn(),
  deleteMessage: vi.fn(),
  createGroupConversationSession: vi.fn(),
  addParticipantsToGroupConversation: vi.fn(),
  removeParticipantFromGroupConversation: vi.fn(),
  renameGroupConversation: vi.fn(),
  deleteGroupConversationSession: vi.fn(),
  addMessageReaction: vi.fn(),
  removeMessageReaction: vi.fn(),
  getDirectConversationHistory: vi.fn(),
  getGroupConversationHistory: vi.fn(),
  listRecentDirectConversations: vi.fn(),
  listRecentGroupConversations: vi.fn(),
}));

const ensureUserSession = vi.mocked(
  await import("@/server/actions/session").then((mod) => mod.ensureUserSession),
);
const chatService = await import("@/server/chat/service");

const mockParticipants: ChatParticipantSummary[] = [
  { id: "user-1", name: "User One", avatar: "https://example.com/u1.png" },
  { id: "user-2", name: "User Two", avatar: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  ensureUserSession.mockResolvedValue({
    supabaseUserId: "user-1",
    clerkUserId: "clerk-user-1",
    primaryEmail: "user1@example.com",
    fullName: "User One",
    avatarUrl: "https://example.com/u1.png",
  });
});

describe("chat actions", () => {
  it("sends chat messages with normalized attachments and maps response", async () => {
    const messageRecord: ChatMessageRecord = {
      id: "msg-123",
      conversationId: "chat:pair:user-1:user-2",
      senderId: "user-1",
      body: " Hello there ",
      sentAt: "2025-11-05T12:00:00.000Z",
      reactions: [
        {
          emoji: "🔥",
          count: 1,
          users: [{ id: "user-1", name: "User One", avatar: null }],
        },
      ],
      attachments: [
        {
          id: "att-1",
          name: "photo.png",
          mimeType: "image/png",
          size: 2048,
          url: "https://cdn.test/photo.png",
          thumbnailUrl: null,
          storageKey: "attachments/photo",
          sessionId: null,
        },
      ],
    };
    vi.mocked(chatService.sendDirectMessage).mockResolvedValue({
      message: messageRecord,
      participants: mockParticipants,
    });

    const result = await sendChatMessageAction({
      conversationId: "chat:pair:user-1:user-2",
      messageId: "msg-123",
      body: " Hello there ",
      clientSentAt: "2025-11-05T11:59:59.000Z",
      attachments: [
        {
          id: "att-1",
          name: "photo.png",
          mimeType: "image/png",
          size: 2048.9,
          url: "https://cdn.test/photo.png",
          thumbnailUrl: null,
          storageKey: "attachments/photo",
          sessionId: null,
        },
      ],
    });

    expect(chatService.sendDirectMessage).toHaveBeenCalledWith({
      conversationId: "chat:pair:user-1:user-2",
      messageId: "msg-123",
      senderId: "user-1",
      body: " Hello there ",
      clientSentAt: "2025-11-05T11:59:59.000Z",
      attachments: [
        {
          id: "att-1",
          name: "photo.png",
          mimeType: "image/png",
          size: 2048,
          url: "https://cdn.test/photo.png",
          thumbnailUrl: null,
          storageKey: "attachments/photo",
          sessionId: null,
        },
      ],
    });

    expect(result.message).toEqual({
      id: "msg-123",
      conversationId: "chat:pair:user-1:user-2",
      senderId: "user-1",
      body: " Hello there ",
      sentAt: "2025-11-05T12:00:00.000Z",
      reactions: [
        {
          emoji: "🔥",
          count: 1,
          users: [{ id: "user-1", name: "User One", avatar: null }],
        },
      ],
      attachments: [
        {
          id: "att-1",
          name: "photo.png",
          mimeType: "image/png",
          size: 2048,
          url: "https://cdn.test/photo.png",
          thumbnailUrl: null,
          storageKey: "attachments/photo",
          sessionId: null,
        },
      ],
    });
    expect(result.participants).toEqual([
      { id: "user-1", name: "User One", avatar: "https://example.com/u1.png" },
      { id: "user-2", name: "User Two", avatar: null },
    ]);
  });

  it("loads chat history for direct conversation", async () => {
    vi.mocked(chatService.getDirectConversationHistory).mockResolvedValue({
      conversationId: "chat:pair:user-1:user-2",
      participants: mockParticipants,
      messages: [
        {
          id: "msg-321",
          conversationId: "chat:pair:user-1:user-2",
          senderId: "user-2",
          body: "Hi!",
          sentAt: "2025-11-05T10:00:00.000Z",
          reactions: [],
          attachments: [],
        },
      ],
    });

    const history = await loadChatHistoryAction({
      conversationId: "chat:pair:user-1:user-2",
      limit: 10,
    });

    expect(chatService.getDirectConversationHistory).toHaveBeenCalledWith({
      conversationId: "chat:pair:user-1:user-2",
      requesterId: "user-1",
      limit: 10,
    });
    expect(chatService.getGroupConversationHistory).not.toHaveBeenCalled();
    expect(history.conversationId).toBe("chat:pair:user-1:user-2");
    expect(history.participants).toHaveLength(2);
    expect(history.messages).toHaveLength(1);
  });

  it("loads inbox conversations sorted by recency and enforces limit", async () => {
    const directMessage: ChatMessageRecord = {
      id: "msg-direct",
      conversationId: "chat:pair:user-1:user-3",
      senderId: "user-3",
      body: "sup",
      sentAt: "2025-11-04T09:00:00.000Z",
      reactions: [],
      attachments: [],
    };
    const groupMessage: ChatMessageRecord = {
      id: "msg-group",
      conversationId: "chat:group:abc",
      senderId: "user-4",
      body: "hey team",
      sentAt: "2025-11-05T09:00:00.000Z",
      reactions: [],
      attachments: [],
    };

    vi.mocked(chatService.listRecentDirectConversations).mockResolvedValue([
      {
        conversationId: "chat:pair:user-1:user-3",
        participants: [
          { id: "user-1", name: "User One", avatar: null },
          { id: "user-3", name: "User Three", avatar: null },
        ],
        session: {
          type: "direct",
          title: "User Three",
          avatar: null,
          createdBy: null,
        },
        lastMessage: directMessage,
      },
    ]);

    vi.mocked(chatService.listRecentGroupConversations).mockResolvedValue([
      {
        conversationId: "chat:group:abc",
        participants: [
          { id: "user-1", name: "User One", avatar: null },
          { id: "user-4", name: "User Four", avatar: null },
        ],
        session: {
          type: "group",
          title: "Squad",
          avatar: "https://example.com/group.png",
          createdBy: "user-1",
        },
        lastMessage: groupMessage,
      },
    ]);

    const inbox = await loadChatInboxAction(1);

    expect(chatService.listRecentDirectConversations).toHaveBeenCalledWith({
      userId: "user-1",
      limit: 1,
    });
    expect(chatService.listRecentGroupConversations).toHaveBeenCalledWith({
      userId: "user-1",
      limit: 1,
    });
    expect(inbox.conversations).toHaveLength(1);
    const [firstConversation] = inbox.conversations;
    expect(firstConversation).toBeDefined();
    expect(firstConversation!.conversationId).toBe("chat:group:abc");
    expect(firstConversation!.session.type).toBe("group");
  });
});
