"use server";

import { getDatabaseAdminClient } from "@/config/database";
import { decorateDatabaseError, ensureResult, expectResult, maybeResult } from "@/lib/database/utils";
import type { DatabaseError } from "@/ports/database";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  CapsuleLadderMemberInput,
  CapsuleLadderMemberUpdateInput,
  CapsuleLadderSummary,
  LadderChallenge,
  LadderChallengeOutcome,
  LadderChallengeStatus,
  LadderMembershipStatus,
  LadderAiPlan,
  LadderConfig,
  LadderGameConfig,
  LadderMatchRecord,
  LadderParticipantType,
  LadderSectionBlock,
  LadderSections,
  LadderStatus,
  LadderVisibility,
} from "@/types/ladders";

const db = getDatabaseAdminClient();

type LadderRow = {
  id: string | null;
  capsule_id: string | null;
  created_by_id: string | null;
  published_by_id: string | null;
  name: string | null;
  slug: string | null;
  summary: string | null;
  status: string | null;
  visibility: string | null;
  game: unknown;
  config: unknown;
  sections: unknown;
  ai_plan: unknown;
  meta: unknown;
  published_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type LadderMemberRow = {
  id: string | null;
  ladder_id: string | null;
  user_id: string | null;
  display_name: string | null;
  handle: string | null;
  status?: string | null;
  seed: number | string | null;
  rank: number | string | null;
  rating: number | string | null;
  wins: number | string | null;
  losses: number | string | null;
  draws: number | string | null;
  streak: number | string | null;
  metadata: unknown;
  created_at: string | null;
  updated_at: string | null;
};

type LadderParticipationRow = LadderMemberRow & {
  ladder: LadderRow | null;
};

type LadderChallengeRow = {
  id: string | null;
  ladder_id: string | null;
  participant_type: string | null;
  challenger_member_id: string | null;
  opponent_member_id: string | null;
  challenger_capsule_id: string | null;
  opponent_capsule_id: string | null;
  status: string | null;
  outcome: string | null;
  note: string | null;
  proof_url: string | null;
  reported_by: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type LadderHistoryRow = {
  id: string | null;
  ladder_id: string | null;
  challenge_id: string | null;
  participant_type: string | null;
  challenger_member_id: string | null;
  opponent_member_id: string | null;
  challenger_capsule_id: string | null;
  opponent_capsule_id: string | null;
  outcome: string | null;
  note: string | null;
  proof_url: string | null;
  rank_changes: unknown;
  rating_changes: unknown;
  resolved_at: string | null;
  created_at: string | null;
};

export type InsertCapsuleLadderParams = {
  capsuleId: string;
  createdById: string;
  name: string;
  slug?: string | null;
  summary?: string | null;
  status?: LadderStatus;
  visibility?: LadderVisibility;
  game?: LadderGameConfig | null;
  config?: LadderConfig | null;
  sections?: LadderSections | null;
  aiPlan?: LadderAiPlan | null;
  meta?: Record<string, unknown> | null;
  publishedById?: string | null;
  publishedAt?: string | null;
};

export type UpdateCapsuleLadderParams = Partial<Omit<InsertCapsuleLadderParams, "capsuleId" | "createdById">> & {
  status?: LadderStatus;
  visibility?: LadderVisibility;
};

export type InsertLadderChallengeParams = {
  ladderId: string;
  participantType: LadderParticipantType;
  challengerMemberId: string | null;
  opponentMemberId: string | null;
  challengerCapsuleId: string | null;
  opponentCapsuleId: string | null;
  status?: LadderChallengeStatus;
  outcome?: LadderChallengeOutcome | null;
  note?: string | null;
  proofUrl?: string | null;
  reportedById?: string | null;
  createdById?: string | null;
  createdAt?: string | null;
};

export type UpdateLadderChallengeParams = {
  status?: LadderChallengeStatus;
  outcome?: LadderChallengeOutcome | null;
  note?: string | null;
  proofUrl?: string | null;
  reportedById?: string | null;
  expectedUpdatedAt?: string | null;
};

export type InsertLadderHistoryParams = {
  ladderId: string;
  challengeId?: string | null;
  participantType: LadderParticipantType;
  challengerMemberId: string;
  opponentMemberId: string;
  challengerCapsuleId?: string | null;
  opponentCapsuleId?: string | null;
  outcome: LadderChallengeOutcome;
  note?: string | null;
  proofUrl?: string | null;
  rankChanges?: LadderMatchRecord["rankChanges"];
  ratingChanges?: LadderMatchRecord["ratingChanges"];
  resolvedAt?: string | null;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeTimestamp(value: unknown): string | null {
  const normalized = normalizeString(
    typeof value === "string" || value instanceof Date ? String(value) : null,
  );
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeNumber(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseJsonRecord<T extends Record<string, unknown>>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return { ...fallback, ...(parsed as Record<string, unknown>) } as T;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }
  if (typeof value === "object") {
    return { ...fallback, ...(value as Record<string, unknown>) } as T;
  }
  return fallback;
}

function parseJsonNullable<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as T;
      }
      return parsed as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

function mapStatus(value: unknown): LadderStatus {
  const normalized = normalizeString(value);
  if (normalized === "active" || normalized === "archived") {
    return normalized;
  }
  return "draft";
}

function mapVisibility(value: unknown): LadderVisibility {
  const normalized = normalizeString(value);
  if (normalized === "private" || normalized === "public") {
    return normalized;
  }
  return "capsule";
}

function mapGame(value: unknown): LadderGameConfig {
  const raw = parseJsonRecord<Record<string, unknown>>(value, {});
  return {
    title: normalizeString(raw.title) ?? null,
    franchise: normalizeString(raw.franchise) ?? null,
    mode: normalizeString(raw.mode) ?? null,
    platform: normalizeString(raw.platform) ?? null,
    region: normalizeString(raw.region) ?? null,
    summary: normalizeString(raw.summary) ?? null,
  };
}

function mapSections(value: unknown): LadderSections {
  const raw = parseJsonRecord<Record<string, unknown>>(value, {});

  const toBlock = (payload: unknown, fallbackTitle: string): LadderSectionBlock | null => {
    if (!payload) return null;
    if (typeof payload === "string") {
      return {
        id: `${fallbackTitle.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
        title: fallbackTitle,
        body: payload,
      };
    }
    if (typeof payload !== "object") return null;
    const record = payload as Record<string, unknown>;
    const title = normalizeString(record.title) ?? fallbackTitle;
    const body = normalizeString(record.body) ?? null;
    const rawBullets = Array.isArray(record.bulletPoints)
      ? record.bulletPoints
      : Array.isArray(record.bullets)
        ? record.bullets
        : Array.isArray(record.highlights)
          ? record.highlights
          : [];
    const bulletPoints = Array.isArray(rawBullets)
      ? rawBullets
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length)
      : undefined;
    const block: LadderSectionBlock = {
      id: normalizeString(record.id) ?? `${title.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
      title,
      body,
    };
    if (bulletPoints && bulletPoints.length) {
      block.bulletPoints = bulletPoints;
    }
    return block;
  };

  const result: LadderSections = {};

  const overview = toBlock(raw.overview, "Ladder Overview");
  if (overview) result.overview = overview;
  const rules = toBlock(raw.rules, "Core Rules");
  if (rules) result.rules = rules;
  const shoutouts = toBlock(raw.shoutouts, "Spotlight & Shoutouts");
  if (shoutouts) result.shoutouts = shoutouts;
  const upcoming = toBlock(raw.upcoming, "Upcoming Challenges");
  if (upcoming) result.upcoming = upcoming;
  const resultsBlock = toBlock(raw.results, "Recent Results");
  if (resultsBlock) result.results = resultsBlock;

  if (Array.isArray(raw.custom)) {
    const customBlocks = raw.custom
      .map((entry, index) => toBlock(entry, `Feature Block ${index + 1}`))
      .filter((block): block is LadderSectionBlock => Boolean(block));
    if (customBlocks.length) {
      result.custom = customBlocks;
    }
  }

  return result;
}

function mapConfig(value: unknown): LadderConfig {
  return parseJsonRecord<LadderConfig>(value, {}) as LadderConfig;
}

function mapAiPlan(value: unknown): LadderAiPlan | null {
  const parsed = parseJsonNullable<Record<string, unknown>>(value);
  if (!parsed) return null;
  const generatedAt = normalizeTimestamp(parsed.generatedAt) ?? new Date().toISOString();
  const plan: LadderAiPlan = { generatedAt };

  const prompt = normalizeString(parsed.prompt);
  if (prompt) plan.prompt = prompt;
  const reasoning = normalizeString(parsed.reasoning);
  if (reasoning) plan.reasoning = reasoning;
  const version = normalizeString(parsed.version);
  if (version) plan.version = version;

  const metadataRecord = parseJsonRecord<Record<string, unknown>>(parsed.metadata, {});
  plan.metadata = Object.keys(metadataRecord).length ? metadataRecord : null;

  if (Array.isArray(parsed.suggestions)) {
    const suggestions = parsed.suggestions
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        const id = normalizeString(record.id);
        const title = normalizeString(record.title);
        const summary = normalizeString(record.summary);
        if (!id || !title || !summary) return null;
        const section = normalizeString(record.section) as keyof LadderSections | null;
        const suggestion: NonNullable<LadderAiPlan["suggestions"]>[number] = {
          id,
          title,
          summary,
        };
        if (section) {
          suggestion.section = section;
        }
        return suggestion;
      })
      .filter(
        (entry): entry is NonNullable<LadderAiPlan["suggestions"]>[number] => Boolean(entry),
      );
    if (suggestions.length) {
      plan.suggestions = suggestions;
    }
  }

  return plan;
}

function mapLadderSummaryRow(row: LadderRow | null): CapsuleLadderSummary | null {
  if (!row) return null;
  const id = normalizeString(row.id);
  const capsuleId = normalizeString(row.capsule_id);
  const name = normalizeString(row.name);
  if (!id || !capsuleId) return null;
  const createdById = normalizeString(row.created_by_id);
  if (!createdById) return null;
  const createdAt = normalizeTimestamp(row.created_at) ?? new Date().toISOString();
  const updatedAt = normalizeTimestamp(row.updated_at) ?? createdAt;
  return {
    id,
    capsuleId,
    name: name ?? "Untitled Ladder",
    slug: normalizeString(row.slug),
    summary: normalizeString(row.summary),
    status: mapStatus(row.status),
    visibility: mapVisibility(row.visibility),
    createdById,
    game: mapGame(row.game),
    createdAt,
    updatedAt,
    publishedAt: normalizeTimestamp(row.published_at),
    meta: parseJsonNullable<Record<string, unknown>>(row.meta),
  };
}

function mapLadderDetailRow(row: LadderRow | null): CapsuleLadderDetail | null {
  if (!row) return null;
  const summary = mapLadderSummaryRow(row);
  if (!summary) return null;
  return {
    ...summary,
    publishedById: normalizeString(row.published_by_id),
    config: mapConfig(row.config),
    sections: mapSections(row.sections),
    aiPlan: mapAiPlan(row.ai_plan),
    meta: parseJsonNullable<Record<string, unknown>>(row.meta),
  };
}

function mapLadderMemberRow(row: LadderMemberRow | null): CapsuleLadderMember | null {
  if (!row) return null;
  const id = normalizeString(row.id);
  const ladderId = normalizeString(row.ladder_id);
  const displayName = normalizeString(row.display_name);
  if (!id || !ladderId || !displayName) return null;
  const createdAt = normalizeTimestamp(row.created_at) ?? new Date().toISOString();
  const updatedAt = normalizeTimestamp(row.updated_at) ?? createdAt;
  const statusRaw =
    normalizeString((row as { status?: string }).status) ??
    (() => {
      const meta = parseJsonNullable<Record<string, unknown>>(row.metadata);
      const raw = normalizeString((meta ?? {}).status as string | null);
      return raw ?? "active";
    })();
  const status: LadderMembershipStatus =
    statusRaw === "pending" ||
    statusRaw === "invited" ||
    statusRaw === "active" ||
    statusRaw === "rejected" ||
    statusRaw === "banned"
      ? statusRaw
      : "active";
  return {
    id,
    ladderId,
    userId: normalizeString(row.user_id),
    displayName,
    handle: normalizeString(row.handle),
    status,
    seed: normalizeNumber(row.seed),
    rank: normalizeNumber(row.rank),
    rating: normalizeNumber(row.rating, 0) ?? 0,
    wins: normalizeNumber(row.wins, 0) ?? 0,
    losses: normalizeNumber(row.losses, 0) ?? 0,
    draws: normalizeNumber(row.draws, 0) ?? 0,
    streak: normalizeNumber(row.streak, 0) ?? 0,
    metadata: parseJsonNullable<Record<string, unknown>>(row.metadata),
    createdAt,
    updatedAt,
  };
}

function mapChallengeStatus(value: unknown): LadderChallengeStatus {
  const normalized = normalizeString(value);
  if (normalized === "resolved" || normalized === "void") {
    return normalized;
  }
  return "pending";
}

function mapChallengeOutcome(value: unknown): LadderChallengeOutcome | null {
  const normalized = normalizeString(value);
  if (normalized === "challenger" || normalized === "opponent" || normalized === "draw") {
    return normalized;
  }
  return null;
}

function mapRankChanges(value: unknown): NonNullable<LadderMatchRecord["rankChanges"]> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const memberId =
        normalizeString(record.memberId as string | null) ??
        normalizeString(record.member_id as string | null);
      const from = normalizeNumber(record.from, null);
      const to = normalizeNumber(record.to, null);
      if (!memberId || from === null || to === null) return null;
      return { memberId, from, to };
    })
    .filter((entry): entry is NonNullable<LadderMatchRecord["rankChanges"]>[number] => Boolean(entry));
}

function mapRatingChanges(value: unknown): NonNullable<LadderMatchRecord["ratingChanges"]> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const memberId =
        normalizeString(record.memberId as string | null) ??
        normalizeString(record.member_id as string | null);
      const from = normalizeNumber(record.from, null);
      const to = normalizeNumber(record.to, null);
      if (!memberId || from === null || to === null) return null;
      const mapped: NonNullable<LadderMatchRecord["ratingChanges"]>[number] = { memberId, from, to };
      const delta = normalizeNumber(record.delta, null);
      if (delta !== null) mapped.delta = delta;
      return mapped;
    })
    .filter((entry): entry is NonNullable<LadderMatchRecord["ratingChanges"]>[number] => Boolean(entry));
}

function mapChallengeRow(row: LadderChallengeRow | null): LadderChallenge | null {
  if (!row) return null;
  const id = normalizeString(row.id);
  const ladderId = normalizeString(row.ladder_id);
  if (!id || !ladderId) return null;
  const participantType: LadderParticipantType =
    normalizeString(row.participant_type) === "capsule" ? "capsule" : "member";
  const status = mapChallengeStatus(row.status);
  const outcome = mapChallengeOutcome(row.outcome);
  const createdAt = normalizeTimestamp(row.created_at) ?? new Date().toISOString();
  const updatedAt = normalizeTimestamp(row.updated_at) ?? createdAt;
  const challengerCapsuleId = normalizeString(row.challenger_capsule_id);
  const opponentCapsuleId = normalizeString(row.opponent_capsule_id);
  const challengerMemberId = normalizeString(row.challenger_member_id);
  const opponentMemberId = normalizeString(row.opponent_member_id);
  const note = normalizeString(row.note);
  const proofUrl = normalizeString(row.proof_url);

  const challenge: LadderChallenge = {
    id,
    ladderId,
    challengerId: challengerMemberId ?? challengerCapsuleId ?? id,
    opponentId: opponentMemberId ?? opponentCapsuleId ?? id,
    challengerCapsuleId,
    opponentCapsuleId,
    participantType,
    createdAt,
    createdById: normalizeString(row.created_by),
    status,
  };
  if (note) challenge.note = note;
  if (proofUrl) challenge.proofUrl = proofUrl;
  if (status === "resolved" && outcome) {
    challenge.result = {
      outcome,
      reportedAt: updatedAt,
      reportedById: normalizeString(row.reported_by),
    };
    if (note) challenge.result.note = note;
    if (proofUrl) challenge.result.proofUrl = proofUrl;
  }
  return challenge;
}

function mapHistoryRow(row: LadderHistoryRow | null): LadderMatchRecord | null {
  if (!row) return null;
  const id = normalizeString(row.id);
  const ladderId = normalizeString(row.ladder_id);
  const outcome = mapChallengeOutcome(row.outcome);
  if (!id || !ladderId || !outcome) return null;
  const resolvedAt = normalizeTimestamp(row.resolved_at) ?? new Date().toISOString();
  const participantType: LadderParticipantType =
    normalizeString(row.participant_type) === "capsule" ? "capsule" : "member";
  const challengerCapsuleId = normalizeString(row.challenger_capsule_id);
  const opponentCapsuleId = normalizeString(row.opponent_capsule_id);
  const challengerMemberId = normalizeString(row.challenger_member_id);
  const opponentMemberId = normalizeString(row.opponent_member_id);
  const note = normalizeString(row.note);
  const proofUrl = normalizeString(row.proof_url);
  const rankChanges = mapRankChanges(row.rank_changes);
  const ratingChanges = mapRatingChanges(row.rating_changes);

  const record: LadderMatchRecord = {
    id,
    ladderId,
    challengeId: normalizeString(row.challenge_id),
    challengerId: challengerMemberId ?? challengerCapsuleId ?? id,
    opponentId: opponentMemberId ?? opponentCapsuleId ?? id,
    challengerCapsuleId,
    opponentCapsuleId,
    participantType,
    outcome,
    resolvedAt,
  };
  if (note) record.note = note;
  if (proofUrl) record.proofUrl = proofUrl;
  if (rankChanges.length) record.rankChanges = rankChanges;
  if (ratingChanges.length) record.ratingChanges = ratingChanges;
  return record;
}

function ensureLadder(row: LadderRow | null, context: string): CapsuleLadderDetail {
  const ladder = mapLadderDetailRow(row);
  if (!ladder) {
    throw new Error(`${context}: failed to map ladder record`);
  }
  return ladder;
}

export async function insertCapsuleLadderRecord(
  params: InsertCapsuleLadderParams,
): Promise<CapsuleLadderDetail> {
  try {
    const result = await db
      .from("capsule_ladders")
      .insert({
        capsule_id: params.capsuleId,
        created_by_id: params.createdById,
        published_by_id: params.publishedById ?? null,
        name: params.name,
        slug: params.slug ?? null,
        summary: params.summary ?? null,
        status: params.status ?? "draft",
        visibility: params.visibility ?? "capsule",
        game: params.game ?? {},
        config: params.config ?? {},
        sections: params.sections ?? {},
        ai_plan: params.aiPlan ?? null,
        meta: params.meta ?? null,
        published_at: params.publishedAt ?? null,
      })
      .select<LadderRow>("*")
      .single();

    const row = expectResult(result, "insert capsule_ladder record");
    return ensureLadder(row, "insert capsule_ladder record");
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("insert capsule_ladder record", error);
    }
    throw error;
  }
}

export async function updateCapsuleLadderRecord(
  ladderId: string,
  patch: UpdateCapsuleLadderParams,
  options: { expectedUpdatedAt?: string | null } = {},
): Promise<CapsuleLadderDetail | null> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.slug !== undefined) payload.slug = patch.slug ?? null;
  if (patch.summary !== undefined) payload.summary = patch.summary ?? null;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.visibility !== undefined) payload.visibility = patch.visibility;
  if (patch.game !== undefined) payload.game = patch.game ?? {};
  if (patch.config !== undefined) payload.config = patch.config ?? {};
  if (patch.sections !== undefined) payload.sections = patch.sections ?? {};
  if (patch.aiPlan !== undefined) payload.ai_plan = patch.aiPlan ?? null;
  if (patch.meta !== undefined) payload.meta = patch.meta ?? null;
  if (patch.publishedAt !== undefined) payload.published_at = patch.publishedAt ?? null;
  if (patch.publishedById !== undefined) payload.published_by_id = patch.publishedById ?? null;

  if (Object.keys(payload).length === 0) {
    return getCapsuleLadderRecordById(ladderId);
  }

  try {
    const query = db.from("capsule_ladders").update(payload).eq("id", ladderId);
    if (options.expectedUpdatedAt) {
      query.eq("updated_at", options.expectedUpdatedAt);
    }
    const result = await query.select<LadderRow>("*").maybeSingle();

    const row = maybeResult(result, "update capsule_ladder record");
    return mapLadderDetailRow(row);
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("update capsule_ladder record", error);
    }
    throw error;
  }
}

export async function getCapsuleLadderRecordById(
  ladderId: string,
): Promise<CapsuleLadderDetail | null> {
  try {
    const result = await db
      .from("capsule_ladders")
      .select<LadderRow>("*")
      .eq("id", ladderId)
      .maybeSingle();
    const row = maybeResult(result, "get capsule_ladder record");
    return mapLadderDetailRow(row);
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("get capsule_ladder record", error);
    }
    throw error;
  }
}

export async function getCapsuleLadderBySlug(
  capsuleId: string,
  slug: string,
): Promise<CapsuleLadderDetail | null> {
  try {
    const result = await db
      .from("capsule_ladders")
      .select<LadderRow>("*")
      .eq("capsule_id", capsuleId)
      .eq("slug", slug)
      .maybeSingle();
    const row = maybeResult(result, "get capsule_ladder by slug");
    return mapLadderDetailRow(row);
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("get capsule_ladder by slug", error);
    }
    throw error;
  }
}

export async function listCapsuleLaddersByCapsule(
  capsuleId: string,
): Promise<CapsuleLadderSummary[]> {
  try {
    const result = await db
      .from("capsule_ladders")
      .select<LadderRow>("*")
      .eq("capsule_id", capsuleId)
      .order("created_at", { ascending: false })
      .fetch();

    const rows = expectResult(result, "list capsule_ladder records");
    return rows
      .map((row) => mapLadderSummaryRow(row))
      .filter((item): item is CapsuleLadderSummary => Boolean(item));
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("list capsule_ladder records", error);
    }
    throw error;
  }
}

export async function deleteCapsuleLadderRecord(ladderId: string): Promise<void> {
  try {
    const result = await db.from("capsule_ladders").delete().eq("id", ladderId).fetch();
    ensureResult(result, "delete capsule_ladder record");
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("delete capsule_ladder record", error);
    }
    throw error;
  }
}

export async function listCapsuleLadderMemberRecords(
  ladderId: string,
): Promise<CapsuleLadderMember[]> {
  try {
    const result = await db
      .from("capsule_ladder_members")
      .select<LadderMemberRow>("*")
      .eq("ladder_id", ladderId)
      .order("rating", { ascending: false })
      .order("created_at", { ascending: true })
      .fetch();

    const rows = expectResult(result, "list capsule_ladder_member records");
    return rows
      .map((row) => mapLadderMemberRow(row))
      .filter((member): member is CapsuleLadderMember => Boolean(member));
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("list capsule_ladder_member records", error);
    }
    throw error;
  }
}

export async function listLaddersByParticipant(
  userId: string,
  options: { limit?: number } = {},
): Promise<
  Array<{
    ladder: CapsuleLadderSummary;
    membership: CapsuleLadderMember;
  }>
> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  try {
    const result = await db
      .from("capsule_ladder_members")
      .select<LadderParticipationRow>(
        "id, ladder_id, user_id, display_name, handle, seed, rank, rating, wins, losses, draws, streak, metadata, created_at, updated_at, ladder:capsule_ladders!inner(*)",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .fetch();

    const rows = expectResult(result, "list ladders by participant");
    return rows
      .map((row) => {
        const summary = mapLadderSummaryRow(row.ladder);
        if (!summary) return null;
        const membershipRow: LadderMemberRow = {
          id: row.id,
          ladder_id: row.ladder_id,
          user_id: row.user_id,
          display_name: row.display_name,
          handle: row.handle,
          seed: row.seed,
          rank: row.rank,
          rating: row.rating,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
          streak: row.streak,
          metadata: row.metadata,
          created_at: row.created_at,
          updated_at: row.updated_at,
        };
        const membership = mapLadderMemberRow(membershipRow);
        if (!membership) return null;
        return { ladder: summary, membership };
      })
      .filter((entry): entry is { ladder: CapsuleLadderSummary; membership: CapsuleLadderMember } =>
        Boolean(entry),
      );
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("list ladders by participant", error);
    }
    throw error;
  }
}

export async function getCapsuleLadderMemberRecordById(
  ladderId: string,
  memberId: string,
): Promise<CapsuleLadderMember | null> {
  try {
    const result = await db
      .from("capsule_ladder_members")
      .select<LadderMemberRow>("*")
      .eq("ladder_id", ladderId)
      .eq("id", memberId)
      .maybeSingle();
    const row = maybeResult(result, "get capsule_ladder_member record");
    return mapLadderMemberRow(row);
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("get capsule_ladder_member record", error);
    }
    throw error;
  }
}

export async function insertCapsuleLadderMemberRecords(
  ladderId: string,
  members: CapsuleLadderMemberInput[],
): Promise<CapsuleLadderMember[]> {
  if (!members.length) return [];
  const payload = members.map((member) => ({
    ladder_id: ladderId,
    user_id: member.userId ?? null,
    display_name: member.displayName,
    handle: member.handle ?? null,
    status: member.status ?? "active",
    seed: member.seed ?? null,
    rank: member.rank ?? null,
    rating: member.rating ?? 1200,
    wins: member.wins ?? 0,
    losses: member.losses ?? 0,
    draws: member.draws ?? 0,
    streak: member.streak ?? 0,
    metadata: member.metadata
      ? { ...member.metadata, status: member.status ?? "active" }
      : member.status
        ? { status: member.status }
        : null,
  }));

  try {
    const result = await db
      .from("capsule_ladder_members")
      .insert(payload)
      .select<LadderMemberRow>("*")
      .fetch();
    const rows = expectResult(result, "insert capsule_ladder_members");
    return rows
      .map((row) => mapLadderMemberRow(row))
      .filter((member): member is CapsuleLadderMember => Boolean(member));
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("insert capsule_ladder_members", error);
    }
    throw error;
  }
}

export async function updateCapsuleLadderMemberRecord(
  ladderId: string,
  memberId: string,
  patch: CapsuleLadderMemberUpdateInput,
): Promise<CapsuleLadderMember | null> {
  const payload: Record<string, unknown> = {};
  if (patch.userId !== undefined) payload.user_id = patch.userId ?? null;
  if (patch.displayName !== undefined) payload.display_name = patch.displayName;
  if (patch.handle !== undefined) payload.handle = patch.handle ?? null;
  if (patch.status !== undefined) payload.status = patch.status ?? "active";
  if (patch.seed !== undefined) payload.seed = patch.seed ?? null;
  if (patch.rank !== undefined) payload.rank = patch.rank ?? null;
  if (patch.rating !== undefined) payload.rating = patch.rating ?? null;
  if (patch.wins !== undefined) payload.wins = patch.wins ?? null;
  if (patch.losses !== undefined) payload.losses = patch.losses ?? null;
  if (patch.draws !== undefined) payload.draws = patch.draws ?? null;
  if (patch.streak !== undefined) payload.streak = patch.streak ?? null;
  if (patch.metadata !== undefined) payload.metadata = patch.metadata ?? null;
  if (patch.status !== undefined && patch.metadata === undefined) {
    payload.metadata = { status: patch.status ?? "active" };
  }

  if (Object.keys(payload).length === 0) {
    return getCapsuleLadderMemberRecordById(ladderId, memberId);
  }

  try {
    const result = await db
      .from("capsule_ladder_members")
      .update(payload)
      .eq("ladder_id", ladderId)
      .eq("id", memberId)
      .select<LadderMemberRow>("*")
      .maybeSingle();
    const row = maybeResult(result, "update capsule_ladder_member record");
    return mapLadderMemberRow(row);
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("update capsule_ladder_member record", error);
    }
    throw error;
  }
}

export async function deleteCapsuleLadderMemberRecord(
  ladderId: string,
  memberId: string,
): Promise<void> {
  try {
    const result = await db
      .from("capsule_ladder_members")
      .delete()
      .eq("ladder_id", ladderId)
      .eq("id", memberId)
      .fetch();
    ensureResult(result, "delete capsule_ladder_member record");
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("delete capsule_ladder_member record", error);
    }
    throw error;
  }
}

export async function replaceCapsuleLadderMemberRecords(
  ladderId: string,
  members: CapsuleLadderMemberInput[],
): Promise<CapsuleLadderMember[]> {
  // Keep a backup snapshot so we can restore on failure and avoid leaving ladders empty.
  let backup: CapsuleLadderMember[] = [];
  try {
    backup = await listCapsuleLadderMemberRecords(ladderId);
  } catch {
    backup = [];
  }

  try {
    const deleteResult = await db
      .from("capsule_ladder_members")
      .delete()
      .eq("ladder_id", ladderId)
      .fetch();
    ensureResult(deleteResult, "clear capsule_ladder_members");

    if (!members.length) {
      return [];
    }

    const payload = members.map((member) => ({
      ladder_id: ladderId,
      user_id: member.userId ?? null,
      display_name: member.displayName,
      handle: member.handle ?? null,
      status: member.status ?? "active",
      seed: member.seed ?? null,
      rank: member.rank ?? null,
      rating: member.rating ?? 1200,
      wins: member.wins ?? 0,
      losses: member.losses ?? 0,
      draws: member.draws ?? 0,
      streak: member.streak ?? 0,
      metadata: member.metadata
        ? { ...member.metadata, status: member.status ?? "active" }
        : member.status
          ? { status: member.status }
          : null,
    }));

    const insertResult = await db
      .from("capsule_ladder_members")
      .insert(payload)
      .select<LadderMemberRow>("*")
      .fetch();

    const rows = expectResult(insertResult, "insert capsule_ladder_members");
    return rows
      .map((row) => mapLadderMemberRow(row))
      .filter((member): member is CapsuleLadderMember => Boolean(member));
  } catch (error) {
    if (backup.length) {
      try {
        const restorePayload = backup.map((member) => ({
          id: member.id,
          ladder_id: ladderId,
          user_id: member.userId ?? null,
          display_name: member.displayName,
          handle: member.handle ?? null,
          seed: member.seed ?? null,
          rank: member.rank ?? null,
          rating: member.rating ?? 1200,
          wins: member.wins ?? 0,
          losses: member.losses ?? 0,
          draws: member.draws ?? 0,
          streak: member.streak ?? 0,
          metadata: member.metadata ?? null,
        }));
        await db.from("capsule_ladder_members").insert(restorePayload).fetch();
      } catch (restoreError) {
        console.error("replace capsule_ladder_members: failed to restore backup roster", restoreError);
      }
    }

    if (isDatabaseError(error)) {
      throw decorateDatabaseError("replace capsule_ladder_members", error);
    }
    throw error;
  }
}

export async function listLadderChallengesForLadder(ladderId: string): Promise<LadderChallenge[]> {
  try {
    const result = await db
      .from("capsule_ladder_challenges")
      .select<LadderChallengeRow>("*")
      .eq("ladder_id", ladderId)
      .order("created_at", { ascending: false })
      .fetch();
    const rows = expectResult(result, "list capsule_ladder_challenges");
    return rows
      .map((row) => mapChallengeRow(row))
      .filter((challenge): challenge is LadderChallenge => Boolean(challenge));
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("list capsule_ladder_challenges", error);
    }
    throw error;
  }
}

export async function getLadderChallengeById(
  ladderId: string,
  challengeId: string,
): Promise<LadderChallenge | null> {
  try {
    const result = await db
      .from("capsule_ladder_challenges")
      .select<LadderChallengeRow>("*")
      .eq("ladder_id", ladderId)
      .eq("id", challengeId)
      .maybeSingle();
    const row = maybeResult(result, "get capsule_ladder_challenge record");
    return mapChallengeRow(row);
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("get capsule_ladder_challenge record", error);
    }
    throw error;
  }
}

export async function insertLadderChallenge(
  params: InsertLadderChallengeParams,
): Promise<LadderChallenge> {
  try {
    const result = await db
      .from("capsule_ladder_challenges")
      .insert({
        ladder_id: params.ladderId,
        participant_type: params.participantType,
        challenger_member_id: params.challengerMemberId ?? null,
        opponent_member_id: params.opponentMemberId ?? null,
        challenger_capsule_id: params.challengerCapsuleId ?? null,
        opponent_capsule_id: params.opponentCapsuleId ?? null,
        status: params.status ?? "pending",
        outcome: params.outcome ?? null,
        note: params.note ?? null,
        proof_url: params.proofUrl ?? null,
        reported_by: params.reportedById ?? null,
        created_by: params.createdById ?? null,
        created_at: params.createdAt ?? undefined,
      })
      .select<LadderChallengeRow>("*")
      .single();
    const row = expectResult(result, "insert capsule_ladder_challenge");
    const mapped = mapChallengeRow(row);
    if (!mapped) {
      throw new Error("insertLadderChallenge: failed to map challenge row");
    }
    return mapped;
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("insert capsule_ladder_challenge", error);
    }
    throw error;
  }
}

export async function updateLadderChallengeStatusOutcome(
  ladderId: string,
  challengeId: string,
  patch: UpdateLadderChallengeParams,
): Promise<LadderChallenge | null> {
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.outcome !== undefined) payload.outcome = patch.outcome ?? null;
  if (patch.note !== undefined) payload.note = patch.note ?? null;
  if (patch.proofUrl !== undefined) payload.proof_url = patch.proofUrl ?? null;
  if (patch.reportedById !== undefined) payload.reported_by = patch.reportedById ?? null;

  if (Object.keys(payload).length === 0) {
    return getLadderChallengeById(ladderId, challengeId);
  }

  try {
    const query = db
      .from("capsule_ladder_challenges")
      .update(payload)
      .eq("ladder_id", ladderId)
      .eq("id", challengeId);
    if (patch.expectedUpdatedAt) {
      query.eq("updated_at", patch.expectedUpdatedAt);
    }
    const result = await query.select<LadderChallengeRow>("*").maybeSingle();
    const row = maybeResult(result, "update capsule_ladder_challenge");
    return mapChallengeRow(row);
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("update capsule_ladder_challenge", error);
    }
    throw error;
  }
}

export async function insertLadderHistoryRecord(
  params: InsertLadderHistoryParams,
): Promise<LadderMatchRecord> {
  try {
    const result = await db
      .from("capsule_ladder_history")
      .insert({
        ladder_id: params.ladderId,
        challenge_id: params.challengeId ?? null,
        participant_type: params.participantType,
        challenger_member_id: params.challengerMemberId,
        opponent_member_id: params.opponentMemberId,
        challenger_capsule_id: params.challengerCapsuleId ?? null,
        opponent_capsule_id: params.opponentCapsuleId ?? null,
        outcome: params.outcome,
        note: params.note ?? null,
        proof_url: params.proofUrl ?? null,
        rank_changes: params.rankChanges ?? null,
        rating_changes: params.ratingChanges ?? null,
        resolved_at: params.resolvedAt ?? new Date().toISOString(),
      })
      .select<LadderHistoryRow>("*")
      .single();
    const row = expectResult(result, "insert capsule_ladder_history");
    const mapped = mapHistoryRow(row);
    if (!mapped) {
      throw new Error("insertLadderHistoryRecord: failed to map history row");
    }
    return mapped;
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("insert capsule_ladder_history", error);
    }
    throw error;
  }
}

export async function listLadderHistoryForLadder(ladderId: string): Promise<LadderMatchRecord[]> {
  try {
    const result = await db
      .from("capsule_ladder_history")
      .select<LadderHistoryRow>("*")
      .eq("ladder_id", ladderId)
      .order("resolved_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100)
      .fetch();
    const rows = expectResult(result, "list capsule_ladder_history");
    return rows
      .map((row) => mapHistoryRow(row))
      .filter((record): record is LadderMatchRecord => Boolean(record));
  } catch (error) {
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("list capsule_ladder_history", error);
    }
    throw error;
  }
}

function isDatabaseError(error: unknown): error is DatabaseError {
  return Boolean(error && typeof error === "object" && "message" in error && "code" in error);
}
