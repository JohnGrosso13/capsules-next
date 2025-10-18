import { z } from "zod";

export const intentResponseSchema = z.object({
  intent: z.enum(["generate", "post", "navigate", "style"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  source: z.enum(["heuristic", "ai", "none"]).optional(),
});
export type IntentResponse = z.infer<typeof intentResponseSchema>;

export const draftChoiceSchema = z.object({ key: z.string(), label: z.string() });

export const draftPostResponseSchema = z.object({
  action: z.literal("draft_post"),
  message: z.string().optional(),
  post: z.record(z.string(), z.unknown()),
  choices: z.array(draftChoiceSchema).optional(),
});
export type DraftPostResponse = z.infer<typeof draftPostResponseSchema>;

const variantMapSchema = z.record(z.string(), z.string());
const stylerVariantsSchema = z.object({
  light: variantMapSchema.optional(),
  dark: variantMapSchema.optional(),
});

export const stylerResponseSchema = z.object({
  status: z.literal("ok"),
  source: z.union([z.literal("heuristic"), z.literal("ai")]),
  summary: z.string(),
  variants: stylerVariantsSchema,
  details: z.string().optional(),
});
export type StylerResponse = z.infer<typeof stylerResponseSchema>;
