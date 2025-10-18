"use server";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ChatConversationMemberRow,
  ChatConversationRow,
  ChatMessageReactionRow,
  ChatMessageRow,
  ChatParticipantRow,
} from "@/server/chat/repository";
import * as repository from "@/server/chat/repository";
import {
  addMessageReaction,
  addParticipantsToGroupConversation,
  createGroupConversation,
  getGroupConversationHistory,
  renameGroupConversation,
  sendGroupMessage,
} from "@/server/chat/service";
import * as realtime from "@/services/realtime/chat";

vi.mock("@/server/chat/repository", () => ({
  fetchUsersByIds: vi.fn(),
  listChatMessages: vi.fn(),
  upsertChatMessage: vi.fn(),
  findUserIdentity: vi.fn(),
  listRecentMessagesForUser: vi.fn(),
  findChatMessageById: vi.fn(),
  listChatMessageReactions: vi.fn(),
  upsertChatMessageReaction: vi.fn(),
  deleteChatMessageReaction: vi.fn(),
  upsertChatConversation: vi.fn(),
  getChatConversationById: vi.fn(),
  updateChatConversation: vi.fn(),
  listChatConversationsByIds: vi.fn(),
  upsertChatConversationMembers: vi.fn(),
  deleteChatConversationMembers: vi.fn(),
  listChatConversationMembers: vi.fn(),
  listChatConversationMembershipsForUser: vi.fn(),
}));

vi.mock("@/services/realtime/chat", () => ({
  publishDirectMessageEvent: vi.fn(),
  publishReactionEvent: vi.fn(),
  publishSessionEvent: vi.fn(),
}));

const mockedRepo = vi.mocked(repository, true);
const mockedRealtime = vi.mocked(realtime, true);

const GROUP_ID = "chat:group:example";
const CREATOR_ID = "11111111-1111-1111-1111-111111111111";
const MEMBER_ID = "22222222-2222-2222-2222-222222222222";
const NEW_MEMBER_ID = "33333333-3333-3333-3333-333333333333";

const groupConversationRow: ChatConversationRow = {
  id: GROUP_ID,
  type: "group",
  title: "Crew",
  avatar_url: null,
  created_by: CREATOR_ID,
  archived_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const baseMembers: ChatConversationMemberRow[] = [
  {
    conversation_id: GROUP_ID,
    user_id: CREATOR_ID,
    role: "owner",
    invited_by: CREATOR_ID,
    joined_at: new Date().toISOString(),
    last_read_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    conversation_id: GROUP_ID,
    user_id: MEMBER_ID,
    role: "member",
    invited_by: CREATOR_ID,
    joined_at: new Date().toISOString(),
    last_read_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const userRow = (id: string, name: string): ChatParticipantRow => ({
  id,
  full_name: name,
  avatar_url: null,
  user_key: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockedRepo.fetchUsersByIds.mockImplementation(async (ids: string[]) =>
    ids.map((id) => userRow(id, id.toUpperCase())),
  );
  mockedRepo.getChatConversationById.mockResolvedValue(groupConversationRow);
  mockedRepo.listChatConversationMembers.mockResolvedValue(baseMembers);
  mockedRepo.upsertChatConversation.mockResolvedValue(groupConversationRow);
  mockedRepo.upsertChatConversationMembers.mockResolvedValue([]);
  mockedRepo.listChatMessages.mockResolvedValue([]);
  mockedRepo.listChatMessageReactions.mockResolvedValue([]);
  mockedRepo.findChatMessageById.mockResolvedValue(null);
  mockedRepo.upsertChatMessage.mockImplementation(async (row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    body: row.body,
    client_sent_at: row.client_sent_at ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
});

describe("chat service group flows", () => {
  it("creates a group conversation, persists membership, and emits a session event", async () => {
    mockedRepo.listChatConversationMembers.mockResolvedValue([
      ...baseMembers,
      {
        conversation_id: GROUP_ID,
        user_id: NEW_MEMBER_ID,
        role: "member",
        invited_by: CREATOR_ID,
        joined_at: new Date().toISOString(),
        last_read_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const result = await createGroupConversation({
      creatorId: CREATOR_ID,
      participantIds: [MEMBER_ID, NEW_MEMBER_ID],
      title: "Crew",
    });

    expect(mockedRepo.upsertChatConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: expect.stringMatching(/^chat:group:/) }),
    );
    expect(mockedRepo.upsertChatConversationMembers).toHaveBeenCalled();
    expect(result.session.type).toBe("group");
    expect(result.participants.map((participant) => participant.id)).toContain(NEW_MEMBER_ID);
    expect(mockedRealtime.publishSessionEvent).toHaveBeenCalled();
  });

  it("adds participants to a group conversation and emits a session update", async () => {
    mockedRepo.listChatConversationMembers
      .mockResolvedValueOnce([...baseMembers])
      .mockResolvedValueOnce([
        ...baseMembers,
        {
          conversation_id: GROUP_ID,
          user_id: NEW_MEMBER_ID,
          role: "member",
          invited_by: CREATOR_ID,
          joined_at: new Date().toISOString(),
          last_read_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    mockedRepo.upsertChatConversationMembers.mockResolvedValue([]);

    const result = await addParticipantsToGroupConversation({
      conversationId: GROUP_ID,
      actorId: CREATOR_ID,
      participantIds: [NEW_MEMBER_ID],
    });

    expect(mockedRepo.upsertChatConversationMembers).toHaveBeenCalledWith(
      GROUP_ID,
      expect.arrayContaining([
        expect.objectContaining({ user_id: NEW_MEMBER_ID }),
      ]),
    );
    expect(result.participants.map((participant) => participant.id)).toContain(NEW_MEMBER_ID);
    expect(mockedRealtime.publishSessionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: GROUP_ID }),
    );
  });

  it("renames a group conversation when performed by an owner", async () => {
    mockedRepo.updateChatConversation.mockResolvedValue({
      ...groupConversationRow,
      title: "New Crew",
    });

    const result = await renameGroupConversation({
      conversationId: GROUP_ID,
      actorId: CREATOR_ID,
      title: "New Crew",
    });

    expect(mockedRepo.updateChatConversation).toHaveBeenCalledWith(GROUP_ID, {
      title: "New Crew",
    });
    expect(result.session.title).toBe("New Crew");
    expect(mockedRealtime.publishSessionEvent).toHaveBeenCalled();
  });

  it("sends a group message and publishes a realtime payload", async () => {
    mockedRepo.findChatMessageById.mockResolvedValue({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      conversation_id: GROUP_ID,
      sender_id: CREATOR_ID,
      body: "hello",
      client_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } satisfies ChatMessageRow);

    const result = await sendGroupMessage({
      conversationId: GROUP_ID,
      senderId: CREATOR_ID,
      messageId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      body: "hello",
    });

    expect(mockedRepo.upsertChatMessage).toHaveBeenCalled();
    expect(result.session.type).toBe("group");
    expect(mockedRealtime.publishDirectMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: GROUP_ID,
        session: expect.objectContaining({ type: "group" }),
      }),
    );
  });

  it("retrieves group conversation history with session metadata", async () => {
    const messageRow: ChatMessageRow = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      conversation_id: GROUP_ID,
      sender_id: MEMBER_ID,
      body: "latest",
      client_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockedRepo.listChatMessages.mockResolvedValue([messageRow]);

    const history = await getGroupConversationHistory({
      conversationId: GROUP_ID,
      requesterId: CREATOR_ID,
    });

    expect(mockedRepo.listChatMessages).toHaveBeenCalledWith(GROUP_ID, expect.any(Object));
    expect(history.session.type).toBe("group");
    expect(history.messages).toHaveLength(1);
  });

  it("adds a reaction to a group message", async () => {
    const messageRow: ChatMessageRow = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      conversation_id: GROUP_ID,
      sender_id: MEMBER_ID,
      body: "latest",
      client_sent_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mockedRepo.findChatMessageById.mockResolvedValue(messageRow);
    mockedRepo.listChatMessageReactions.mockResolvedValue([
      {
        message_id: messageRow.id,
        user_id: CREATOR_ID,
        emoji: "🔥",
        created_at: new Date().toISOString(),
      } satisfies ChatMessageReactionRow,
    ]);

    const result = await addMessageReaction({
      conversationId: GROUP_ID,
      messageId: messageRow.id,
      emoji: "🔥",
      userId: CREATOR_ID,
    });

    expect(mockedRepo.upsertChatMessageReaction).toHaveBeenCalledWith({
      message_id: messageRow.id,
      user_id: CREATOR_ID,
      emoji: "🔥",
    });
    expect(result.reactions[0]?.emoji).toBe("🔥");
    expect(mockedRealtime.publishReactionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: GROUP_ID, emoji: "🔥" }),
    );
  });
});
