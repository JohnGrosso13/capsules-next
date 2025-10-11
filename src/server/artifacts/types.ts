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
  description?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  context?: Artifact["context"] | undefined;
  blocks?: ArtifactBlock[] | undefined;
  templateId?: string | null | undefined;
};

export type ArtifactPatchInput = {
  expectedVersion: number;
  title?: string | undefined;
  description?: string | null | undefined;
  status?: ArtifactStatus | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  blocks?: ArtifactBlock[] | undefined;
  context?: Artifact["context"] | undefined;
};

export type ArtifactRecord = Artifact;

export type ArtifactAssetInput = {
  artifactId: string;
  blockId: string;
  slotId: string;
  r2Bucket: string;
  r2Key: string;
  contentType?: string | null | undefined;
  descriptor?: Record<string, unknown> | null | undefined;
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
