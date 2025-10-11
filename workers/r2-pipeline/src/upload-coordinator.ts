import type { DurableObjectState } from "@cloudflare/workers-types";

import {
  DerivedAssetRecord,
  Env,
  ProcessingTask,
  ProcessingTaskMessage,
  UploadEventMessage,
  CoordinatorState,
} from "./types";

const STORAGE_KEY = "state";

function taskId(task: ProcessingTask): string {
  switch (task.kind) {
    case "image.thumbnail":
    case "image.preview":
      return `${task.kind}:${task.width}x${task.height ?? 0}`;
    default:
      return task.kind;
  }
}

function buildTasks(event: UploadEventMessage): ProcessingTask[] {
  const { contentType } = event;
  if (!contentType) {
    return [{ kind: "safety.scan" }];
  }
  if (contentType.startsWith("image/")) {
    return [
      { kind: "image.thumbnail", width: 512 },
      { kind: "image.preview", width: 1280 },
      { kind: "safety.scan" },
    ];
  }
  if (contentType.startsWith("video/")) {
    return [
      { kind: "video.transcode" },
      { kind: "video.thumbnail", second: 1 },
      { kind: "video.audio" },
      { kind: "video.transcript" },
      { kind: "safety.scan" },
    ];
  }
  if (contentType.startsWith("audio/")) {
    return [{ kind: "video.audio" }, { kind: "video.transcript" }, { kind: "safety.scan" }];
  }
  return [{ kind: "safety.scan" }];
}

export class UploadCoordinator {
  private state: DurableObjectState;
  private env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/state") {
      const state = await this.getState();
      return new Response(JSON.stringify(state), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/process") {
      const body = (await request.json()) as { event: UploadEventMessage };
      const { event } = body;
      if (!event) return new Response("event required", { status: 400 });
      const result = await this.processEvent(event);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/task-complete") {
      const body = (await request.json()) as {
        task: ProcessingTask;
        error?: string | null;
        derived?: DerivedAssetRecord | null;
      };
      const { task, error, derived } = body;
      if (!task) return new Response("task required", { status: 400 });
      const state = await this.markTask(task, derived ?? null, error ?? null);
      return new Response(JSON.stringify({ state }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  private async getState(): Promise<CoordinatorState | null> {
    const stored = (await this.state.storage.get<CoordinatorState>(STORAGE_KEY)) ?? null;
    return stored;
  }

  private async saveState(state: CoordinatorState): Promise<void> {
    await this.state.storage.put(STORAGE_KEY, state);
  }

  private async processEvent(event: UploadEventMessage): Promise<{
    state: CoordinatorState;
    tasks: ProcessingTaskMessage[];
  }> {
    let state = await this.getState();
    if (!state) {
      const tasks = buildTasks(event);
      const taskMap: CoordinatorState["tasks"] = {};
      for (const task of tasks) {
        taskMap[taskId(task)] = { status: "pending" };
      }
      state = {
        sessionId: event.sessionId,
        uploadId: event.uploadId,
        key: event.key,
        bucket: event.bucket,
        ownerId: event.ownerId,
        contentType: event.contentType,
        metadata: (event.metadata ?? null) as Record<string, unknown> | null,
        tasks: taskMap,
        derived: [],
        createdAt: new Date().toISOString(),
      };
      await this.saveState(state);
    }

    const messages: ProcessingTaskMessage[] = [];
    for (const [id, info] of Object.entries(state.tasks)) {
      if (info.status !== "pending") continue;
      const task = this.rehydrateTask(id);
      if (!task) continue;
      messages.push({
        type: "task",
        sessionId: state.sessionId,
        uploadId: state.uploadId,
        ownerId: state.ownerId,
        key: state.key,
        bucket: state.bucket,
        contentType: state.contentType,
        metadata: state.metadata,
        task,
      });
    }

    return { state, tasks: messages };
  }

  private rehydrateTask(id: string): ProcessingTask | null {
    const [kind, rest] = id.split(":");
    switch (kind) {
      case "image.thumbnail":
      case "image.preview": {
        const [widthStr, heightStr] = (rest ?? "0x0").split("x");
        const width = Number(widthStr) || 0;
        const heightValue = Number(heightStr) || 0;
        const task: Extract<ProcessingTask, { kind: "image.thumbnail" | "image.preview" }> = {
          kind: kind as "image.thumbnail" | "image.preview",
          width,
        };
        if (heightValue > 0) {
          task.height = heightValue;
        }
        return task;
      }
      case "video.thumbnail":
        return { kind: "video.thumbnail", second: 1 };
      case "video.transcode":
        return { kind: "video.transcode" };
      case "video.audio":
        return { kind: "video.audio" };
      case "video.transcript":
        return { kind: "video.transcript" };
      case "safety.scan":
        return { kind: "safety.scan" };
      default:
        return null;
    }
  }

  private async markTask(
    task: ProcessingTask,
    derived: DerivedAssetRecord | null,
    error: string | null,
  ): Promise<CoordinatorState> {
    const state = (await this.getState()) ?? null;
    if (!state) throw new Error("Coordinator state missing");
    const id = taskId(task);
    const existing = state.tasks[id];
    if (!existing) {
      state.tasks[id] = { status: error ? "failed" : "completed", error };
    } else {
      state.tasks[id] = {
        status: error ? "failed" : "completed",
        error: error ?? null,
      };
    }

    if (derived) {
      const exists = state.derived.some((entry) => entry.key === derived.key);
      if (!exists) state.derived.push(derived);
    }

    if (!error && this.allTasksComplete(state)) {
      state.completedAt = new Date().toISOString();
      await this.notifyCompletion(state);
    }

    await this.saveState(state);
    return state;
  }

  private allTasksComplete(state: CoordinatorState): boolean {
    return Object.values(state.tasks).every((entry) => entry.status === "completed");
  }

  private async notifyCompletion(state: CoordinatorState) {
    if (!this.env.SUPABASE_URL || !this.env.SUPABASE_SERVICE_ROLE_KEY || !state.sessionId) return;
    try {
      const res = await fetch(
        `${this.env.SUPABASE_URL}/rest/v1/media_upload_sessions?id=eq.${state.sessionId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=minimal",
            apikey: this.env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            status: "completed",
            completed_at: new Date().toISOString(),
            metadata: state.metadata,
            derived_assets: state.derived,
          }),
        },
      );
      if (!res.ok) {
        console.warn("supabase status update failed", await res.text());
      }
    } catch (error) {
      console.warn("supabase notify error", error);
    }
  }
}
