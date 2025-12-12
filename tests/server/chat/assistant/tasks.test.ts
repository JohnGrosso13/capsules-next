import { describe, expect, it, beforeEach, vi } from "vitest";

import { removeAssistantTask } from "@/server/chat/assistant/tasks";
import * as repository from "@/server/chat/assistant/repository";
import type { AssistantTaskRow } from "@/server/chat/assistant/repository";

vi.mock("@/server/chat/assistant/repository", () => ({
  getAssistantTaskById: vi.fn(),
  listTaskTargetsByTask: vi.fn(),
  deleteTaskTargetsByTask: vi.fn(),
  deleteAssistantTask: vi.fn(),
}));

function buildTaskRow(overrides: Partial<AssistantTaskRow> = {}): AssistantTaskRow {
  return {
    id: "task-1",
    owner_user_id: "owner-1",
    assistant_user_id: "assistant",
    kind: "kind",
    status: "completed",
    prompt: null,
    payload: null,
    result: null,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    completed_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("removeAssistantTask", () => {
  const mocks = vi.mocked(repository);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the task does not exist", async () => {
    mocks.getAssistantTaskById.mockResolvedValue(null);

    const result = await removeAssistantTask({ ownerUserId: "owner-1", taskId: "missing" });

    expect(result).toEqual({ ok: false, status: 404, error: "Task not found" });
    expect(mocks.listTaskTargetsByTask).not.toHaveBeenCalled();
  });

  it("guards against deleting tasks owned by someone else", async () => {
    mocks.getAssistantTaskById.mockResolvedValue(
      buildTaskRow({ owner_user_id: "someone-else", status: "completed" }),
    );

    const result = await removeAssistantTask({ ownerUserId: "owner-1", taskId: "task-1" });

    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(mocks.deleteAssistantTask).not.toHaveBeenCalled();
  });

  it("refuses to remove active tasks", async () => {
    mocks.getAssistantTaskById.mockResolvedValue(buildTaskRow({ status: "pending" }));

    const result = await removeAssistantTask({ ownerUserId: "owner-1", taskId: "task-1" });

    expect(result).toEqual({ ok: false, status: 400, error: "Task is still active" });
    expect(mocks.deleteAssistantTask).not.toHaveBeenCalled();
  });

  it("removes finalized tasks and their targets", async () => {
    mocks.getAssistantTaskById.mockResolvedValue(buildTaskRow({ status: "completed" }));
    mocks.listTaskTargetsByTask.mockResolvedValue([
      {
        id: "t1",
        task_id: "task-1",
        owner_user_id: "owner-1",
        target_user_id: "target-1",
        conversation_id: "conv-1",
        message_id: null,
        status: "completed",
        last_response_message_id: null,
        last_response_at: null,
        data: null,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
      {
        id: "t2",
        task_id: "task-1",
        owner_user_id: "owner-1",
        target_user_id: "target-2",
        conversation_id: "conv-2",
        message_id: null,
        status: "canceled",
        last_response_message_id: null,
        last_response_at: null,
        data: null,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ]);
    mocks.deleteTaskTargetsByTask.mockResolvedValue(2);
    mocks.deleteAssistantTask.mockResolvedValue(1);

    const result = await removeAssistantTask({ ownerUserId: "owner-1", taskId: "task-1" });

    expect(result).toEqual({ ok: true, taskId: "task-1", removedTargets: 2 });
    expect(mocks.deleteTaskTargetsByTask).toHaveBeenCalledWith({
      taskId: "task-1",
      ownerUserId: "owner-1",
    });
    expect(mocks.deleteAssistantTask).toHaveBeenCalledWith({
      id: "task-1",
      ownerUserId: "owner-1",
    });
  });
});
