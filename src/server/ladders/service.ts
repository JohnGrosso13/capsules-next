import {
  insertCapsuleLadderRecord,
  updateCapsuleLadderRecord,
  getCapsuleLadderRecordById,
  listCapsuleLaddersByCapsule,
  replaceCapsuleLadderMemberRecords,
  listCapsuleLadderMemberRecords,
  deleteCapsuleLadderRecord,
  getCapsuleLadderBySlug,
  type InsertCapsuleLadderParams,
} from "./repository";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  CapsuleLadderMemberInput,
  CapsuleLadderSummary,
  LadderAiPlan,
  LadderConfig,
  LadderGameConfig,
  LadderSectionBlock,
  LadderSections,
  LadderStatus,
  LadderVisibility,
} from "@/types/ladders";
import { findCapsuleById, getCapsuleMemberRecord } from "@/server/capsules/repository";
import { randomUUID } from "crypto";
import { AIConfigError, callOpenAIChat, extractJSON } from "@/lib/ai/prompter";

export type CreateCapsuleLadderInput = {
  capsuleId: string;
  name: string;
  summary?: string | null;
  visibility?: LadderVisibility;
  status?: LadderStatus;
  game?: LadderGameConfig | null;
  config?: LadderConfig | null;
  sections?: LadderSections | null;
  aiPlan?: LadderAiPlan | null;
  members?: CapsuleLadderMemberInput[];
  meta?: Record<string, unknown> | null;
  publish?: boolean;
  slug?: string | null;
};

export type UpdateCapsuleLadderInput = {
  name?: string;
  summary?: string | null;
  visibility?: LadderVisibility;
  status?: LadderStatus;
  game?: LadderGameConfig | null;
  config?: LadderConfig | null;
  sections?: LadderSections | null;
  aiPlan?: LadderAiPlan | null;
  meta?: Record<string, unknown> | null;
  publish?: boolean;
  archive?: boolean;
  slug?: string | null;
  members?: CapsuleLadderMemberInput[] | null;
};

export type GetCapsuleLadderOptions = {
  includeMembers?: boolean;
};

export type ListCapsuleLaddersOptions = {
  includeDrafts?: boolean;
  includeArchived?: boolean;
};

type OpenAIJsonSchema = { name: string; schema: Record<string, unknown> };

export type LadderDraftSeed = {
  goal?: string | null;
  audience?: string | null;
  tone?: string | null;
  capsuleBrief?: string | null;
  existingRules?: string | null;
  prizeIdeas?: string[] | null;
  announcementsFocus?: string[] | null;
  shoutouts?: string[] | null;
  timezone?: string | null;
  seasonLengthWeeks?: number | null;
  participants?: number | null;
  registrationNotes?: string | null;
  game?: {
    title?: string | null;
    mode?: string | null;
    platform?: string | null;
    region?: string | null;
  } | null;
  notes?: string | null;
};

export type LadderDraftResult = {
  name: string;
  summary: string | null;
  game: LadderGameConfig;
  config: LadderConfig;
  sections: LadderSections;
  aiPlan: LadderAiPlan | null;
  members: CapsuleLadderMemberInput[];
  visibility: LadderVisibility;
  status: LadderStatus;
  publish: boolean;
  meta: Record<string, unknown> | null;
};

const LADDER_SECTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 3, maxLength: 80 },
    body: { type: "string", maxLength: 1200 },
    bulletPoints: {
      type: "array",
      items: { type: "string", maxLength: 200 },
      maxItems: 8,
    },
  },
  required: ["title"],
} as const;

const LADDER_MEMBER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    displayName: { type: "string", minLength: 2, maxLength: 80 },
    handle: { type: "string", maxLength: 40 },
    seed: { type: "integer", minimum: 1, maximum: 999 },
    rank: { type: "integer", minimum: 1, maximum: 999 },
    rating: { type: "integer", minimum: 100, maximum: 4000 },
    wins: { type: "integer", minimum: 0, maximum: 500 },
    losses: { type: "integer", minimum: 0, maximum: 500 },
    draws: { type: "integer", minimum: 0, maximum: 500 },
    streak: { type: "integer", minimum: -20, maximum: 20 },
    metadata: { type: "object", additionalProperties: true },
  },
  required: ["displayName"],
} as const;

const LADDER_DRAFT_RESPONSE_SCHEMA: OpenAIJsonSchema = {
  name: "ladder_blueprint",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 3, maxLength: 80 },
      summary: { type: "string", minLength: 20, maxLength: 280 },
      visibility: { type: "string", enum: ["private", "capsule", "public"] },
      publish: { type: "boolean" },
      game: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 3, maxLength: 80 },
          franchise: { type: "string", maxLength: 80 },
          mode: { type: "string", maxLength: 80 },
          platform: { type: "string", maxLength: 60 },
          region: { type: "string", maxLength: 60 },
          summary: { type: "string", maxLength: 200 },
        },
      },
      config: { type: "object", additionalProperties: true },
      sections: {
        type: "object",
        additionalProperties: false,
        properties: {
          overview: LADDER_SECTION_SCHEMA,
          rules: LADDER_SECTION_SCHEMA,
          shoutouts: LADDER_SECTION_SCHEMA,
          upcoming: LADDER_SECTION_SCHEMA,
          results: LADDER_SECTION_SCHEMA,
          custom: {
            type: "array",
            items: LADDER_SECTION_SCHEMA,
            maxItems: 6,
          },
        },
      },
      ai_plan: {
        type: "object",
        additionalProperties: true,
        properties: {
          reasoning: { type: "string", maxLength: 600 },
          prompt: { type: "string", maxLength: 600 },
          suggestions: {
            type: "array",
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string", maxLength: 40 },
                title: { type: "string", maxLength: 60 },
                summary: { type: "string", maxLength: 200 },
                section: {
                  type: "string",
                  enum: ["overview", "rules", "shoutouts", "upcoming", "results", "custom"],
                },
              },
              required: ["title", "summary"],
            },
          },
          metadata: { type: "object", additionalProperties: true },
        },
      },
      members: {
        type: "array",
        items: LADDER_MEMBER_SCHEMA,
        maxItems: 24,
      },
      meta: { type: "object", additionalProperties: true },
    },
    required: ["name", "summary", "game", "config", "sections"],
  },
};

const MANAGER_ROLES = new Set(["owner", "admin", "moderator"]);

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function randomSlugSuffix(): string {
  const raw = randomUUID().replace(/[^a-z0-9]/gi, "");
  return raw.slice(0, 6).toLowerCase();
}

async function generateUniqueLadderSlug(capsuleId: string, name: string): Promise<string | null> {
  const base = slugify(name).slice(0, 64);
  if (!base.length) return null;

  const candidates = [base];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    candidates.push(`${base}-${randomSlugSuffix()}`);
  }

  for (const candidate of candidates) {
    const existing = await getCapsuleLadderBySlug(capsuleId, candidate);
    if (!existing) {
      return candidate;
    }
  }

  return null;
}

export class CapsuleLadderAccessError extends Error {
  constructor(
    public code: "invalid" | "forbidden" | "not_found",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type CapsuleManagerContext = {
  capsuleId: string;
  ownerId: string;
  actorId: string;
  role: string;
};

async function requireCapsuleManager(
  capsuleId: string,
  actorId: string,
): Promise<CapsuleManagerContext> {
  const normalizedCapsuleId = normalizeId(capsuleId);
  if (!normalizedCapsuleId) {
    throw new CapsuleLadderAccessError("invalid", "A valid capsule identifier is required.", 400);
  }

  const normalizedActorId = normalizeId(actorId);
  if (!normalizedActorId) {
    throw new CapsuleLadderAccessError("forbidden", "Authentication required.", 403);
  }

  const capsule = await findCapsuleById(normalizedCapsuleId);
  if (!capsule?.id) {
    throw new CapsuleLadderAccessError("not_found", "Capsule not found.", 404);
  }
  const ownerId = normalizeId(capsule.created_by_id);
  if (!ownerId) {
    throw new Error("capsule manager check failed: capsule missing owner identifier");
  }
  if (ownerId === normalizedActorId) {
    return {
      capsuleId: normalizedCapsuleId,
      ownerId,
      actorId: normalizedActorId,
      role: "owner",
    };
  }

  const membership = await getCapsuleMemberRecord(normalizedCapsuleId, normalizedActorId);
  const role = membership?.role ?? null;
  if (!role || !MANAGER_ROLES.has(role)) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You must be a capsule owner or moderator to manage ladders.",
      403,
    );
  }

  return {
    capsuleId: normalizedCapsuleId,
    ownerId,
    actorId: normalizedActorId,
    role,
  };
}

type CapsuleViewerContext = {
  capsuleId: string;
  viewerId: string | null;
  role: string | null;
  isOwner: boolean;
  isMember: boolean;
};

async function resolveCapsuleViewer(
  capsuleId: string,
  viewerId: string | null | undefined,
): Promise<CapsuleViewerContext> {
  const normalizedCapsuleId = normalizeId(capsuleId);
  if (!normalizedCapsuleId) {
    throw new CapsuleLadderAccessError("invalid", "A valid capsule identifier is required.", 400);
  }

  const normalizedViewerId = normalizeId(viewerId ?? null);
  const capsule = await findCapsuleById(normalizedCapsuleId);
  if (!capsule?.id) {
    throw new CapsuleLadderAccessError("not_found", "Capsule not found.", 404);
  }
  const ownerId = normalizeId(capsule.created_by_id);
  if (!ownerId) {
    throw new Error("capsule viewer context: capsule missing owner id");
  }

  if (normalizedViewerId && normalizedViewerId === ownerId) {
    return {
      capsuleId: normalizedCapsuleId,
      viewerId: normalizedViewerId,
      role: "owner",
      isOwner: true,
      isMember: true,
    };
  }

  if (!normalizedViewerId) {
    return {
      capsuleId: normalizedCapsuleId,
      viewerId: null,
      role: null,
      isOwner: false,
      isMember: false,
    };
  }

  const membership = await getCapsuleMemberRecord(normalizedCapsuleId, normalizedViewerId);
  const role = membership?.role ?? null;
  return {
    capsuleId: normalizedCapsuleId,
    viewerId: normalizedViewerId,
    role,
    isOwner: false,
    isMember: Boolean(membership),
  };
}

function canViewerAccessLadder(
  ladder: { visibility: LadderVisibility; status: LadderStatus; createdById: string },
  context: CapsuleViewerContext,
  includeDrafts: boolean,
): boolean {
  if (context.isOwner || (context.role && MANAGER_ROLES.has(context.role))) {
    return true;
  }

  if (ladder.visibility === "public") {
    return ladder.status !== "draft" || includeDrafts;
  }

  if (ladder.visibility === "capsule") {
    return (
      context.isMember &&
      (ladder.status === "active" || ladder.status === "archived" || includeDrafts)
    );
  }

  // private ladders are restricted to managers or the ladder creator
  if (ladder.visibility === "private") {
    return (
      ladder.createdById === context.viewerId ||
      (context.role !== null && MANAGER_ROLES.has(context.role))
    );
  }

  return false;
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed.length) return "Untitled Ladder";
  return trimmed.slice(0, 80);
}

function sanitizeText(value: unknown, maxLength: number, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact.length) return fallback;
  return compact.slice(0, maxLength);
}

function sanitizeVisibility(
  value: unknown,
  fallback: LadderVisibility = "capsule",
): LadderVisibility {
  const normalized = sanitizeText(value, 20, null)?.toLowerCase();
  if (normalized === "private" || normalized === "public") return normalized;
  if (normalized === "capsule") return "capsule";
  return fallback;
}

function sanitizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

function sanitizeNumber(
  value: unknown,
  fallback: number | null,
  min?: number,
  max?: number,
): number | null {
  let resolved: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    resolved = value;
  } else if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) resolved = parsed;
  }
  if (resolved === null) return fallback;
  if (typeof min === "number" && resolved < min) resolved = min;
  if (typeof max === "number" && resolved > max) resolved = max;
  if (!Number.isFinite(resolved)) return fallback;
  return resolved;
}

function sanitizeStringList(value: unknown, maxLength: number, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (out.length >= maxItems) break;
    let candidate: string | null = null;
    if (typeof entry === "string") {
      candidate = sanitizeText(entry, maxLength, null);
    } else if (entry && typeof entry === "object") {
      const source = entry as Record<string, unknown>;
      candidate =
        sanitizeText(source.text, maxLength, null) ??
        sanitizeText(source.title, maxLength, null) ??
        sanitizeText(source.body, maxLength, null);
    }
    if (candidate && !out.includes(candidate)) {
      out.push(candidate);
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function generateSectionId(title: string): string {
  const base = slugify(title || "section").slice(0, 24) || "section";
  return `${base}-${randomSlugSuffix()}`;
}

function sanitizeSectionBlock(raw: unknown, fallbackTitle: string): LadderSectionBlock {
  const source = isPlainObject(raw) ? raw : {};
  const title = sanitizeText(source.title, 80, fallbackTitle) ?? fallbackTitle;
  const body = sanitizeText(source.body, 1200, null);
  const bullets =
    sanitizeStringList(source.bulletPoints ?? source.bullets ?? source.highlights, 160, 6);
  return {
    id: generateSectionId(title),
    title,
    body,
    bulletPoints: bullets.length ? bullets : undefined,
  };
}

function sanitizeSections(raw: unknown): LadderSections {
  const source = isPlainObject(raw) ? raw : {};
  const overview = sanitizeSectionBlock(source.overview, "Ladder Overview");
  if (!overview.body) {
    overview.body =
      "Welcome competitors—this ladder keeps your community active with AI-assisted match flow, live stat shoutouts, and weekly challenges.";
  }
  const rules = sanitizeSectionBlock(source.rules, "Core Rules");
  if (!rules.body && !rules.bulletPoints?.length) {
    rules.bulletPoints = [
      "Match reporting within 24 hours with score screenshots",
      "ELO shifts scale with opponent rank (upsets matter)",
      "Three strike policy for no-shows or dispute escalations",
    ];
  }
  const shoutouts = sanitizeSectionBlock(source.shoutouts, "Spotlight & Shoutouts");
  const upcoming = sanitizeSectionBlock(source.upcoming, "Upcoming Challenges");
  const results = sanitizeSectionBlock(source.results, "Recent Results");

  const customSections = Array.isArray(source.custom)
    ? (source.custom as unknown[])
        .map((entry, index) => {
          const fallback = `Feature Block ${index + 1}`;
          const block = sanitizeSectionBlock(entry, fallback);
          return block;
        })
        .filter((block) => block.title.trim().length)
    : [];

  return {
    overview,
    rules,
    shoutouts,
    upcoming,
    results,
    custom: customSections.length ? customSections : undefined,
  };
}

function sanitizeMembers(raw: unknown): CapsuleLadderMemberInput[] {
  if (!Array.isArray(raw)) return [];
  const out: CapsuleLadderMemberInput[] = [];
  raw.slice(0, 24).forEach((entry, index) => {
    const source = isPlainObject(entry) ? entry : {};
    const displayName =
      sanitizeText(source.displayName, 80, null) ??
      sanitizeText(source.name, 80, null) ??
      sanitizeText(source.handle, 80, null);
    if (!displayName) return;
    const handle = sanitizeText(source.handle ?? source.gamertag ?? source.alias, 40, null);
    const seed = sanitizeNumber(source.seed, index + 1, 1, 999) ?? index + 1;
    const rank = sanitizeNumber(source.rank, index + 1, 1, 999) ?? seed;
    const rating = sanitizeNumber(source.rating, 1200, 100, 4000) ?? 1200 - index * 25;
    const wins = sanitizeNumber(source.wins, 0, 0, 500) ?? 0;
    const losses = sanitizeNumber(source.losses, 0, 0, 500) ?? 0;
    const draws = sanitizeNumber(source.draws, 0, 0, 500) ?? 0;
    const streak = sanitizeNumber(source.streak, 0, -20, 20) ?? 0;
    const metadata = isPlainObject(source.metadata) ? (source.metadata as Record<string, unknown>) : null;
    out.push({
      displayName,
      handle,
      seed,
      rank,
      rating,
      wins,
      losses,
      draws,
      streak,
      metadata: metadata ?? undefined,
    });
  });
  return out;
}

function sanitizeGame(raw: unknown, seed: LadderDraftSeed): LadderGameConfig {
  const source = isPlainObject(raw) ? raw : {};
  const seedGame = seed.game ?? {};
  return {
    title:
      sanitizeText(source.title, 80, null) ??
      sanitizeText(seedGame.title, 80, null) ??
      "Featured Game",
    franchise: sanitizeText(source.franchise ?? seedGame.franchise, 80, null),
    mode: sanitizeText(source.mode ?? seedGame.mode, 80, null),
    platform: sanitizeText(source.platform ?? seedGame.platform, 60, null),
    region: sanitizeText(source.region ?? seedGame.region, 60, null),
    summary: sanitizeText(source.summary, 200, null),
  };
}

function sanitizeScheduleConfig(
  config: LadderConfig,
  seed: LadderDraftSeed,
): LadderConfig["schedule"] {
  const schedule: LadderConfig["schedule"] = isPlainObject(config.schedule)
    ? (config.schedule as LadderConfig["schedule"])
    : {};
  if (seed.timezone && !schedule?.timezone) {
    schedule!.timezone = sanitizeText(seed.timezone, 60, null);
  }
  if (seed.seasonLengthWeeks && !schedule?.cadence) {
    schedule!.cadence = `${seed.seasonLengthWeeks}-week sprint`;
  }
  if (!schedule?.kickoff) {
    schedule!.kickoff = "Next Monday 7pm local";
  }
  return schedule;
}

function sanitizeConfig(raw: unknown, seed: LadderDraftSeed): LadderConfig {
  const config: LadderConfig = isPlainObject(raw) ? ({ ...raw } as LadderConfig) : {};
  config.scoring = isPlainObject(config.scoring)
    ? (config.scoring as LadderConfig["scoring"])
    : {};
  if (!config.scoring) config.scoring = {};
  const scoring = config.scoring!;
  scoring.system = "elo";
  if (scoring.initialRating == null) scoring.initialRating = 1200;
  if (scoring.kFactor == null) scoring.kFactor = 32;
  if (scoring.placementMatches == null) scoring.placementMatches = 3;

  config.schedule = sanitizeScheduleConfig(config, seed);

  config.registration = isPlainObject(config.registration)
    ? (config.registration as LadderConfig["registration"])
    : {};
  if (!config.registration) config.registration = {};
  if (seed.participants && !config.registration!.maxTeams) {
    config.registration!.maxTeams = seed.participants;
  }
  if (seed.registrationNotes) {
    const note = sanitizeText(seed.registrationNotes, 160, null);
    if (note) {
      const requirements = Array.isArray(config.registration!.requirements)
        ? [...config.registration!.requirements!]
        : [];
      if (!requirements.includes(note)) {
        requirements.push(note);
      }
      config.registration!.requirements = requirements;
    }
  }

  if (!config.objectives && seed.goal) {
    config.objectives = [sanitizeText(seed.goal, 140, "Grow weekly activity")!];
  }

  if (!config.communications) {
    config.communications = {};
  }
  if (!config.communications?.announcementsCadence) {
    config.communications!.announcementsCadence = "Weekly recap + midweek AI shoutouts";
  }

  return config;
}

function sanitizeAiPlan(
  raw: unknown,
  seed: LadderDraftSeed,
  summary: string | null,
): LadderAiPlan | null {
  if (!isPlainObject(raw)) {
    return {
      generatedAt: new Date().toISOString(),
      reasoning:
        summary ??
        "AI generated ladder blueprint balancing steady weekly play with hype-worthy spotlight matches.",
      metadata: { seed },
    };
  }
  const source = raw as Record<string, unknown>;
  const reasoning =
    sanitizeText(source.reasoning, 600, null) ??
    sanitizeText(source.summary, 600, null) ??
    summary ??
    null;
  const prompt = sanitizeText(source.prompt, 600, null);
  const suggestionsRaw = Array.isArray(source.suggestions)
    ? (source.suggestions as unknown[])
    : [];
  const suggestions = suggestionsRaw
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const suggestion = entry as Record<string, unknown>;
      const title = sanitizeText(suggestion.title ?? suggestion.name, 60, null);
      const detail =
        sanitizeText(suggestion.summary ?? suggestion.body ?? suggestion.detail, 200, null) ?? null;
      if (!title || !detail) return null;
      const section = sanitizeText(suggestion.section, 24, null) as keyof LadderSections | null;
      return {
        id: sanitizeText(suggestion.id, 40, null) ?? randomSlugSuffix(),
        title,
        summary: detail,
        section: section ?? null,
      };
    })
    .filter((entry): entry is NonNullable<LadderAiPlan["suggestions"]>[number] => Boolean(entry));

  const metadata = isPlainObject(source.metadata)
    ? { ...source.metadata, seed }
    : { seed };

  return {
    generatedAt: new Date().toISOString(),
    reasoning: reasoning ?? undefined,
    prompt: prompt ?? undefined,
    suggestions: suggestions.length ? suggestions : undefined,
    metadata,
  };
}

function sanitizeMeta(raw: unknown, seed: LadderDraftSeed): Record<string, unknown> | null {
  const base = isPlainObject(raw) ? { ...raw } : {};
  base.seed = sanitizeSeedForMeta(seed);
  return Object.keys(base).length ? base : null;
}

function sanitizeSeedForMeta(seed: LadderDraftSeed): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (seed.goal) result.goal = sanitizeText(seed.goal, 160, null);
  if (seed.audience) result.audience = sanitizeText(seed.audience, 120, null);
  if (seed.tone) result.tone = sanitizeText(seed.tone, 120, null);
  if (seed.seasonLengthWeeks) result.seasonLengthWeeks = seed.seasonLengthWeeks;
  if (seed.participants) result.participants = seed.participants;
  if (seed.timezone) result.timezone = sanitizeText(seed.timezone, 60, null);
  if (seed.registrationNotes) result.registrationNotes = sanitizeText(seed.registrationNotes, 160, null);
  if (seed.game) {
    result.game = {
      title: sanitizeText(seed.game.title, 80, null),
      mode: sanitizeText(seed.game.mode, 80, null),
      platform: sanitizeText(seed.game.platform, 60, null),
      region: sanitizeText(seed.game.region, 60, null),
    };
  }
  if (seed.notes) result.notes = sanitizeText(seed.notes, 200, null);
  return result;
}

function sanitizeLadderDraft(
  raw: Record<string, unknown>,
  seed: LadderDraftSeed,
): LadderDraftResult {
  const name = sanitizeText(raw.name, 80, "Ladder Launch") ?? "Ladder Launch";
  const summary = sanitizeText(raw.summary, 260, null);
  const visibility = sanitizeVisibility(raw.visibility, "capsule");
  const publish = sanitizeBoolean(raw.publish, false);

  const game = sanitizeGame(raw.game, seed);
  const config = sanitizeConfig(raw.config, seed);
  const sections = sanitizeSections(raw.sections);
  const aiPlan = sanitizeAiPlan(raw.ai_plan, seed, summary);
  const members = sanitizeMembers(raw.members);
  const meta = sanitizeMeta(raw.meta, seed);

  return {
    name,
    summary,
    game,
    config,
    sections,
    aiPlan,
    members,
    visibility,
    status: publish ? "active" : "draft",
    publish,
    meta,
  };
}

export async function generateLadderDraftForCapsule(
  actorId: string,
  capsuleId: string,
  seed: LadderDraftSeed,
): Promise<LadderDraftResult> {
  const context = await requireCapsuleManager(capsuleId, actorId);
  const capsule = await findCapsuleById(context.capsuleId);
  if (!capsule?.id) {
    throw new CapsuleLadderAccessError("not_found", "Capsule not found.", 404);
  }

  const capsuleName = sanitizeText((capsule as Record<string, unknown>).name, 80, "Capsule") ?? "Capsule";
  const capsuleBrief =
    sanitizeText(seed.capsuleBrief, 280, null) ??
    sanitizeText((capsule as Record<string, unknown>).summary, 280, null);

  const details: string[] = [`Capsule Name: ${capsuleName}`];
  if (capsuleBrief) details.push(`Capsule Brief: ${capsuleBrief}`);
  if (seed.goal) details.push(`Primary Goal: ${sanitizeText(seed.goal, 200, null)}`);
  if (seed.audience) details.push(`Audience: ${sanitizeText(seed.audience, 160, null)}`);
  if (seed.tone) details.push(`Tone: ${sanitizeText(seed.tone, 160, null)}`);
  if (seed.seasonLengthWeeks) details.push(`Season Length (weeks): ${seed.seasonLengthWeeks}`);
  if (seed.participants) details.push(`Target Participants: ${seed.participants}`);
  if (seed.timezone) details.push(`Timezone: ${sanitizeText(seed.timezone, 60, null)}`);
  if (seed.registrationNotes) {
    details.push(`Registration Notes: ${sanitizeText(seed.registrationNotes, 200, null)}`);
  }
  if (seed.game) {
    const seedGame = seed.game;
    const segments: string[] = [];
    if (seedGame.title) segments.push(sanitizeText(seedGame.title, 80, null) ?? "");
    if (seedGame.mode) segments.push(`Mode: ${sanitizeText(seedGame.mode, 60, null)}`);
    if (seedGame.platform) segments.push(`Platform: ${sanitizeText(seedGame.platform, 60, null)}`);
    if (seedGame.region) segments.push(`Region: ${sanitizeText(seedGame.region, 60, null)}`);
    if (segments.length) details.push(`Game Focus: ${segments.filter(Boolean).join(" | ")}`);
  }
  if (seed.existingRules) {
    details.push(`Existing Rules to Honor: ${sanitizeText(seed.existingRules, 260, null)}`);
  }
  if (seed.prizeIdeas?.length) {
    const prizes = sanitizeStringList(seed.prizeIdeas, 120, 5);
    if (prizes.length) details.push(`Prize Ideas: ${prizes.join("; ")}`);
  }
  if (seed.announcementsFocus?.length) {
    const focus = sanitizeStringList(seed.announcementsFocus, 120, 5);
    if (focus.length) details.push(`Announcements Focus: ${focus.join("; ")}`);
  }
  if (seed.shoutouts?.length) {
    const shoutouts = sanitizeStringList(seed.shoutouts, 120, 5);
    if (shoutouts.length) details.push(`Shoutout Themes: ${shoutouts.join("; ")}`);
  }
  if (seed.notes) {
    details.push(`Additional Notes: ${sanitizeText(seed.notes, 280, null)}`);
  }

  const systemMessage = {
    role: "system",
    content:
      "You are LadderForge, an elite esports competition architect. Design AI-augmented ladders that blend weekly momentum, fair matchmaking, and hype moments. Respond ONLY with JSON matching the provided schema. Keep copy concise, motivational, and esports-savvy.",
  } as const;

  const userMessage = {
    role: "user",
    content: [
      "Design a competitive gaming ladder for this capsule.",
      "Requirements:",
      "- Respect the supplied schema and output valid JSON only.",
      "- Use an ELO ladder as the scoring backbone and mention weekly activations.",
      "- Highlight how AI assistants help with moderation, scheduling, and storytelling.",
      "- Include creative rules, shoutouts, and upcoming challenge hooks.",
      "",
      "Inputs:",
      ...details,
    ].join("\n"),
  } as const;

  try {
    const { content } = await callOpenAIChat(
      [systemMessage, userMessage],
      LADDER_DRAFT_RESPONSE_SCHEMA,
      { temperature: 0.45 },
    );
    const parsed =
      extractJSON<Record<string, unknown>>(content) ??
      (JSON.parse(content) as Record<string, unknown>);
    return sanitizeLadderDraft(parsed, seed);
  } catch (error) {
    if (error instanceof AIConfigError) {
      throw error;
    }
    throw new Error(`generate ladder draft failed: ${(error as Error).message}`);
  }
}

export async function createCapsuleLadder(
  actorId: string,
  input: CreateCapsuleLadderInput,
): Promise<{ ladder: CapsuleLadderDetail; members: CapsuleLadderMember[] }> {
  const context = await requireCapsuleManager(input.capsuleId, actorId);

  const slug =
    input.slug ?? (await generateUniqueLadderSlug(context.capsuleId, input.name || ""));

  const shouldPublish = Boolean(input.publish);
  const now = new Date().toISOString();
  const status: LadderStatus = shouldPublish ? "active" : input.status ?? "draft";
  const visibility: LadderVisibility = input.visibility ?? "capsule";

  const insertParams: InsertCapsuleLadderParams = {
    capsuleId: context.capsuleId,
    createdById: context.actorId,
    name: normalizeName(input.name),
    slug,
    summary: input.summary ?? null,
    status,
    visibility,
    game: input.game ?? null,
    config: input.config ?? null,
    sections: input.sections ?? null,
    aiPlan: input.aiPlan ?? null,
    meta: input.meta ?? null,
    publishedAt: shouldPublish ? now : null,
    publishedById: shouldPublish ? context.actorId : null,
  };

  const ladder = await insertCapsuleLadderRecord(insertParams);
  let members: CapsuleLadderMember[] = [];
  if (input.members?.length) {
    members = await replaceCapsuleLadderMemberRecords(ladder.id, input.members);
  }

  return { ladder, members };
}

export async function updateCapsuleLadder(
  actorId: string,
  ladderId: string,
  input: UpdateCapsuleLadderInput,
): Promise<{ ladder: CapsuleLadderDetail | null; members?: CapsuleLadderMember[] }> {
  const existing = await getCapsuleLadderRecordById(ladderId);
  if (!existing) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }

  await requireCapsuleManager(existing.capsuleId, actorId);

  const shouldPublish = Boolean(input.publish);
  const shouldArchive = Boolean(input.archive);
  const patch: UpdateCapsuleLadderInput & {
    publishedAt?: string | null;
    publishedById?: string | null;
  } = { ...input };

  if (shouldPublish) {
    patch.status = "active";
    patch.publishedAt = new Date().toISOString();
    patch.publishedById = actorId;
  } else if (shouldArchive) {
    patch.status = "archived";
    patch.publishedAt = existing.publishedAt;
    patch.publishedById = existing.publishedById;
  }

  if (patch.name) {
    patch.name = normalizeName(patch.name);
  }

  if (patch.slug === undefined && patch.name && !existing.slug) {
    patch.slug = await generateUniqueLadderSlug(existing.capsuleId, patch.name);
  } else if (patch.slug === "") {
    patch.slug = null;
  }

  const updated = await updateCapsuleLadderRecord(ladderId, patch);

  let members: CapsuleLadderMember[] | undefined;
  if (input.members) {
    members = await replaceCapsuleLadderMemberRecords(
      ladderId,
      input.members ?? ([] as CapsuleLadderMemberInput[]),
    );
  }

  return { ladder: updated, members };
}

export async function deleteCapsuleLadder(actorId: string, ladderId: string): Promise<void> {
  const existing = await getCapsuleLadderRecordById(ladderId);
  if (!existing) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(existing.capsuleId, actorId);
  await deleteCapsuleLadderRecord(ladderId);
}

export async function getCapsuleLadderForViewer(
  ladderId: string,
  viewerId: string | null | undefined,
  options: GetCapsuleLadderOptions = {},
): Promise<{ ladder: CapsuleLadderDetail; members?: CapsuleLadderMember[] }> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }

  const viewer = await resolveCapsuleViewer(ladder.capsuleId, viewerId);
  const canAccess = canViewerAccessLadder(ladder, viewer, false);
  if (!canAccess) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You do not have permission to view this ladder.",
      403,
    );
  }

  let members: CapsuleLadderMember[] | undefined;
  if (options.includeMembers) {
    members = await listCapsuleLadderMemberRecords(ladder.id);
  }

  return { ladder, members };
}

export async function listCapsuleLaddersForViewer(
  capsuleId: string,
  viewerId: string | null | undefined,
  options: ListCapsuleLaddersOptions = {},
): Promise<CapsuleLadderSummary[]> {
  const viewer = await resolveCapsuleViewer(capsuleId, viewerId);
  const ladders = await listCapsuleLaddersByCapsule(viewer.capsuleId);

  const includeDrafts = options.includeDrafts ?? viewer.isOwner || MANAGER_ROLES.has(viewer.role ?? "");
  const includeArchived =
    options.includeArchived ?? viewer.isOwner || MANAGER_ROLES.has(viewer.role ?? "");

  return ladders.filter((ladder) => {
    if (!includeArchived && ladder.status === "archived") {
      return false;
    }
    if (!includeDrafts && ladder.status === "draft") {
      return false;
    }
    return canViewerAccessLadder(ladder, viewer, includeDrafts);
  });
}

export async function replaceCapsuleLadderMembers(
  actorId: string,
  ladderId: string,
  members: CapsuleLadderMemberInput[],
): Promise<CapsuleLadderMember[]> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  return replaceCapsuleLadderMemberRecords(ladder.id, members);
}
