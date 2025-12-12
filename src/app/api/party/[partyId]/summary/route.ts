import { z } from "zod";

import { ensureUserFromRequest } from "@/lib/auth/payload";
import { summarizeText } from "@/lib/ai/summary";
import { indexMemory } from "@/lib/supabase/memories";
import {
  fetchPartyMetadata,
  isUserInParty,
  updatePartyMetadata,
} from "@/server/livekit/party";
import { parseJsonBody, returnError, validatedJson } from "@/server/validation/http";
import { partySummarySettingsSchema } from "@/server/validation/schemas/party";
import type { SummaryLengthHint, SummaryResult } from "@/types/summary";

const summaryVerbosityValues = ["brief", "medium", "detailed"] as const;

const toggleSchema = z
  .object({
    enabled: z.boolean().optional(),
    verbosity: z.enum(summaryVerbosityValues).optional(),
    reset: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.enabled !== undefined || value.verbosity !== undefined || value.reset !== undefined,
    {
    message: "At least one field must be provided.",
    path: [],
    },
  );

const transcriptSegmentSchema = z.object({
  id: z.string(),
  text: z.string(),
  speakerId: z.string().optional().nullable(),
  speakerName: z.string().optional().nullable(),
  startTime: z.number().nonnegative().optional(),
  endTime: z.number().nonnegative().optional(),
  language: z.string().optional().nullable(),
  final: z.boolean().optional(),
});

const summaryRequestSchema = z.object({
  verbosity: z.enum(summaryVerbosityValues).default("medium"),
  segments: z.array(transcriptSegmentSchema).min(1),
  participants: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

const summaryResponseSchema = z.object({
  status: z.literal("ok"),
  summary: z.string(),
  highlights: z.array(z.string()),
  nextActions: z.array(z.string()),
  insights: z.array(z.string()),
  hashtags: z.array(z.string()),
  tone: z.string().nullable(),
  sentiment: z.string().nullable(),
  wordCount: z.number().nullable(),
  model: z.string().nullable(),
  memoryId: z.string(),
  metadata: z.object({
    summary: partySummarySettingsSchema,
  }),
});

type ToggleBody = z.infer<typeof toggleSchema>;
type SegmentInput = z.infer<typeof transcriptSegmentSchema>;
type SummaryBody = z.infer<typeof summaryRequestSchema>;

function normalizePartyId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
}

async function requirePartyMetadata(partyId: string) {
  const metadata = await fetchPartyMetadata(partyId);
  if (!metadata) {
    return { error: returnError(404, "party_not_found", "This party is no longer active.") };
  }
  return { metadata };
}

async function assertPartyAccess({
  partyId,
  userId,
  metadata,
}: {
  partyId: string;
  userId: string;
  metadata: Awaited<ReturnType<typeof fetchPartyMetadata>> extends infer M ? M extends null ? never : M : never;
}) {
  const isOwner = metadata.ownerId === userId;
  const currentHostId = metadata.hostId ?? metadata.ownerId;
  const isHost = currentHostId === userId;
  if (isOwner || isHost) {
    return { allowed: true, isOwner, isHost };
  }
  try {
    const participant = await isUserInParty(partyId, userId);
    if (participant) {
      return { allowed: true, isOwner: false, isHost: false };
    }
  } catch (error) {
    console.warn("party summary access check failed", error);
  }
  return { allowed: false, isOwner, isHost: false };
}

function coerceVerbosity(input: unknown, fallback: SummaryLengthHint): SummaryLengthHint {
  if (input === "brief" || input === "medium" || input === "detailed") {
    return input;
  }
  return fallback;
}

function formatTimestamp(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const totalSeconds = Math.floor(value);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const segments = [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ];
  return segments.join(":");
}

function buildTranscriptSegments(rawSegments: SegmentInput[]): string[] {
  const deduped = new Map<string, SegmentInput>();
  for (const segment of rawSegments) {
    if (!segment?.id || !segment.text || !segment.text.trim().length) continue;
    deduped.set(segment.id, segment);
  }

  const entries = Array.from(deduped.values()).sort((a, b) => {
    const aStart = a.startTime ?? Number.POSITIVE_INFINITY;
    const bStart = b.startTime ?? Number.POSITIVE_INFINITY;
    if (Number.isFinite(aStart) && Number.isFinite(bStart)) {
      return aStart - bStart;
    }
    if (Number.isFinite(aStart)) return -1;
    if (Number.isFinite(bStart)) return 1;
    return a.id.localeCompare(b.id);
  });

  const formatted: string[] = [];
  let remaining = 12000;

  for (const entry of entries) {
    const text = entry.text.trim();
    if (!text.length) continue;
    const speaker =
      (typeof entry.speakerName === "string" && entry.speakerName.trim().length
        ? entry.speakerName.trim()
        : typeof entry.speakerId === "string" && entry.speakerId.trim().length
          ? entry.speakerId.trim()
          : "Unknown speaker") ?? "Unknown speaker";
    const timestamp = formatTimestamp(entry.startTime);
    const prefix = timestamp ? `[${timestamp}] ${speaker}` : speaker;
    const composed = `${prefix}: ${text}`;
    const snippet = composed.length > remaining ? composed.slice(0, remaining) : composed;
    if (!snippet.length) break;
    formatted.push(snippet);
    remaining -= snippet.length + 2;
    if (remaining <= 0) break;
  }

  return formatted;
}

function summarizeResultToResponse(
  summary: SummaryResult,
  memoryId: string,
  metadata: Awaited<ReturnType<typeof fetchPartyMetadata>>,
) {
  return {
    status: "ok",
    summary: summary.summary,
    highlights: summary.highlights,
    nextActions: summary.nextActions,
    insights: summary.insights,
    hashtags: summary.hashtags,
    tone: summary.tone,
    sentiment: summary.sentiment,
    wordCount: summary.wordCount,
    model: summary.model,
    memoryId,
    metadata: {
      summary: metadata?.summary ?? { enabled: false, verbosity: "medium" },
    },
  } as z.infer<typeof summaryResponseSchema>;
}

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const normalizedPartyId = normalizePartyId(partyId);
  if (!normalizedPartyId) {
    return returnError(400, "invalid_party_id", "A valid party id is required.");
  }

  const parsedBody = await parseJsonBody(req, toggleSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }
  const body: ToggleBody = parsedBody.data;

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to update party summaries.");
  }

  const { metadata, error } = await requirePartyMetadata(normalizedPartyId);
  if (!metadata) {
    return error!;
  }

  const access = await assertPartyAccess({ partyId: normalizedPartyId, userId, metadata });
  if (!access.allowed) {
    return returnError(403, "summary_forbidden", "You are not part of this party.");
  }

  if (!access.isOwner && !access.isHost) {
    return returnError(
      403,
      "summary_settings_forbidden",
      "Only the host can change summary settings.",
    );
  }

  const patch = {
    summary: {
      ...(body.enabled !== undefined ? { enabled: body.enabled } : null),
      ...(body.verbosity ? { verbosity: body.verbosity } : null),
      ...(body.reset
        ? { lastGeneratedAt: null, memoryId: null, lastGeneratedBy: null }
        : null),
    },
  };

  const updated = await updatePartyMetadata(normalizedPartyId, patch);
  if (!updated) {
    return returnError(500, "summary_update_failed", "Unable to change summary settings.");
  }

  return validatedJson(partySummarySettingsSchema, updated.summary ?? { enabled: false, verbosity: "medium" });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ partyId: string }> },
) {
  const { partyId } = await context.params;
  const normalizedPartyId = normalizePartyId(partyId);
  if (!normalizedPartyId) {
    return returnError(400, "invalid_party_id", "A valid party id is required.");
  }

  const parsedBody = await parseJsonBody(req, summaryRequestSchema);
  if (!parsedBody.success) {
    return parsedBody.response;
  }
  const body: SummaryBody = parsedBody.data;

  const userId = await ensureUserFromRequest(req, null, { allowGuests: false });
  if (!userId) {
    return returnError(401, "auth_required", "Sign in to summarize this party.");
  }

  const { metadata, error } = await requirePartyMetadata(normalizedPartyId);
  if (!metadata) {
    return error!;
  }

  const access = await assertPartyAccess({ partyId: normalizedPartyId, userId, metadata });
  if (!access.allowed) {
    return returnError(403, "summary_forbidden", "You are not part of this party.");
  }

  if (!access.isOwner && !access.isHost) {
    return returnError(403, "summary_forbidden", "Only the host can generate party summaries.");
  }

  if (!metadata.summary?.enabled) {
    return returnError(409, "summary_disabled", "Party summaries are currently disabled.");
  }

  const transcriptSegments = buildTranscriptSegments(body.segments);
  if (!transcriptSegments.length) {
    return returnError(400, "no_transcript", "No transcript content provided.");
  }

  const verbosity = coerceVerbosity(body.verbosity, metadata.summary?.verbosity ?? "medium");

  const summaryInput = await summarizeText({
    target: "party",
    segments: transcriptSegments,
    hint: verbosity,
    meta: {
      title: metadata.topic ?? `Party ${metadata.partyId}`,
      author: metadata.ownerDisplayName ?? null,
      audience: body.participants && body.participants.length
        ? `Participants: ${body.participants
            .map((participant) => participant.name || participant.id)
            .join(", ")}`
        : null,
    },
  });

  if (!summaryInput) {
    return returnError(502, "summary_failed", "Unable to generate a party summary right now.");
  }

  const nowIso = new Date().toISOString();
  const rawTranscript = transcriptSegments.join("\n");

  const memoryMeta: Record<string, unknown> = {
    party_id: metadata.partyId,
    party_topic: metadata.topic ?? null,
    party_owner_id: metadata.ownerId,
    summary_generated_at: nowIso,
    summary_generated_by: userId,
    summary_source: summaryInput.source,
    summary_verbosity: verbosity,
    summary_highlights: summaryInput.highlights,
    summary_next_actions: summaryInput.nextActions,
    summary_insights: summaryInput.insights,
    summary_hashtags: summaryInput.hashtags,
    summary_tone: summaryInput.tone,
    summary_sentiment: summaryInput.sentiment,
    summary_word_count: summaryInput.wordCount,
    summary_model: summaryInput.model,
    participants: body.participants ?? null,
  };

  const memoryOwnerId = metadata.ownerId ?? userId;
  const memoryId = await indexMemory({
    ownerId: memoryOwnerId,
    kind: "party_summary",
    mediaUrl: null,
    mediaType: "text/plain",
    title: metadata.topic
      ? `Party summary - ${metadata.topic}`
      : `Party summary - ${metadata.partyId}`,
    description: summaryInput.summary,
    postId: null,
    metadata: memoryMeta,
    rawText: `${summaryInput.summary}\n\nTranscript:\n${rawTranscript}`,
    source: "party_summary",
    tags: ["party", "summary", metadata.partyId],
    eventAt: nowIso,
  });

  if (!memoryId) {
    return returnError(500, "memory_store_failed", "Unable to save the summary to Memory.");
  }

  const updatedMetadata = await updatePartyMetadata(normalizedPartyId, {
    summary: {
      enabled: true,
      verbosity,
      lastGeneratedAt: nowIso,
      lastGeneratedBy: userId,
      memoryId,
    },
  });

  const response = summarizeResultToResponse(summaryInput, memoryId, updatedMetadata ?? metadata);
  return validatedJson(summaryResponseSchema, response);
}
