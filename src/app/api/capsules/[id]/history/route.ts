import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { AIConfigError } from "@/lib/ai/prompter";
import { getCapsuleHistory, CapsuleMembershipError } from "@/server/capsules/service";
import { returnError, validatedJson } from "@/server/validation/http";

const paramsSchema = z.object({
  id: z.string().uuid("capsule id must be a valid UUID"),
});

const contentBlockSchema = z.object({
  id: z.string(),
  text: z.string(),
  sourceIds: z.array(z.string()),
  pinned: z.boolean(),
  pinId: z.string().nullable(),
  note: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

const timelineItemSchema = contentBlockSchema.extend({
  label: z.string(),
  detail: z.string(),
  timestamp: z.string().nullable(),
  postId: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
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

const candidateSchema = z.object({
  id: z.string(),
  kind: z.enum(["post", "quote", "milestone"]),
  postId: z.string().nullable(),
  quoteId: z.string().nullable(),
  title: z.string().nullable(),
  excerpt: z.string().nullable(),
  sourceIds: z.array(z.string()),
  createdAt: z.string().nullable(),
  authorName: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  metrics: z.object({
    reactions: z.number(),
    comments: z.number(),
    shares: z.number(),
  }),
  tags: z.array(z.string()),
});

const pinnedItemSchema = z.object({
  id: z.string(),
  type: z.enum(["summary", "highlight", "timeline", "next_focus"]),
  period: z.enum(["weekly", "monthly", "all_time"]),
  postId: z.string().nullable(),
  quote: z.string().nullable(),
  rank: z.number().int(),
  sourceId: z.string().nullable(),
  createdAt: z.string().nullable(),
  createdBy: z.string().nullable(),
});

const versionSchema = z.object({
  id: z.string(),
  createdAt: z.string().nullable(),
  editorId: z.string(),
  editorName: z.string().nullable(),
  changeType: z.string(),
  reason: z.string().nullable(),
});

const sectionSchema = z.object({
  period: z.enum(["weekly", "monthly", "all_time"]),
  title: z.string(),
  timeframe: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
  }),
  postCount: z.number().int().nonnegative(),
  suggested: sectionContentSchema,
  published: sectionContentSchema.nullable(),
  editorNotes: z.string().nullable(),
  excludedPostIds: z.array(z.string()),
  coverage: coverageSchema,
  candidates: z.array(candidateSchema),
  pinned: z.array(pinnedItemSchema),
  versions: z.array(versionSchema),
  discussionThreadId: z.string().nullable(),
  lastEditedAt: z.string().nullable(),
  lastEditedBy: z.string().nullable(),
  templateId: z.string().nullable(),
  toneRecipeId: z.string().nullable(),
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

const sourceSchema = z.object({
  id: z.string(),
  type: z.enum(["post", "quote", "topic_page", "manual"]),
  label: z.string().nullable(),
  description: z.string().nullable(),
  url: z.string().nullable(),
  postId: z.string().nullable(),
  topicPageId: z.string().nullable(),
  quoteId: z.string().nullable(),
  authorName: z.string().nullable(),
  authorAvatarUrl: z.string().nullable(),
  occurredAt: z.string().nullable(),
  metrics: z.object({
    reactions: z.number().nullable(),
    comments: z.number().nullable(),
    shares: z.number().nullable(),
  }),
});

const responseSchema = z.object({
  capsuleId: z.string(),
  capsuleName: z.string().nullable(),
  suggestedGeneratedAt: z.string(),
  publishedGeneratedAt: z.string().nullable(),
  sections: z.array(sectionSchema),
  sources: z.record(z.string(), sourceSchema),
  promptMemory: promptMemorySchema,
  templates: z.array(templateSchema),
});

type HistoryRouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function resolveParams(context: HistoryRouteContext): Promise<{ id: string }> {
  const value = context.params;
  if (value instanceof Promise) {
    return value;
  }
  return value;
}

function shouldForceRefresh(url: URL): boolean {
  const refresh = url.searchParams.get("refresh");
  if (!refresh) return false;
  const normalized = refresh.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export const runtime = "nodejs";

export async function GET(req: Request, context: HistoryRouteContext) {
  const viewerId = await ensureUserFromRequest(req, {}, { allowGuests: true });

  const params = await resolveParams(context);
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return returnError(400, "invalid_request", "Invalid capsule id.", parsedParams.error.flatten());
  }

  const forceRefresh = shouldForceRefresh(new URL(req.url));

  try {
    const history = await getCapsuleHistory(parsedParams.data.id, viewerId, {
      forceRefresh,
    });
    return validatedJson(responseSchema, history);
  } catch (error) {
    if (error instanceof CapsuleMembershipError) {
      return returnError(error.status, error.code, error.message);
    }
    if (error instanceof AIConfigError) {
      return returnError(
        503,
        "ai_configuration_required",
        "OpenAI configuration is required to generate capsule history.",
      );
    }
    console.error("capsules.history GET error", error);
    return returnError(500, "capsule_history_error", "Failed to load capsule history.");
  }
}
