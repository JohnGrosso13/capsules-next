import type {
  Artifact,
  ArtifactBlock,
  ArtifactStatus,
  ArtifactType,
} from "@/shared/types/artifacts";

export type CreateArtifactInput = {
  ownerUserId: string;
  artifactType: ArtifactType;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: Artifact["context"];
  blocks?: ArtifactBlock[];
  templateId?: string | null;
};

export type ArtifactPatchInput = {
  expectedVersion: number;
  title?: string;
  description?: string | null;
  status?: ArtifactStatus;
  metadata?: Record<string, unknown> | null;
  blocks?: ArtifactBlock[];
  context?: Artifact["context"];
};

export type ArtifactRecord = Artifact;

export type ArtifactAssetInput = {
  artifactId: string;
  blockId: string;
  slotId: string;
  r2Bucket: string;
  r2Key: string;
  contentType?: string | null;
  descriptor?: Record<string, unknown> | null;
};

export type ArtifactAssetRecord = ArtifactAssetInput & {
  id: string;
  createdAt: string;
};

export type ArtifactEventInput = {
  artifactId: string;
  eventType: string;
  payload: Record<string, unknown>;
  origin: "local" | "remote" | "system";
};

export type ArtifactEventRecord = ArtifactEventInput & {
  id: string;
  emittedAt: string;
};

export type ArtifactWithAssets = ArtifactRecord & {
  assets: ArtifactAssetRecord[];
};
