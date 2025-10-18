import {
  insertArtifactEvent,
  insertArtifactRow,
  selectArtifactAssets,
  selectArtifactById,
  selectArtifactWithAssets,
  selectArtifactsByOwner,
  updateArtifactRow,
  upsertArtifactAssets,
  markArtifactCommitted,
} from "./repository";
import type {
  ArtifactAssetInput,
  ArtifactAssetRecord,
  ArtifactEventInput,
  ArtifactPatchInput,
  ArtifactRecord,
  ArtifactWithAssets,
  CreateArtifactInput,
} from "./types";
import { serverEnv } from "@/lib/env/server";

export class ArtifactVersionConflictError extends Error {
  constructor(message = "Artifact version conflict") {
    super(message);
    this.name = "ArtifactVersionConflictError";
  }
}

export async function createArtifact(input: CreateArtifactInput): Promise<ArtifactWithAssets> {
  const artifact = await insertArtifactRow(input);
  if (input.templateId) {
    await insertArtifactEvent({
      artifactId: artifact.id,
      eventType: "artifact.created",
      origin: "system",
      payload: { templateId: input.templateId },
    });
  }
  return { ...artifact, assets: [] };
}

export async function getArtifactWithAssets(
  artifactId: string,
): Promise<ArtifactWithAssets | null> {
  return selectArtifactWithAssets(artifactId);
}

export async function listArtifactsForOwner(ownerUserId: string): Promise<ArtifactRecord[]> {
  return selectArtifactsByOwner(ownerUserId);
}

export type ApplyArtifactPatchOptions = {
  assets?: ArtifactAssetInput[];
  event?: Omit<ArtifactEventInput, "artifactId">;
  queueEmbedding?: boolean;
};

export async function applyArtifactPatch(
  artifactId: string,
  patch: ArtifactPatchInput,
  options: ApplyArtifactPatchOptions = {},
): Promise<ArtifactWithAssets | null> {
  const updated = await updateArtifactRow(artifactId, patch);
  if (!updated) {
    const existing = await selectArtifactById(artifactId);
    if (existing) {
      throw new ArtifactVersionConflictError();
    }
    return null;
  }

  let assets: ArtifactAssetRecord[] = await selectArtifactAssets(artifactId);
  if (options.assets && options.assets.length) {
    await upsertArtifactAssets(options.assets);
    assets = await selectArtifactAssets(artifactId);
  }

  if (options.event) {
    await insertArtifactEvent({
      artifactId,
      eventType: options.event.eventType,
      payload: options.event.payload ?? {},
      origin: options.event.origin ?? "system",
    });
  }

  if (options.queueEmbedding) {
    await queueArtifactEmbedding({ artifactId, version: updated.version, reason: "patch" });
  }

  return { ...updated, assets };
}

export async function recordArtifactEvent(event: ArtifactEventInput): Promise<void> {
  await insertArtifactEvent(event);
}

export async function registerArtifactAssets(
  assets: ArtifactAssetInput[],
): Promise<ArtifactAssetRecord[]> {
  if (!assets.length) return [];
  return upsertArtifactAssets(assets);
}

export async function commitArtifact(
  artifactId: string,
  version: number,
  options: { eventPayload?: Record<string, unknown> } = {},
): Promise<ArtifactWithAssets | null> {
  const committed = await markArtifactCommitted(artifactId, version);
  if (!committed) {
    const existing = await selectArtifactById(artifactId);
    if (existing) {
      throw new ArtifactVersionConflictError();
    }
    return null;
  }
  await insertArtifactEvent({
    artifactId,
    eventType: "artifact.commit",
    origin: "system",
    payload: { version, ...(options.eventPayload ?? {}) },
  });
  await queueArtifactEmbedding({ artifactId, version: committed.version, reason: "commit" });
  const assets = await selectArtifactAssets(artifactId);
  return { ...committed, assets };
}

type ArtifactEmbeddingJob = {
  artifactId: string;
  version: number;
  reason: "patch" | "commit" | "backfill";
};

async function queueArtifactEmbedding(job: ArtifactEmbeddingJob): Promise<void> {
  const queueName = process.env.ARTIFACT_EMBEDDING_QUEUE ?? serverEnv.ARTIFACT_EMBEDDING_QUEUE;
  const apiToken = serverEnv.CLOUDFLARE_API_TOKEN;
  if (!queueName || !apiToken) {
    console.warn("artifact embedding queue not configured; skipping job", job);
    return;
  }
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${serverEnv.R2_ACCOUNT_ID}/queues/${queueName}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ messages: [{ body: job }] }),
      },
    );
    if (!response.ok) {
      const text = await response.text();
      console.warn("failed to enqueue artifact embedding job", response.status, text);
    }
  } catch (error) {
    console.error("artifact embedding queue error", error);
  }
}

export async function queueArtifactCommitEmbedding(
  artifactId: string,
  version: number,
): Promise<void> {
  await queueArtifactEmbedding({ artifactId, version, reason: "commit" });
}
