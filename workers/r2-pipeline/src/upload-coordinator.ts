import type { DurableObjectState } from "@cloudflare/workers-types";

import {
  type DerivedAssetRecord,
  type Env,
  type ProcessingTask,
  type ProcessingTaskMessage,
  type UploadEventMessage,
  type CoordinatorState,
} from "./types";

const STORAGE_KEY = "state";

type ProcessingMetadata = Record<string, unknown>;

function readProcessingMetadata(
  metadata: Record<string, unknown> | null | undefined,
): ProcessingMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const processing = (metadata as { processing?: unknown }).processing;
  if (!processing || typeof processing !== "object") return null;
  return processing as ProcessingMetadata;
}

function mergeProcessingStatus(
  metadata: Record<string, unknown> | null,
  updates: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return metadata ?? null;
  const processing = readProcessingMetadata(metadata) ?? {};
  const nextProcessing = { ...processing, ...updates };
  return { ...metadata, processing: nextProcessing };
}

function applyProcessingStatus(
  metadata: Record<string, unknown> | null,
  status: "queued" | "running" | "completed" | "failed" | "skipped",
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return metadata ?? null;
  const processing = readProcessingMetadata(metadata) ?? {};
  const now = new Date().toISOString();
  const nextProcessing: Record<string, unknown> = { ...processing, status };

  if (status === "queued" && !processing.queued_at) {
    nextProcessing.queued_at = now;
  }
  if (status === "running") {
    if (!processing.started_at) nextProcessing.started_at = now;
    nextProcessing.last_activity_at = now;
  }
  if (status === "completed") {
    nextProcessing.completed_at = now;
    nextProcessing.required = false;
  }
  if (status === "failed") {
    nextProcessing.failed_at = now;
  }
  if (status === "skipped") {
    nextProcessing.completed_at = now;
    nextProcessing.required = false;
  }

  return { ...metadata, processing: nextProcessing };
}

function dedupeTasks(tasks: ProcessingTask[]): ProcessingTask[] {
  const unique = new Map<string, ProcessingTask>();
  for (const task of tasks) {
    unique.set(taskId(task), task);
  }
  return Array.from(unique.values());
}

function ensureSafetyTask(tasks: ProcessingTask[]): ProcessingTask[] {
  const hasSafety = tasks.some((task) => task.kind === "safety.scan");
  if (!hasSafety) {
    tasks.push({ kind: "safety.scan" });
  }
  return dedupeTasks(tasks);
}

function normalizeTask(kind: string): ProcessingTask | null {
  switch (kind) {
    case "document.extract-text":
      return { kind: "document.extract-text" };
    case "document.preview":
      return { kind: "document.preview" };
    case "safety.scan":
      return { kind: "safety.scan" };
    default:
      return null;
  }
}

function buildTasksFromMetadata(metadata: Record<string, unknown> | null): ProcessingTask[] {
  const processing = readProcessingMetadata(metadata);
  if (!processing) return [];
  const raw = processing.tasks;
  if (!Array.isArray(raw)) return [];
  const tasks: ProcessingTask[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !entry.trim().length) continue;
    const task = normalizeTask(entry.trim());
    if (task) tasks.push(task);
  }
  return dedupeTasks(tasks);
}

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
  const metadataTasks = buildTasksFromMetadata(event.metadata as Record<string, unknown> | null);
  if (metadataTasks.length) {
    return ensureSafetyTask(metadataTasks);
  }

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
  if (
    contentType.includes("pdf") ||
    contentType.includes("msword") ||
    contentType.includes("presentation") ||
    contentType.includes("document")
  ) {
    return ensureSafetyTask([{ kind: "document.extract-text" }, { kind: "document.preview" }]);
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
      state.metadata = applyProcessingStatus(state.metadata, tasks.length ? "queued" : "skipped");
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

    if (messages.length) {
      state.metadata = applyProcessingStatus(state.metadata, "running");
      await this.saveState(state);
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
      case "document.extract-text":
        return { kind: "document.extract-text" };
      case "document.preview":
        return { kind: "document.preview" };
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

    if (derived?.type === "safety.scan" && derived.metadata && typeof derived.metadata === "object") {
      const safety = derived.metadata as Record<string, unknown>;
      const baseMeta =
        state.metadata && typeof state.metadata === "object" && !Array.isArray(state.metadata)
          ? { ...state.metadata }
          : {};
      baseMeta.safety_scan = safety;
      const processingUpdates: Record<string, unknown> = {};
      const decision = (safety as { decision?: unknown }).decision;
      const scannedAt = (safety as { scanned_at?: unknown }).scanned_at;
      if (typeof decision === "string") {
        processingUpdates.safety_decision = decision;
      }
      if (typeof scannedAt === "string") {
        processingUpdates.safety_scanned_at = scannedAt;
      }
      state.metadata = mergeProcessingStatus(baseMeta, processingUpdates);
    }

    const now = new Date().toISOString();
    if (error) {
      state.metadata = mergeProcessingStatus(state.metadata, {
        last_error: error,
        last_activity_at: now,
      });
      state.metadata = applyProcessingStatus(state.metadata, "failed");
    } else if (this.allTasksComplete(state)) {
      state.completedAt = now;
      state.metadata = applyProcessingStatus(state.metadata, "completed");
    } else {
      state.metadata = mergeProcessingStatus(state.metadata, {
        last_activity_at: now,
      });
      state.metadata = applyProcessingStatus(state.metadata, "running");
    }

    await this.saveState(state);

    if (!error && this.allTasksComplete(state)) {
      await this.notifyCompletion(state);
    }

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
