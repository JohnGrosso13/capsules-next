import { z } from "zod";

import {
  artifactBlockSchema,
  artifactContextSchema,
  artifactSchema,
  artifactStatusSchema,
  artifactTypeSchema,
} from "@/shared/schemas/artifacts";
import { requestUserEnvelopeSchema } from "./auth";

export const artifactMetadataSchema = z.record(z.string(), z.unknown());

export const artifactAssetSchema = z.object({
  blockId: z.string(),
  slotId: z.string(),
  r2Bucket: z.string().min(1),
  r2Key: z.string().min(1),
  contentType: z.string().nullable().optional(),
  descriptor: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const artifactAssetRecordSchema = artifactAssetSchema.extend({
  id: z.string(),
  artifactId: z.string().uuid(),
  createdAt: z.string(),
});

const createArtifactPayloadSchema = z.object({
  artifactType: artifactTypeSchema,
  title: z.string().min(1),
  description: z.string().optional(),
  metadata: artifactMetadataSchema.optional(),
  context: artifactContextSchema.optional(),
  blocks: z.array(artifactBlockSchema).optional(),
  templateId: z.string().uuid().optional(),
});

export const createArtifactRequestSchema = requestUserEnvelopeSchema.extend({
  artifact: createArtifactPayloadSchema,
});

export const createArtifactResponseSchema = z.object({
  artifact: artifactSchema,
  assets: z.array(artifactAssetRecordSchema),
});

const artifactPatchSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: artifactStatusSchema.optional(),
  metadata: artifactMetadataSchema.optional(),
  context: artifactContextSchema.optional(),
  blocks: z.array(artifactBlockSchema).optional(),
});

export const updateArtifactRequestSchema = requestUserEnvelopeSchema.extend({
  patch: artifactPatchSchema,
  assets: z.array(artifactAssetSchema).optional(),
  queueEmbedding: z.boolean().optional(),
});

export const updateArtifactResponseSchema = z.object({
  artifact: artifactSchema,
  assets: z.array(artifactAssetRecordSchema),
  conflict: z.boolean().optional(),
});

export const artifactIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const commitArtifactRequestSchema = requestUserEnvelopeSchema.extend({
  version: z.number().int().nonnegative(),
});

export const commitArtifactResponseSchema = z.object({
  artifact: artifactSchema,
  assets: z.array(artifactAssetRecordSchema),
});

export const listArtifactsResponseSchema = z.object({
  artifacts: z.array(artifactSchema),
});

export const getArtifactResponseSchema = z.object({
  artifact: artifactSchema,
  assets: z.array(artifactAssetRecordSchema),
});




