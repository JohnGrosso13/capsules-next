export type UploadEventMessage = {
  type: "upload.completed";
  sessionId: string | null;
  uploadId: string;
  ownerId: string | null;
  key: string;
  bucket: string;
  contentType: string | null;
  metadata?: Record<string, unknown> | null;
  absoluteUrl?: string | null;
};

export type ProcessingTask =
  | {
      kind: "image.thumbnail" | "image.preview";
      width: number;
      height?: number;
    }
  | {
      kind: "video.transcode";
    }
  | {
      kind: "video.thumbnail";
      second?: number;
    }
  | {
      kind: "video.audio";
    }
  | {
      kind: "video.transcript";
    }
  | {
      kind: "document.extract-text";
    }
  | {
      kind: "document.preview";
    }
  | {
      kind: "safety.scan";
    };

export type ProcessingTaskMessage = {
  type: "task";
  sessionId: string | null;
  uploadId: string;
  ownerId: string | null;
  key: string;
  bucket: string;
  contentType: string | null;
  metadata?: Record<string, unknown> | null;
  task: ProcessingTask;
};

export type DerivedAssetRecord = {
  type: string;
  key: string;
  url: string;
  metadata?: Record<string, unknown> | null;
};

export interface Env {
  R2_BUCKET: R2Bucket;
  UPLOAD_SESSIONS_KV: KVNamespace;
  UPLOAD_COORDINATOR: DurableObjectNamespace;
  UPLOAD_EVENTS_QUEUE: Queue<UploadEventMessage>;
  PROCESSING_QUEUE: Queue<ProcessingTaskMessage>;
  PUBLIC_MEDIA_BASE_URL: string;
  IMAGE_RESIZE_BASE_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CF_ACCOUNT_ID: string;
  CF_STREAM_API_TOKEN?: string;
  CF_AI_TOKEN?: string;
}

export type CoordinatorState = {
  sessionId: string | null;
  uploadId: string;
  key: string;
  bucket: string;
  ownerId: string | null;
  contentType: string | null;
  metadata: Record<string, unknown> | null;
  tasks: Record<string, { status: "pending" | "completed" | "failed"; error?: string | null }>;
  derived: DerivedAssetRecord[];
  createdAt: string;
  completedAt?: string;
};
import type {
  DurableObjectNamespace,
  KVNamespace,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types";
