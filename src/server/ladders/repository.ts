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
  LadderAiPlan,
  LadderConfig,
  LadderGameConfig,
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
  return {
    id,
    ladderId,
    userId: normalizeString(row.user_id),
    displayName,
    handle: normalizeString(row.handle),
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
    const result = await db
      .from("capsule_ladders")
      .update(payload)
      .eq("id", ladderId)
      .select<LadderRow>("*")
      .maybeSingle();

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
    seed: member.seed ?? null,
    rank: member.rank ?? null,
    rating: member.rating ?? 1200,
    wins: member.wins ?? 0,
    losses: member.losses ?? 0,
    draws: member.draws ?? 0,
    streak: member.streak ?? 0,
    metadata: member.metadata ?? null,
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
  if (patch.seed !== undefined) payload.seed = patch.seed ?? null;
  if (patch.rank !== undefined) payload.rank = patch.rank ?? null;
  if (patch.rating !== undefined) payload.rating = patch.rating ?? null;
  if (patch.wins !== undefined) payload.wins = patch.wins ?? null;
  if (patch.losses !== undefined) payload.losses = patch.losses ?? null;
  if (patch.draws !== undefined) payload.draws = patch.draws ?? null;
  if (patch.streak !== undefined) payload.streak = patch.streak ?? null;
  if (patch.metadata !== undefined) payload.metadata = patch.metadata ?? null;

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
      seed: member.seed ?? null,
      rank: member.rank ?? null,
      rating: member.rating ?? 1200,
      wins: member.wins ?? 0,
      losses: member.losses ?? 0,
      draws: member.draws ?? 0,
      streak: member.streak ?? 0,
      metadata: member.metadata ?? null,
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
    if (isDatabaseError(error)) {
      throw decorateDatabaseError("replace capsule_ladder_members", error);
    }
    throw error;
  }
}

function isDatabaseError(error: unknown): error is DatabaseError {
  return Boolean(error && typeof error === "object" && "message" in error && "code" in error);
}
