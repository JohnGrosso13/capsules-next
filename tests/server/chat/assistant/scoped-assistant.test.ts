import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createMessagingTask,
  getTaskConversationId,
  type MessagingTask,
} from "@/server/chat/assistant/tasks";
import { getScopedAssistantUserId, isAssistantUserId } from "@/shared/assistant/constants";
import type {
  AssistantTaskRow,
  AssistantTaskTargetRow,
  insertAssistantTask,
  insertAssistantTaskTargets,
} from "@/server/chat/assistant/repository";

type InsertAssistantTaskInput = Parameters<typeof insertAssistantTask>[0];
type InsertAssistantTaskTargetsInput = Parameters<typeof insertAssistantTaskTargets>[0];

const mocks = vi.hoisted(() => ({
  insertAssistantTask: vi.fn<(input: InsertAssistantTaskInput) => ReturnType<typeof insertAssistantTask>>(),
  insertAssistantTaskTargets: vi.fn<
    (rows: InsertAssistantTaskTargetsInput) => ReturnType<typeof insertAssistantTaskTargets>
  >(),
}));

vi.mock("@/server/chat/assistant/repository", async () => {
  const actual = await vi.importActual<typeof import("@/server/chat/assistant/repository")>(
    "@/server/chat/assistant/repository",
  );
  return {
    ...actual,
    insertAssistantTask: mocks.insertAssistantTask,
    insertAssistantTaskTargets: mocks.insertAssistantTaskTargets,
  };
});

function buildTaskRow(overrides: Partial<AssistantTaskRow>): AssistantTaskRow {
  return {
    id: overrides.id ?? "task-id",
    owner_user_id: overrides.owner_user_id ?? "owner",
    assistant_user_id: overrides.assistant_user_id ?? "assistant",
    kind: overrides.kind ?? "assistant_broadcast",
    status: overrides.status ?? "pending",
    prompt: overrides.prompt ?? "prompt",
    payload: overrides.payload ?? null,
    result: overrides.result ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    completed_at: overrides.completed_at ?? null,
  };
}

function buildTargetRows(payload: InsertAssistantTaskTargetsInput): AssistantTaskTargetRow[] {
  return payload.map((row, index) => ({
    id: `target-${index}`,
    task_id: row.taskId ?? "task-id",
    owner_user_id: row.ownerUserId ?? "owner",
    target_user_id: row.targetUserId ?? "recipient",
    conversation_id: row.conversationId ?? "conv",
    message_id: null,
    status: row.status ?? "pending",
    last_response_message_id: null,
    last_response_at: null,
    data: row.data ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}

describe("assistant scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses an owner-scoped assistant id for tasks and conversations", async () => {
    const ownerId = "owner-123";
    const recipientId = "friend-456";
    const scopedAssistantId = getScopedAssistantUserId(ownerId);

    let taskCounter = 0;
    mocks.insertAssistantTask.mockImplementation(async (input) => {
      taskCounter += 1;
      return buildTaskRow({
        id: `task-${taskCounter}`,
        owner_user_id: input.ownerUserId,
        assistant_user_id: input.assistantUserId ?? "",
        status: input.status ?? "pending",
        prompt: input.prompt ?? "",
        kind: input.kind,
        payload: input.payload ?? null,
      });
    });
    mocks.insertAssistantTaskTargets.mockImplementation(async (rows) => buildTargetRows(rows));

    const result = (await createMessagingTask({
      ownerUserId: ownerId,
      kind: "assistant_broadcast",
      prompt: "Hello there",
      recipients: [{ userId: recipientId, name: "Friend" }],
    })) as MessagingTask;

    expect(mocks.insertAssistantTask).toHaveBeenCalled();
    const firstTaskCall = mocks.insertAssistantTask.mock.calls[0]?.[0];
    const secondTaskCall = mocks.insertAssistantTask.mock.calls[1]?.[0];
    expect(firstTaskCall?.assistantUserId).toBe(scopedAssistantId);
    expect(secondTaskCall?.assistantUserId).toBe(scopedAssistantId);

    expect(result.targets[0]?.conversation_id).toBe(
      getTaskConversationId(recipientId, scopedAssistantId),
    );
    // Mirror target should also live in the scoped assistant conversation for the recipient.
    expect(mocks.insertAssistantTaskTargets.mock.calls[0]?.[0][0]?.conversationId).toBe(
      getTaskConversationId(recipientId, scopedAssistantId),
    );
  });

  it("recognizes scoped assistant ids as assistant participants", () => {
    const base = isAssistantUserId("26c6d7b6-b15d-4e0e-9d11-5c457769278e");
    const scoped = isAssistantUserId("26c6d7b6-b15d-4e0e-9d11-5c457769278e-owner-owner-123");
    expect(base).toBe(true);
    expect(scoped).toBe(true);
  });
});
