import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { CapsuleMembershipError } from "@/server/capsules/service";
import {
  publishCapsuleHistorySection,
  addCapsuleHistoryPin,
  removeCapsuleHistoryPin,
  addCapsuleHistoryExclusion,
  removeCapsuleHistoryExclusion,
  updateCapsuleHistorySectionSettings,
  updateCapsuleHistoryPromptSettings,
  refineCapsuleHistorySection,
} from "@/server/capsules/service";
import { returnError } from "@/server/validation/http";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

const contentBlockSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceIds: z.array(z.string()),
  pinned: z.boolean().optional().default(false),
  pinId: z.string().nullable().optional().default(null),
  note: z.string().nullable().optional().default(null),
  metadata: z.record(z.string(), z.unknown()).nullable().optional().default(null),
});

const timelineItemSchema = contentBlockSchema.extend({
  label: z.string(),
  detail: z.string(),
  timestamp: z.string().nullable(),
  postId: z.string().nullable().optional().default(null),
  permalink: z.string().nullable().optional().default(null),
});

const sectionContentSchema = z.object({
  summary: contentBlockSchema,
  highlights: z.array(contentBlockSchema),
  timeline: z.array(timelineItemSchema),
  nextFocus: z.array(contentBlockSchema),
});

const coverageMetricSchema = z.object({
  id: z.string(),
  label: z.string(),
  covered: z.boolean(),
  weight: z.number(),
});

const coverageSchema = z.object({
  completeness: z.number(),
  authors: z.array(coverageMetricSchema),
  themes: z.array(coverageMetricSchema),
  timeSpans: z.array(coverageMetricSchema),
});

const promptMemorySchema = z.object({
  guidelines: z.array(z.string()),
  tone: z.string().nullable(),
  mustInclude: z.array(z.string()),
  autoLinkTopics: z.array(z.string()),
});

const templateSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  tone: z.string().nullable(),
});

const publishActionSchema = z.object({
  action: z.literal("publish_section"),
  period: z.enum(["weekly", "monthly", "all_time"]),
  content: sectionContentSchema,
  title: z.string().optional(),
  timeframe: z
    .object({
      start: z.string().nullable(),
      end: z.string().nullable(),
    })
    .optional(),
  postCount: z.number().optional(),
  notes: z.string().optional(),
  templateId: z.string().nullable().optional(),
  toneRecipeId: z.string().nullable().optional(),
  reason: z.string().optional(),
  promptOverrides: z.record(z.string(), z.unknown()).optional(),
  coverage: coverageSchema.optional(),
});

const addPinActionSchema = z.object({
  action: z.literal("add_pin"),
  period: z.enum(["weekly", "monthly", "all_time"]),
  type: z.enum(["summary", "highlight", "timeline", "next_focus"]),
  postId: z.string().nullable().optional(),
  quote: z.string().nullable().optional(),
  source: z.record(z.string(), z.unknown()).optional(),
  rank: z.number().optional(),
  reason: z.string().optional(),
});

const removePinActionSchema = z.object({
  action: z.literal("remove_pin"),
  period: z.enum(["weekly", "monthly", "all_time"]).optional(),
  pinId: z.string(),
  reason: z.string().optional(),
});

const addExclusionActionSchema = z.object({
  action: z.literal("add_exclusion"),
  period: z.enum(["weekly", "monthly", "all_time"]),
  postId: z.string(),
  reason: z.string().optional(),
});

const removeExclusionActionSchema = z.object({
  action: z.literal("remove_exclusion"),
  period: z.enum(["weekly", "monthly", "all_time"]),
  postId: z.string(),
  reason: z.string().optional(),
});

const updateSettingsActionSchema = z.object({
  action: z.literal("update_settings"),
  period: z.enum(["weekly", "monthly", "all_time"]),
  notes: z.string().optional(),
  templateId: z.string().nullable().optional(),
  toneRecipeId: z.string().nullable().optional(),
  promptOverrides: z.record(z.string(), z.unknown()).optional(),
  discussionThreadId: z.string().nullable().optional(),
  coverage: coverageSchema.optional(),
  reason: z.string().optional(),
});

const updatePromptActionSchema = z.object({
  action: z.literal("update_prompt"),
  promptMemory: promptMemorySchema,
  templates: z.array(templateSchema).optional(),
  reason: z.string().optional(),
});

const refineActionSchema = z.object({
  action: z.literal("refine_section"),
  period: z.enum(["weekly", "monthly", "all_time"]),
  instructions: z.string().optional(),
});

const actionSchema = z
  .discriminatedUnion("action", [
    publishActionSchema,
    addPinActionSchema,
    removePinActionSchema,
    addExclusionActionSchema,
    removeExclusionActionSchema,
    updateSettingsActionSchema,
    updatePromptActionSchema,
    refineActionSchema,
  ])
  .transform((value) => value);

type CurateActionInput = z.infer<typeof actionSchema>;

type CurateRouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function resolveParams(context: CurateRouteContext): Promise<{ id: string }> {
  const value = context.params;
  if (value instanceof Promise) {
    return value;
  }
  return value;
}

export const runtime = "nodejs";

export async function POST(req: Request, context: CurateRouteContext) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: false });
  if (!viewerId) {
    return returnError(401, "auth_required", "Sign in to curate capsule history.");
  }

  const params = await resolveParams(context);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  let payload: CurateActionInput;
  try {
    const body = await req.json();
    payload = actionSchema.parse(body);
  } catch (error) {
    return returnError(400, "invalid_request", "Invalid request body.");
  }

  try {
    switch (payload.action) {
      case "publish_section": {
        const snapshot = await publishCapsuleHistorySection({
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          period: payload.period,
          content: payload.content,
          title: payload.title,
          timeframe: payload.timeframe,
          postCount: payload.postCount,
          notes: payload.notes ?? null,
          templateId: payload.templateId ?? null,
          toneRecipeId: payload.toneRecipeId ?? null,
          reason: payload.reason ?? null,
          promptOverrides: payload.promptOverrides ?? null,
          coverage: payload.coverage ?? null,
        });
        return Response.json(snapshot);
      }
      case "add_pin": {
        const snapshot = await addCapsuleHistoryPin({
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          period: payload.period,
          type: payload.type,
          postId: payload.postId ?? null,
          quote: payload.quote ?? null,
          source: payload.source ?? {},
          rank: payload.rank ?? null,
          reason: payload.reason ?? null,
        });
        return Response.json(snapshot);
      }
      case "remove_pin": {
        const removeParams: Parameters<typeof removeCapsuleHistoryPin>[0] = {
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          pinId: payload.pinId,
          reason: payload.reason ?? null,
        };
        if (payload.period) {
          removeParams.period = payload.period;
        }
        const snapshot = await removeCapsuleHistoryPin(removeParams);
        return Response.json(snapshot);
      }
      case "add_exclusion": {
        const snapshot = await addCapsuleHistoryExclusion({
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          period: payload.period,
          postId: payload.postId,
          reason: payload.reason ?? null,
        });
        return Response.json(snapshot);
      }
      case "remove_exclusion": {
        const snapshot = await removeCapsuleHistoryExclusion({
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          period: payload.period,
          postId: payload.postId,
          reason: payload.reason ?? null,
        });
        return Response.json(snapshot);
      }
      case "update_settings": {
        const snapshot = await updateCapsuleHistorySectionSettings({
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          period: payload.period,
          notes: payload.notes ?? null,
          templateId: payload.templateId ?? null,
          toneRecipeId: payload.toneRecipeId ?? null,
          promptOverrides: payload.promptOverrides ?? null,
          discussionThreadId: payload.discussionThreadId ?? null,
          coverage: payload.coverage ?? null,
          reason: payload.reason ?? null,
        });
        return Response.json(snapshot);
      }
      case "update_prompt": {
        const promptParams: Parameters<typeof updateCapsuleHistoryPromptSettings>[0] = {
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          promptMemory: payload.promptMemory,
          reason: payload.reason ?? null,
        };
        if (payload.templates) {
          promptParams.templates = payload.templates;
        }
        const snapshot = await updateCapsuleHistoryPromptSettings(promptParams);
        return Response.json(snapshot);
      }
      case "refine_section": {
        const refined = await refineCapsuleHistorySection({
          capsuleId: parsedParams.data.id,
          editorId: viewerId,
          period: payload.period,
          instructions: payload.instructions ?? null,
        });
        return Response.json(refined);
      }
      default:
        return returnError(400, "invalid_request", "Unsupported action.");
    }
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    console.error("capsules.history.curate error", error);
    return returnError(500, "capsule_history_error", "Failed to update capsule history.");
  }
}
