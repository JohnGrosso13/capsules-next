import { z } from "zod";

const variantRecordSchema = z.object({
  id: z.string(),
  runId: z.string().nullable(),
  assetKind: z.string(),
  branchKey: z.string(),
  version: z.number().int().min(1),
  imageUrl: z.string(),
  thumbUrl: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  parentVariantId: z.string().nullable(),
  createdAt: z.string(),
});

export const customizerModeSchema = z.enum(["banner", "storeBanner", "tile", "logo", "avatar"]);

export const customizerAssetSchema = z.object({
  kind: z.enum(["banner", "logo", "avatar"]).optional(),
  url: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  variantId: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
  imageData: z.string().optional().nullable(),
  variant: variantRecordSchema.optional().nullable(),
});

export const customizerDraftSchema = z.object({
  mode: customizerModeSchema,
  asset: customizerAssetSchema.optional().nullable(),
  suggestions: z.array(z.string()).optional(),
  status: z.string().optional().nullable(),
});

export type CustomizerDraft = z.infer<typeof customizerDraftSchema>;
export type CustomizerDraftAsset = z.infer<typeof customizerAssetSchema>;
