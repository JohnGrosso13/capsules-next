import { z } from "zod";

import {
  ARTIFACT_STATUSES,
  ARTIFACT_TYPES,
  BLOCK_TYPES,
  SLOT_KINDS,
  SLOT_STATUSES,
  type ActionSlotValue,
  type Artifact,
  type ArtifactBlock,
  type ArtifactSlot,
  type BlockAnnotation,
  type BlockState,
  type CollectionSlotValue,
  type DataSlotValue,
  type MediaSlotValue,
  type PollSlotValue,
  type SlotValue,
  type TextSlotValue,
} from "@/shared/types/artifacts";

export const artifactTypeSchema = z.enum(ARTIFACT_TYPES);
export const artifactStatusSchema = z.enum(ARTIFACT_STATUSES);
export const blockTypeSchema = z.enum(BLOCK_TYPES);
export const slotKindSchema = z.enum(SLOT_KINDS);
export const slotStatusSchema = z.enum(SLOT_STATUSES);

export const textSlotValueSchema: z.ZodType<TextSlotValue> = z.object({
  kind: z.literal("text"),
  content: z.string(),
  format: z.enum(["plain", "markdown", "html"]).optional(),
  summary: z.string().nullable().optional(),
  keywords: z.array(z.string()).nullable().optional(),
});

export const mediaSlotValueSchema: z.ZodType<MediaSlotValue> = z.object({
  kind: z.literal("media"),
  url: z.string(),
  thumbUrl: z.string().nullable().optional(),
  posterUrl: z.string().nullable().optional(),
  altText: z.string().nullable().optional(),
  descriptors: z.record(z.unknown()).nullable().optional(),
});

export const pollSlotValueSchema: z.ZodType<PollSlotValue> = z.object({
  kind: z.literal("poll"),
  prompt: z.string(),
  options: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string().nullable().optional(),
    }),
  ),
  settings: z.record(z.unknown()).nullable().optional(),
});

export const dataSlotValueSchema: z.ZodType<DataSlotValue> = z.object({
  kind: z.literal("data"),
  schema: z.record(z.unknown()),
  values: z.record(z.unknown()).nullable().optional(),
});

export const actionSlotValueSchema: z.ZodType<ActionSlotValue> = z.object({
  kind: z.literal("action"),
  label: z.string(),
  url: z.string().nullable().optional(),
  meta: z.record(z.unknown()).nullable().optional(),
});

export const collectionSlotValueSchema: z.ZodType<CollectionSlotValue> = z.lazy(() =>
  z.object({
    kind: z.literal("collection"),
    items: z.array(slotValueLazySchema),
    layout: z.string().nullable().optional(),
  }),
);

const slotValueLazySchema: z.ZodType<SlotValue> = z.lazy(() =>
  z.union([
    textSlotValueSchema,
    mediaSlotValueSchema,
    pollSlotValueSchema,
    dataSlotValueSchema,
    actionSlotValueSchema,
    collectionSlotValueSchema,
  ]),
);

export const slotProvenanceSchema = z.object({
  source: z.enum(["ai", "user", "upload", "template", "external"]),
  promptId: z.string().nullable().optional(),
  assetId: z.string().nullable().optional(),
  templateId: z.string().nullable().optional(),
  generator: z.string().nullable().optional(),
  costCents: z.number().nullable().optional(),
  createdAt: z.string().nullable().optional(),
});

export const slotConstraintsSchema = z.object({
  maxLength: z.number().int().positive().optional(),
  minLength: z.number().int().nonnegative().optional(),
  allowedKinds: z.array(slotKindSchema).optional(),
  disallowedKinds: z.array(slotKindSchema).optional(),
  aspectRatio: z.string().nullable().optional(),
  contentTypes: z.array(z.string()).optional(),
});

export const artifactSlotSchema: z.ZodType<ArtifactSlot> = z.object({
  id: z.string(),
  kind: slotKindSchema,
  status: slotStatusSchema,
  value: slotValueLazySchema.optional(),
  provenance: slotProvenanceSchema.optional(),
  constraints: slotConstraintsSchema.optional(),
  draftId: z.string().nullable().optional(),
});

export const blockStateSchema: z.ZodType<BlockState> = z.object({
  mode: z.enum(["active", "suggested", "archived", "deleted"]),
  locked: z.boolean().optional(),
  lastEditedBy: z.string().nullable().optional(),
  lastEditedAt: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
});

export const blockAnnotationSchema: z.ZodType<BlockAnnotation> = z.object({
  label: z.string(),
  kind: z.enum(["diff", "comment", "branch", "rollback"]),
  payload: z.record(z.unknown()).optional(),
});

export const artifactBlockSchema: z.ZodType<ArtifactBlock> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: blockTypeSchema,
    label: z.string().optional(),
    state: blockStateSchema,
    slots: z.record(artifactSlotSchema),
    children: z.array(artifactBlockSchema).optional(),
    annotations: z.array(blockAnnotationSchema).optional(),
  }),
);

export const artifactContextSchema = z.object({
  relatedArtifactIds: z.array(z.string()).optional(),
  relatedAssetIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().nullable().optional(),
  lastPromptId: z.string().nullable().optional(),
});

export const artifactSchema: z.ZodType<Artifact> = z.object({
  id: z.string(),
  ownerUserId: z.string(),
  artifactType: artifactTypeSchema,
  status: artifactStatusSchema,
  title: z.string(),
  description: z.string().nullable().optional(),
  version: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()),
  blocks: z.array(artifactBlockSchema),
  context: artifactContextSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  committedAt: z.string().nullable().optional(),
});

export type ArtifactSchemaType = z.infer<typeof artifactSchema>;
