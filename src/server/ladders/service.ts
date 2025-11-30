import {
  insertCapsuleLadderRecord,
  updateCapsuleLadderRecord,
  getCapsuleLadderRecordById,
  listCapsuleLaddersByCapsule,
  listCapsuleLadderMemberRecords,
  insertCapsuleLadderMemberRecords,
  updateCapsuleLadderMemberRecord,
  deleteCapsuleLadderMemberRecord,
  getCapsuleLadderMemberRecordById,
  listLaddersByParticipant,
  replaceCapsuleLadderMemberRecords,
  deleteCapsuleLadderRecord,
  getCapsuleLadderBySlug,
  type InsertCapsuleLadderParams,
} from "./repository";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  CapsuleLadderMemberInput,
  CapsuleLadderMemberUpdateInput,
  CapsuleLadderSummary,
  LadderAiPlan,
  LadderAiSuggestion,
  LadderConfig,
  LadderGameConfig,
  LadderChallenge,
  LadderChallengeOutcome,
  LadderChallengeResult,
  LadderMatchRecord,
  LadderRegistrationConfig,
  LadderScheduleConfig,
  LadderScoringConfig,
  LadderSectionBlock,
  LadderStateMeta,
  LadderSections,
  LadderStatus,
  LadderVisibility,
} from "@/types/ladders";
import {
  findCapsuleById,
  listCapsulesForUser,
  type CapsuleRow,
} from "@/server/capsules/repository";
import { enqueueCapsuleKnowledgeRefresh } from "@/server/capsules/knowledge";
import { notifyLadderChallenge } from "@/server/notifications/triggers";
import { randomUUID } from "crypto";
import { AIConfigError, callOpenAIChat, extractJSON } from "@/lib/ai/prompter";
import {
  buildContextMetadata,
  getCapsuleHistorySnippets,
  getChatContext,
} from "@/server/chat/retrieval";
import {
  fetchStructuredPayloads,
  findCapsulePosts,
  getCapsuleMembershipStats,
} from "@/server/capsules/structured";
import { resolveCapsuleMediaUrl } from "@/server/capsules/domain/common";
import { canManageLadders, resolveCapsuleActor } from "@/server/capsules/permissions";

type ScoringSystem = "simple" | "elo" | "ai" | "points" | "custom";

const DEFAULT_INITIAL_RATING = 1200;
const DEFAULT_K_FACTOR = 32;
const DEFAULT_PLACEMENT_MATCHES = 3;
const MIN_RATING = 100;
const MAX_RATING = 4000;

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

export type DiscoverLadderSummary = CapsuleLadderSummary & {
  capsule: {
    id: string;
    name: string | null;
    slug: string | null;
    bannerUrl: string | null;
    logoUrl: string | null;
  } | null;
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
    body: { type: "string", minLength: 24, maxLength: 1200 },
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
        required: ["title"],
      },
      config: {
        type: "object",
        additionalProperties: true,
        properties: {
          scoring: {
            type: "object",
            additionalProperties: true,
            properties: {
              system: { type: "string", enum: ["simple", "elo", "ai", "points", "custom"] },
              initialRating: { type: "integer" },
              kFactor: { type: "integer" },
              placementMatches: { type: "integer" },
              decayPerDay: { type: "integer" },
              bonusForStreak: { type: "integer" },
            },
            required: ["system"],
          },
          schedule: {
            type: "object",
            additionalProperties: true,
            properties: {
              cadence: { type: "string", minLength: 6, maxLength: 120 },
              kickoff: { type: "string", minLength: 3, maxLength: 120 },
              timezone: { type: "string", minLength: 2, maxLength: 60 },
            },
            required: ["cadence"],
          },
          registration: {
            type: "object",
            additionalProperties: true,
            properties: {
              type: { type: "string", enum: ["open", "invite", "waitlist"] },
              maxTeams: { type: "integer" },
              requirements: { type: "array", items: { type: "string", maxItems: 200 }, maxItems: 8 },
              opensAt: { type: "string" },
              closesAt: { type: "string" },
            },
            required: ["type"],
          },
        },
        required: ["scoring", "schedule", "registration"],
      },
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
        required: ["overview", "rules", "shoutouts", "upcoming", "results"],
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

function normalizeScoringSystem(value: unknown): ScoringSystem {
  if (typeof value !== "string") return "elo";
  const cleaned = value.trim().toLowerCase();
  if (cleaned === "simple" || cleaned === "elo" || cleaned === "ai" || cleaned === "points" || cleaned === "custom") {
    return cleaned as ScoringSystem;
  }
  if (cleaned.includes("ai")) return "ai";
  if (cleaned.includes("simple") || cleaned.includes("casual") || cleaned.includes("points")) return "simple";
  return "elo";
}

function resolveScoringConfig(ladder: CapsuleLadderDetail): Required<LadderScoringConfig> & { system: ScoringSystem } {
  const scoring = (ladder.config?.scoring as LadderScoringConfig | undefined) ?? {};
  return {
    system: normalizeScoringSystem(scoring.system),
    initialRating: scoring.initialRating ?? DEFAULT_INITIAL_RATING,
    kFactor: scoring.kFactor ?? DEFAULT_K_FACTOR,
    placementMatches: scoring.placementMatches ?? DEFAULT_PLACEMENT_MATCHES,
    decayPerDay: scoring.decayPerDay ?? 0,
    bonusForStreak: scoring.bonusForStreak ?? 0,
  };
}

function normalizeRatingValue(value: number | null | undefined, initialRating: number): number {
  const rating = typeof value === "number" && Number.isFinite(value) ? value : initialRating;
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(rating)));
}

function sortMembersByRating(members: CapsuleLadderMember[], initialRating: number): CapsuleLadderMember[] {
  return [...members]
    .map((member) => ({
      ...member,
      rating: normalizeRatingValue(member.rating, initialRating),
    }))
    .sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      if ((b.wins ?? 0) !== (a.wins ?? 0)) return (b.wins ?? 0) - (a.wins ?? 0);
      if ((a.losses ?? 0) !== (b.losses ?? 0)) return (a.losses ?? 0) - (b.losses ?? 0);
      return a.displayName.localeCompare(b.displayName);
    })
    .map((member, index) => ({ ...member, rank: index + 1 }));
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function mapCapsuleIdentity(
  capsule: CapsuleRow | null,
  origin: string | null,
): DiscoverLadderSummary["capsule"] {
  if (!capsule) return null;
  const capsuleId = normalizeId(capsule.id);
  if (!capsuleId) return null;
  return {
    id: capsuleId,
    name: typeof capsule.name === "string" ? capsule.name : null,
    slug: typeof capsule.slug === "string" ? capsule.slug : null,
    bannerUrl: resolveCapsuleMediaUrl(
      typeof capsule.banner_url === "string" ? capsule.banner_url : null,
      origin,
    ),
    logoUrl: resolveCapsuleMediaUrl(
      typeof capsule.logo_url === "string" ? capsule.logo_url : null,
      origin,
    ),
  };
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
  const actor = await resolveCapsuleActor(capsuleId, actorId);
  if (!canManageLadders(actor)) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You must be a capsule founder, admin, or leader to manage ladders.",
      403,
    );
  }
  return {
    capsuleId: actor.capsuleId,
    ownerId: actor.ownerId,
    actorId: actor.actorId,
    role: actor.role ?? "member",
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
  const normalizedViewerId = normalizeId(viewerId ?? null);
  const actor = normalizedViewerId
    ? await resolveCapsuleActor(capsuleId, normalizedViewerId)
    : await (async () => {
        const normalizedCapsuleId = normalizeId(capsuleId);
        if (!normalizedCapsuleId) {
          throw new CapsuleLadderAccessError("invalid", "A valid capsule identifier is required.", 400);
        }
        const capsule = await findCapsuleById(normalizedCapsuleId);
        if (!capsule?.id) {
          throw new CapsuleLadderAccessError("not_found", "Capsule not found.", 404);
        }
        const ownerId = normalizeId(capsule.created_by_id);
        if (!ownerId) {
          throw new Error("capsule viewer context: capsule missing owner id");
        }
        return {
          capsuleId: normalizedCapsuleId,
          ownerId,
          actorId: "",
          role: null,
          isOwner: false,
          capsule,
        };
      })();

  return {
    capsuleId: actor.capsuleId,
    viewerId: normalizedViewerId,
    role: actor.role ?? null,
    isOwner: actor.isOwner,
    isMember: actor.isOwner || Boolean(actor.role),
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

function normalizeTimestampString(value: unknown): string | null {
  if (typeof value === "string" || value instanceof Date) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
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
  const block: LadderSectionBlock = {
    id: generateSectionId(title),
    title,
    body,
  };
  if (bullets.length) {
    block.bulletPoints = bullets;
  }
  return block;
}

function sanitizeSections(raw: unknown): LadderSections {
  const source = isPlainObject(raw) ? raw : {};
  const overview = sanitizeSectionBlock(source.overview, "Ladder Overview");
  const rules = sanitizeSectionBlock(source.rules, "Core Rules");
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

  const sections: LadderSections = {
    overview,
    rules,
    shoutouts,
    upcoming,
    results,
  };
  if (customSections.length) {
    sections.custom = customSections;
  }
  return sections;
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
    const memberInput: CapsuleLadderMemberInput = {
      displayName,
      handle,
      seed,
      rank,
      rating,
      wins,
      losses,
      draws,
      streak,
    };
    if (metadata) {
      memberInput.metadata = metadata;
    }
    out.push(memberInput);
  });
  return out;
}

function sanitizeGame(raw: unknown, seed: LadderDraftSeed): LadderGameConfig {
  const source = isPlainObject(raw) ? raw : {};
  const seedGame = (seed.game ?? {}) as Record<string, unknown>;
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

function sanitizeScheduleConfig(config: LadderConfig, seed: LadderDraftSeed): LadderScheduleConfig {
  const schedule: LadderScheduleConfig = isPlainObject(config.schedule)
    ? { ...(config.schedule as LadderScheduleConfig) }
    : {};
  if (seed.timezone && !schedule.timezone) {
    schedule.timezone = sanitizeText(seed.timezone, 60, null) ?? schedule.timezone ?? null;
  }
  if (seed.seasonLengthWeeks && !schedule.cadence) {
    schedule.cadence = `${seed.seasonLengthWeeks}-week sprint`;
  }
  return schedule;
}

function sanitizeConfig(raw: unknown, seed: LadderDraftSeed): LadderConfig {
  const config: LadderConfig = isPlainObject(raw) ? ({ ...raw } as LadderConfig) : {};
  const scoring: LadderScoringConfig = isPlainObject(config.scoring)
    ? { ...(config.scoring as LadderScoringConfig) }
    : {};
  scoring.system = normalizeScoringSystem((scoring as { system?: unknown }).system);
  if (scoring.initialRating == null) scoring.initialRating = 1200;
  if (scoring.kFactor == null) scoring.kFactor = 32;
  if (scoring.placementMatches == null) scoring.placementMatches = 3;
  config.scoring = scoring;

  config.schedule = sanitizeScheduleConfig(config, seed);

  const registration: LadderRegistrationConfig = isPlainObject(config.registration)
    ? { ...(config.registration as LadderRegistrationConfig) }
    : {};
  if (seed.participants && !registration.maxTeams) {
    registration.maxTeams = seed.participants;
  }
  if (seed.registrationNotes) {
    const note = sanitizeText(seed.registrationNotes, 160, null);
    if (note) {
      const requirements = Array.isArray(registration.requirements)
        ? [...registration.requirements]
        : [];
      if (!requirements.includes(note)) {
        requirements.push(note);
      }
      registration.requirements = requirements;
    }
  }
  config.registration = registration;

  if (!config.objectives && seed.goal) {
    config.objectives = [sanitizeText(seed.goal, 140, "Grow weekly activity")!];
  }

  const communications = isPlainObject(config.communications)
    ? { ...(config.communications as LadderConfig["communications"]) }
    : {};
  if (!communications?.announcementsCadence) {
    communications.announcementsCadence = "Weekly recap + midweek AI shoutouts";
  }
  config.communications = communications;

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
    .map((entry): LadderAiSuggestion | null => {
      if (!isPlainObject(entry)) return null;
      const suggestion = entry as Record<string, unknown>;
      const title = sanitizeText(suggestion.title ?? suggestion.name, 60, null);
      const detail =
        sanitizeText(suggestion.summary ?? suggestion.body ?? suggestion.detail, 200, null) ?? null;
      if (!title || !detail) return null;
      const section = sanitizeText(suggestion.section, 24, null) as keyof LadderSections | null;
      const result: LadderAiSuggestion = {
        id: sanitizeText(suggestion.id, 40, null) ?? randomSlugSuffix(),
        title,
        summary: detail,
      };
      if (section !== null) {
        result.section = section;
      }
      return result;
    })
    .filter((entry): entry is LadderAiSuggestion => entry !== null);

  const metadata = isPlainObject(source.metadata)
    ? { ...source.metadata, seed }
    : { seed };

  const plan: LadderAiPlan = {
    generatedAt: new Date().toISOString(),
    metadata,
  };
  if (reasoning) {
    plan.reasoning = reasoning;
  }
  if (prompt) {
    plan.prompt = prompt;
  }
  if (suggestions.length) {
    plan.suggestions = suggestions;
  }
  return plan;
}

function sanitizeMeta(
  raw: unknown,
  seed: LadderDraftSeed,
  contextMeta?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const base = isPlainObject(raw) ? { ...raw } : {};
  base.seed = sanitizeSeedForMeta(seed);
  if (contextMeta && Object.keys(contextMeta).length) {
    base.context = contextMeta;
  }
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

const truncateContextSnippet = (value: string, limit = 360): string => {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 3))}...`;
};

const GAME_TEMPLATE_HINTS: Record<
  string,
  { modes?: string[]; cadence?: string; rules?: string[]; platforms?: string[] }
> = {
  "rocket league": {
    modes: ["3v3 standard", "2v2 ranked doubles"],
    cadence: "Weekly play nights + weekend spotlight",
    rules: ["Best-of-five sets", "No sub-ins mid-series without approval"],
    platforms: ["Cross-play", "PC/console parity"],
  },
  valorant: {
    modes: ["5v5 competitive", "Best-of-24 rounds", "Map veto into featured pool"],
    cadence: "Weekly matches, monthly finals lobby",
    rules: ["Timeout limits, agent bans only in finals", "Use in-client match history for proof"],
    platforms: ["PC"],
  },
  overwatch: {
    modes: ["5v5 role queue", "Control/Hybrid/Escort rotations"],
    cadence: "Two match windows per week",
    rules: ["No hero pools unless finals", "Best-of-five control, best-of-three payload"],
    platforms: ["Cross-play with input pooling"],
  },
};

type BlueprintContextSnippet = {
  id: string;
  title: string;
  snippet: string;
  source: string;
  createdAt?: string | null;
  weight?: number;
};

async function collectBlueprintContext(
  actorId: string,
  capsuleId: string,
  seed: LadderDraftSeed,
): Promise<{ prompt: string | null; metadata: Record<string, unknown> | null }> {
  const queryParts = [
    sanitizeText(seed.goal, 260, null),
    sanitizeText(seed.audience, 200, null),
    sanitizeText(seed.notes, 260, null),
    sanitizeText(seed.existingRules, 200, null),
    sanitizeText(seed.registrationNotes, 200, null),
    sanitizeText(seed.prizeIdeas?.join(" "), 200, null),
  ].filter((entry): entry is string => Boolean(entry));
  const query = queryParts.join("\n").trim();

  const keywords = query
    .toLowerCase()
    .split(/[^a-z0-9+]+/i)
    .filter((token) => token.length > 2);

  const snippets: BlueprintContextSnippet[] = [];
  const addSnippet = (snippet: BlueprintContextSnippet | null) => {
    if (!snippet) return;
    const cleaned = truncateContextSnippet(snippet.snippet, 400);
    if (!cleaned.length) return;
    snippets.push({ ...snippet, snippet: cleaned });
  };

  const rankSnippet = (snippet: BlueprintContextSnippet): number => {
    const text = `${snippet.title} ${snippet.snippet}`.toLowerCase();
    let score = snippet.weight ?? 1;
    keywords.forEach((keyword) => {
      if (text.includes(keyword)) {
        score += 1.5;
      }
    });
    if (snippet.createdAt) {
      const ts = Date.parse(snippet.createdAt);
      if (!Number.isNaN(ts)) {
        const ageDays = Math.max(1, (Date.now() - ts) / (1000 * 60 * 60 * 24));
        score += Math.max(0, 6 - Math.log2(ageDays + 1));
      }
    }
    return score;
  };

  try {
    const context = await getChatContext({
      ownerId: actorId,
      capsuleId,
      message: query.slice(0, 1800),
      limit: 10,
      origin: "ladders.blueprint",
    });
    const metadata = buildContextMetadata(context);
    context?.snippets?.forEach((entry) =>
      addSnippet({
        id: entry.id,
        title: entry.title ?? "Capsule memory",
        snippet: entry.snippet,
        source: entry.source ?? entry.kind ?? "memory",
        createdAt: entry.createdAt ?? null,
      }),
    );

    const historySnippets = await getCapsuleHistorySnippets({
      capsuleId,
      viewerId: actorId,
      limit: 4,
      query: query.length ? query : null,
    });
    historySnippets.forEach((entry) =>
      addSnippet({
        id: entry.id,
        title: entry.title ?? "Capsule history",
        snippet: entry.snippet,
        source: entry.source ?? entry.kind ?? "history",
        createdAt: entry.createdAt ?? null,
        weight: 2,
      }),
    );

    const membershipPayloads = await fetchStructuredPayloads({
      capsuleId,
      intents: [{ kind: "membership" }],
    }).catch(() => []);
    membershipPayloads
      .filter((payload) => payload.kind === "membership")
      .forEach((payload) => {
        const membership = payload as Awaited<ReturnType<typeof getCapsuleMembershipStats>>;
        const rolesLine = membership.roleCounts
          .slice(0, 3)
          .map((entry) => `${entry.role}: ${entry.count}`)
          .join(" | ");
        const recentLine =
          membership.recentJoins.length && membership.recentJoins[0]
            ? `Recent joins - ${membership.recentJoins[0].label}: ${membership.recentJoins[0].count}`
            : "";
        addSnippet({
          id: "membership-summary",
          title: "Membership snapshot",
          snippet: [`Members: ${membership.totalMembers}`, rolesLine, recentLine].filter(Boolean).join("\n"),
          source: "membership",
          weight: 2.5,
        });
      });

    const posts = await findCapsulePosts({
      capsuleId,
      rangeDays: 120,
      limit: 6,
    }).catch(() => null);
    posts?.posts.slice(0, 4).forEach((post) =>
      addSnippet({
        id: `post:${post.id}`,
        title: posts.filters.author ? `Post by ${post.author}` : "Recent post",
        snippet: `${post.title}${post.createdAt ? ` (${post.createdAt})` : ""}`,
        source: "posts",
        createdAt: post.createdAt,
        weight: 1.2,
      }),
    );

    const ladders = await listCapsuleLaddersByCapsule(capsuleId).catch(() => []);
    ladders.slice(0, 3).forEach((ladder, index) => {
      const game = ladder.game?.title ?? "Game";
      const status = ladder.status ?? "draft";
      const summary = ladder.summary ?? "";
      addSnippet({
        id: `ladder:${ladder.id}`,
        title: `Past ladder ${index + 1}`,
        snippet: `${ladder.name} (${game}, ${status})${summary ? ` - ${summary}` : ""}`,
        source: "ladder_history",
        createdAt: ladder.createdAt,
        weight: 2,
      });
    });

    if (seed.game?.title) {
      const key = seed.game.title.toLowerCase();
      const template = Object.entries(GAME_TEMPLATE_HINTS).find(([name]) => key.includes(name))?.[1];
      if (template) {
        const lines = [
          template.modes?.length ? `Modes: ${template.modes.join(", ")}` : null,
          template.cadence ? `Cadence: ${template.cadence}` : null,
          template.rules?.length ? `Rules: ${template.rules.join(" | ")}` : null,
          template.platforms?.length ? `Platforms: ${template.platforms.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        addSnippet({
          id: `game-template:${key}`,
          title: `${seed.game.title} template`,
          snippet: lines,
          source: "game_template",
          weight: 1.8,
        });
      }
    }

    const ranked = snippets
      .map((snippet) => ({ snippet, score: rankSnippet(snippet) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((entry, index) => ({ ...entry.snippet, rank: index + 1 }));

    if (!ranked.length) {
      return { prompt: null, metadata };
    }

    const lines = ["Context to ground the ladder blueprint (use when relevant):"];
    ranked.forEach((entry) => {
      lines.push(`Context ${entry.rank}: ${entry.title} [${entry.source}]`);
      lines.push(entry.snippet);
      lines.push("---");
    });
    lines.push("Blend these signals into names, format, rules, rewards, cadence, and shoutouts. Respond with JSON only.");
    const usedIds = ranked.map((entry) => entry.id);
    const mergedMetadata = { ...(metadata ?? {}), blueprintContextIds: usedIds };
    return { prompt: lines.join("\n"), metadata: mergedMetadata };
  } catch (error) {
    console.warn("ladder.draft.context_failed", error);
    return { prompt: null, metadata: null };
  }
}

function sanitizeLadderDraft(
  raw: Record<string, unknown>,
  seed: LadderDraftSeed,
  contextMeta?: Record<string, unknown> | null,
): LadderDraftResult {
  const name = sanitizeText(raw.name, 80, null);
  const summary = sanitizeText(raw.summary, 260, null);
  const visibility = sanitizeVisibility(raw.visibility, "capsule");
  const publish = sanitizeBoolean(raw.publish, false);

  const game = sanitizeGame(raw.game, seed);
  const config = sanitizeConfig(raw.config, seed);
  const sections = sanitizeSections(raw.sections);
  const aiPlan = sanitizeAiPlan(raw.ai_plan, seed, summary);
  const members = sanitizeMembers(raw.members);
  const meta = sanitizeMeta(raw.meta, seed, contextMeta);

  const resolvedName = name ?? "Ladder Launch";

  return {
    name: resolvedName,
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

function ensureDraftCoverage(result: LadderDraftResult): void {
  const missing: string[] = [];
  if (!result.name || result.name.length < 3) missing.push("name");
  if (!result.summary || result.summary.length < 20) missing.push("summary");
  if (!result.game?.title || result.game.title.length < 3) missing.push("game.title");
  const registration = result.config?.registration ?? {};
  if (!(registration as Record<string, unknown>)?.type) missing.push("registration.type");
  if (!result.config?.scoring?.system) missing.push("scoring.system");
  const sections = result.sections ?? {};
  const sectionKeys: Array<keyof LadderSections> = ["overview", "rules", "shoutouts", "upcoming", "results"];
  sectionKeys.forEach((key) => {
    const block = (sections as Record<string, LadderSections[keyof LadderSections]>)[key];
    if (!block || Array.isArray(block) || (!block.body && !(block.bulletPoints?.length))) {
      missing.push(`sections.${key}`);
    }
  });
  if (missing.length) {
    throw new Error(`draft_incomplete: ${missing.join(", ")}`);
  }
}

export async function generateLadderDraftForCapsule(
  actorId: string,
  capsuleId: string,
  seed: LadderDraftSeed,
): Promise<LadderDraftResult> {
  const managerContext = await requireCapsuleManager(capsuleId, actorId);
  const capsule = await findCapsuleById(managerContext.capsuleId);
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

  const { prompt: contextPrompt, metadata: contextMetadata } = await collectBlueprintContext(
    actorId,
    managerContext.capsuleId,
    seed,
  );

  const systemMessage = {
    role: "system",
    content:
      "You are Capsule AI. Analyze the user's prompt and fill out a ladder configuration with natural, user-aligned copy. Pick the best scoring format (simple, elo, or ai) for the goal and set config.scoring.system accordingly. Respond ONLY with JSON matching the provided schema.",
  } as const;

  const userMessage = {
    role: "user",
    content: [
      "Design a competitive gaming ladder for this capsule.",
      "Requirements:",
      "- Respect the supplied schema and output valid JSON only.",
      "- Use the user's prompt and tone to decide details; avoid adding marketing/hype language they did not imply.",
      "- Choose the scoring format that fits the intent (simple/elo/ai) and set config.scoring.system; include rating knobs if relevant.",
      "- Fill every section: overview, rules, shoutouts, upcoming, and results with concise, relevant bodies/bullets.",
      "- Set sign-ups: config.registration.type (open/invite/waitlist), a reasonable maxTeams cap if implied, and short requirements/opens/closes if hinted. If honor-system is mentioned, avoid proof/dispute requirements.",
      "- Set schedule: cadence/kickoff/timezone if hinted; if indefinite, mark cadence as ongoing/open.",
      "- Keep names and summaries specific to the game and vibe the user describes.",
      "",
      "Inputs:",
      ...details,
      contextPrompt ? ["", contextPrompt] : [],
    ]
      .flat()
      .join("\n"),
  } as const;

  try {
    const { content } = await callOpenAIChat(
      [systemMessage, userMessage],
      LADDER_DRAFT_RESPONSE_SCHEMA,
      {
        temperature: 0.45,
        // Ladder blueprints can run long with retrieval; give the model more time.
        timeoutMs: 90_000,
      },
    );
    const parsed =
      extractJSON<Record<string, unknown>>(content) ??
      (JSON.parse(content) as Record<string, unknown>);
    const result = sanitizeLadderDraft(parsed, seed, contextMetadata);
    ensureDraftCoverage(result);
    return result;
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

  enqueueCapsuleKnowledgeRefresh(context.capsuleId, null);

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
  if (input.members !== undefined) {
    const nextMembers = input.members ?? [];
    members = await replaceCapsuleLadderMemberRecords(ladderId, nextMembers);
  }

  enqueueCapsuleKnowledgeRefresh(existing.capsuleId, null);

  return members !== undefined ? { ladder: updated, members } : { ladder: updated };
}

export async function deleteCapsuleLadder(actorId: string, ladderId: string): Promise<void> {
  const existing = await getCapsuleLadderRecordById(ladderId);
  if (!existing) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(existing.capsuleId, actorId);
  await deleteCapsuleLadderRecord(ladderId);
  enqueueCapsuleKnowledgeRefresh(existing.capsuleId, null);
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

  return members !== undefined ? { ladder, members } : { ladder };
}

export async function listCapsuleLaddersForViewer(
  capsuleId: string,
  viewerId: string | null | undefined,
  options: ListCapsuleLaddersOptions = {},
): Promise<CapsuleLadderSummary[]> {
  const viewer = await resolveCapsuleViewer(capsuleId, viewerId);
  const ladders = await listCapsuleLaddersByCapsule(viewer.capsuleId);

  const includeDrafts =
    options.includeDrafts ?? (viewer.isOwner || MANAGER_ROLES.has(viewer.role ?? ""));
  const includeArchived =
    options.includeArchived ?? (viewer.isOwner || MANAGER_ROLES.has(viewer.role ?? ""));

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

export async function getRecentLaddersForViewer(
  viewerId: string,
  options: { limit?: number; origin?: string | null } = {},
): Promise<DiscoverLadderSummary[]> {
  const normalizedViewer = normalizeId(viewerId);
  if (!normalizedViewer) return [];

  const origin = options.origin ?? null;
  const requestedLimit = typeof options.limit === "number" ? Math.floor(options.limit) : 12;
  const limit = Math.min(Math.max(requestedLimit, 1), 32);
  const fetchLimit = Math.max(limit * 2, limit + 8);

  const candidateLadders: CapsuleLadderSummary[] = [];

  const participation = await listLaddersByParticipant(normalizedViewer, { limit: fetchLimit });
  for (const entry of participation) {
    candidateLadders.push(entry.ladder);
  }

  const viewerCapsules = await listCapsulesForUser(normalizedViewer);
  for (const capsule of viewerCapsules) {
    // Skip follower-only capsules; we only need ladders from spaces the viewer belongs to or owns.
    if (capsule.ownership === "follower") continue;
    const laddersForCapsule = await listCapsuleLaddersForViewer(capsule.id, normalizedViewer, {
      includeArchived: false,
    });
    candidateLadders.push(...laddersForCapsule);
  }

  const sorted = candidateLadders
    .filter((ladder) => {
      const meta = (ladder.meta ?? null) as Record<string, unknown> | null;
      const variant = typeof meta?.variant === "string" ? meta.variant : null;
      if (variant && variant !== "ladder") {
        return false;
      }
      if (ladder.status === "archived") {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const aTime = Date.parse(a.publishedAt ?? a.createdAt) || 0;
      const bTime = Date.parse(b.publishedAt ?? b.createdAt) || 0;
      return bTime - aTime;
    });

  const seen = new Set<string>();
  const capsuleCache = new Map<string, DiscoverLadderSummary["capsule"]>();
  const ladders: DiscoverLadderSummary[] = [];

  for (const ladder of sorted) {
    if (seen.has(ladder.id)) continue;
    seen.add(ladder.id);

    let capsule = ladder.capsuleId ? capsuleCache.get(ladder.capsuleId) ?? null : null;
    if (ladder.capsuleId && !capsuleCache.has(ladder.capsuleId)) {
      const capsuleRow = await findCapsuleById(ladder.capsuleId);
      capsule = mapCapsuleIdentity(capsuleRow, origin);
      capsuleCache.set(ladder.capsuleId, capsule);
    }

    ladders.push({
      ...ladder,
      capsule: capsule ?? null,
    });

    if (ladders.length >= limit) {
      break;
    }
  }

  return ladders;
}

function sanitizeMemberCreateInput(member: CapsuleLadderMemberInput): CapsuleLadderMemberInput {
  const displayName = member.displayName?.trim();
  if (!displayName) {
    throw new CapsuleLadderAccessError(
      "invalid",
      "Each member must include a display name.",
      400,
    );
  }

  const sanitized: CapsuleLadderMemberInput = {
    displayName,
  };
  if (member.userId !== undefined) {
    sanitized.userId = normalizeId(member.userId);
  }
  if (member.handle !== undefined) {
    const handle = member.handle?.trim();
    sanitized.handle = handle?.length ? handle : null;
  }
  if (member.seed !== undefined) sanitized.seed = member.seed;
  if (member.rank !== undefined) sanitized.rank = member.rank;
  if (member.rating !== undefined) sanitized.rating = member.rating;
  if (member.wins !== undefined) sanitized.wins = member.wins;
  if (member.losses !== undefined) sanitized.losses = member.losses;
  if (member.draws !== undefined) sanitized.draws = member.draws;
  if (member.streak !== undefined) sanitized.streak = member.streak;
  if (member.metadata !== undefined) sanitized.metadata = member.metadata ?? null;
  return sanitized;
}

function sanitizeMemberUpdateInput(
  patch: CapsuleLadderMemberUpdateInput,
): CapsuleLadderMemberUpdateInput {
  const sanitized: CapsuleLadderMemberUpdateInput = {};
  if (patch.userId !== undefined) {
    sanitized.userId = normalizeId(patch.userId);
  }
  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim();
    if (!name.length) {
      throw new CapsuleLadderAccessError(
        "invalid",
        "Display name cannot be empty.",
        400,
      );
    }
    sanitized.displayName = name;
  }
  if (patch.handle !== undefined) {
    const handle = patch.handle?.trim();
    sanitized.handle = handle?.length ? handle : null;
  }
  if (patch.seed !== undefined) sanitized.seed = patch.seed;
  if (patch.rank !== undefined) sanitized.rank = patch.rank;
  if (patch.rating !== undefined) sanitized.rating = patch.rating;
  if (patch.wins !== undefined) sanitized.wins = patch.wins;
  if (patch.losses !== undefined) sanitized.losses = patch.losses;
  if (patch.draws !== undefined) sanitized.draws = patch.draws;
  if (patch.streak !== undefined) sanitized.streak = patch.streak;
  if (patch.metadata !== undefined) sanitized.metadata = patch.metadata ?? null;
  return sanitized;
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

export async function listCapsuleLadderMembers(
  actorId: string,
  ladderId: string,
): Promise<CapsuleLadderMember[]> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  return listCapsuleLadderMemberRecords(ladder.id);
}

export async function addCapsuleLadderMembers(
  actorId: string,
  ladderId: string,
  members: CapsuleLadderMemberInput[],
): Promise<CapsuleLadderMember[]> {
  if (!members.length) return listCapsuleLadderMembers(actorId, ladderId);
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  const sanitized = members.map(sanitizeMemberCreateInput);
  return insertCapsuleLadderMemberRecords(ladder.id, sanitized);
}

export async function updateCapsuleLadderMember(
  actorId: string,
  ladderId: string,
  memberId: string,
  patch: CapsuleLadderMemberUpdateInput,
): Promise<CapsuleLadderMember> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);

  const sanitized = sanitizeMemberUpdateInput(patch);
  const updated = await updateCapsuleLadderMemberRecord(ladder.id, memberId, sanitized);
  if (!updated) {
    throw new CapsuleLadderAccessError("not_found", "Member not found.", 404);
  }
  return updated;
}

export async function removeCapsuleLadderMember(
  actorId: string,
  ladderId: string,
  memberId: string,
): Promise<void> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  await requireCapsuleManager(ladder.capsuleId, actorId);
  const existing = await getCapsuleLadderMemberRecordById(ladder.id, memberId);
  if (!existing) {
    throw new CapsuleLadderAccessError("not_found", "Member not found.", 404);
  }
  await deleteCapsuleLadderMemberRecord(ladder.id, memberId);
}

function normalizeChallengeOutcome(value: unknown): LadderChallengeOutcome | null {
  if (value === "challenger" || value === "opponent" || value === "draw") {
    return value;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "challenger" || normalized === "opponent" || normalized === "draw") {
    return normalized;
  }
  return null;
}

function sanitizeRankChanges(value: unknown): Array<{ memberId: string; from: number; to: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const memberId = normalizeId(entry.memberId as string);
      const from = sanitizeNumber(entry.from, null, 1, 9999);
      const to = sanitizeNumber(entry.to, null, 1, 9999);
      if (!memberId || from === null || to === null) return null;
      return { memberId, from, to };
    })
    .filter((entry): entry is { memberId: string; from: number; to: number } => Boolean(entry));
}

function sanitizeRatingChanges(
  value: unknown,
): Array<{ memberId: string; from: number; to: number; delta?: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!isPlainObject(entry)) return null;
      const memberId = normalizeId(entry.memberId as string);
      const from = sanitizeNumber(entry.from, null, MIN_RATING, MAX_RATING);
      const to = sanitizeNumber(entry.to, null, MIN_RATING, MAX_RATING);
      const delta = sanitizeNumber(entry.delta, null, -MAX_RATING, MAX_RATING);
      if (!memberId || from === null || to === null) return null;
      const change: { memberId: string; from: number; to: number; delta?: number } = { memberId, from, to };
      if (delta !== null) {
        change.delta = delta;
      }
      return change;
    })
    .filter((entry): entry is { memberId: string; from: number; to: number; delta?: number } => Boolean(entry));
}

function sanitizeChallenge(
  value: unknown,
  ladderId: string,
): LadderChallenge | null {
  if (!isPlainObject(value)) return null;
  const source = value as Record<string, unknown>;
  const id = normalizeId(source.id as string);
  const challengerId = normalizeId(source.challengerId as string);
  const opponentId = normalizeId(source.opponentId as string);
  if (!id || !challengerId || !opponentId) return null;
  const createdAt = normalizeTimestampString(source.createdAt) ?? new Date().toISOString();
  const statusRaw = sanitizeText(source.status, 20, "pending");
  const status: LadderChallenge["status"] =
    statusRaw === "resolved" || statusRaw === "void" ? statusRaw : "pending";
  const note = sanitizeText(source.note, 240, null) ?? null;
  const createdById = normalizeId(source.createdById as string);
  const resultRaw = isPlainObject(source.result) ? (source.result as Record<string, unknown>) : null;
  let result: LadderChallenge["result"] | undefined;
  if (resultRaw) {
    const outcome = normalizeChallengeOutcome(resultRaw.outcome);
    if (outcome) {
      result = {
        outcome,
        reportedAt: normalizeTimestampString(resultRaw.reportedAt) ?? createdAt,
        reportedById: normalizeId(resultRaw.reportedById as string),
        note: sanitizeText(resultRaw.note, 240, null) ?? null,
      };
      const rankChanges = sanitizeRankChanges(resultRaw.rankChanges);
      if (rankChanges.length && result) {
        result.rankChanges = rankChanges;
      }
      const ratingChanges = sanitizeRatingChanges(resultRaw.ratingChanges);
      if (ratingChanges.length && result) {
        result.ratingChanges = ratingChanges;
      }
    }
  }

  const challenge: LadderChallenge = {
    id,
    ladderId,
    challengerId,
    opponentId,
    createdAt,
    createdById,
    status,
    note,
  };
  if (result) {
    challenge.result = result;
  }
  return challenge;
}

function sanitizeMatchRecord(
  value: unknown,
  ladderId: string,
): LadderMatchRecord | null {
  if (!isPlainObject(value)) return null;
  const source = value as Record<string, unknown>;
  const id = normalizeId(source.id as string);
  const challengerId = normalizeId(source.challengerId as string);
  const opponentId = normalizeId(source.opponentId as string);
  const outcome = normalizeChallengeOutcome(source.outcome);
  if (!id || !challengerId || !opponentId || !outcome) return null;
  const resolvedAt = normalizeTimestampString(source.resolvedAt) ?? new Date().toISOString();
  const challengeId = normalizeId(source.challengeId as string);
  const note = sanitizeText(source.note, 240, null) ?? null;
  const rankChanges = sanitizeRankChanges(source.rankChanges);
  const ratingChanges = sanitizeRatingChanges(source.ratingChanges);

  const record: LadderMatchRecord = {
    id,
    ladderId,
    challengeId,
    challengerId,
    opponentId,
    outcome,
    resolvedAt,
  };
  if (note) record.note = note;
  if (rankChanges.length) record.rankChanges = rankChanges;
  if (ratingChanges.length) record.ratingChanges = ratingChanges;
  return record;
}

function readLadderState(
  ladder: CapsuleLadderDetail,
): { metaRoot: Record<string, unknown>; state: { challenges: LadderChallenge[]; history: LadderMatchRecord[] } } {
  const metaRoot = isPlainObject(ladder.meta) ? ({ ...ladder.meta } as Record<string, unknown>) : {};
  const stateSource = isPlainObject((metaRoot as LadderStateMeta).ladderState)
    ? ((metaRoot as LadderStateMeta).ladderState as Record<string, unknown>)
    : isPlainObject((metaRoot as LadderStateMeta).state)
      ? ((metaRoot as LadderStateMeta).state as Record<string, unknown>)
      : {};
  const rawChallenges = Array.isArray((stateSource as LadderStateMeta).challenges)
    ? ((stateSource as LadderStateMeta).challenges as unknown[])
    : [];
  const rawHistory = Array.isArray((stateSource as LadderStateMeta).history)
    ? ((stateSource as LadderStateMeta).history as unknown[])
    : [];

  const challenges = rawChallenges
    .map((entry) => sanitizeChallenge(entry, ladder.id))
    .filter((entry): entry is LadderChallenge => Boolean(entry));
  const history = rawHistory
    .map((entry) => sanitizeMatchRecord(entry, ladder.id))
    .filter((entry): entry is LadderMatchRecord => Boolean(entry));

  return {
    metaRoot,
    state: { challenges, history },
  };
}

function toMemberInput(member: CapsuleLadderMember): CapsuleLadderMemberInput {
  const input: CapsuleLadderMemberInput = {
    displayName: member.displayName,
    rank: member.rank ?? null,
    rating: member.rating ?? 0,
    wins: member.wins ?? 0,
    losses: member.losses ?? 0,
    draws: member.draws ?? 0,
    streak: member.streak ?? 0,
  };
  if (member.userId !== undefined) input.userId = member.userId ?? null;
  if (member.handle !== undefined) input.handle = member.handle ?? null;
  if (member.seed !== undefined) input.seed = member.seed ?? null;
  if (member.metadata !== undefined) input.metadata = member.metadata ?? null;
  return input;
}

function ensureChallengeScoring(ladder: CapsuleLadderDetail): ScoringSystem {
  const { system } = resolveScoringConfig(ladder);
  if (system !== "simple" && system !== "elo") {
    throw new CapsuleLadderAccessError(
      "invalid",
      "Challenges are only enabled for simple or Elo ladders right now.",
      400,
    );
  }
  return system;
}

function sortMembersForRanking(members: CapsuleLadderMember[]): CapsuleLadderMember[] {
  return [...members].sort((a, b) => {
    const rankA = a.rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    if (b.rating !== a.rating) return b.rating - a.rating;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });
}

function orderMembersWithSequentialRanks(members: CapsuleLadderMember[]): CapsuleLadderMember[] {
  return sortMembersForRanking(members).map((member, index) => ({
    ...member,
    rank: index + 1,
  }));
}

function applyResultStats(
  member: CapsuleLadderMember,
  result: "win" | "loss" | "draw",
): CapsuleLadderMember {
  const wins = member.wins ?? 0;
  const losses = member.losses ?? 0;
  const draws = member.draws ?? 0;
  const streak = member.streak ?? 0;
  if (result === "win") {
    return {
      ...member,
      wins: wins + 1,
      streak: streak >= 0 ? streak + 1 : 1,
    };
  }
  if (result === "loss") {
    return {
      ...member,
      losses: losses + 1,
      streak: streak <= 0 ? streak - 1 : -1,
    };
  }
  return {
    ...member,
    draws: draws + 1,
    streak: 0,
  };
}

function resolveMemberKFactor(member: CapsuleLadderMember, scoring: Required<LadderScoringConfig>): number {
  const baseK = scoring.kFactor ?? DEFAULT_K_FACTOR;
  const totalMatches = (member.wins ?? 0) + (member.losses ?? 0) + (member.draws ?? 0);
  const placementBoost =
    totalMatches < (scoring.placementMatches ?? DEFAULT_PLACEMENT_MATCHES) ? 1.5 : 1;
  const streak = member.streak ?? 0;
  const streakBonus =
    scoring.bonusForStreak && streak > 1
      ? Math.min(streak, 5) * scoring.bonusForStreak * 0.2
      : 0;
  const adjusted = Math.round(baseK * placementBoost + streakBonus);
  return Math.min(128, Math.max(4, adjusted));
}

function calculateExpectedScore(playerRating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
}

function applyEloOutcome(
  members: CapsuleLadderMember[],
  challengerId: string,
  opponentId: string,
  outcome: LadderChallengeOutcome,
  scoring: Required<LadderScoringConfig>,
): {
  members: CapsuleLadderMember[];
  rankChanges: Array<{ memberId: string; from: number; to: number }>;
  ratingChanges: Array<{ memberId: string; from: number; to: number; delta?: number }>;
} {
  const initialRating = scoring.initialRating ?? DEFAULT_INITIAL_RATING;
  const challenger = members.find((member) => member.id === challengerId);
  const opponent = members.find((member) => member.id === opponentId);
  if (!challenger || !opponent) {
    throw new CapsuleLadderAccessError("invalid", "Both members must exist on this ladder.", 400);
  }

  const baseRatingMap = new Map<string, number>(
    members.map((member) => [member.id, normalizeRatingValue(member.rating, initialRating)]),
  );

  const challengerRating = baseRatingMap.get(challengerId)!;
  const opponentRating = baseRatingMap.get(opponentId)!;

  const challengerScore = outcome === "challenger" ? 1 : outcome === "draw" ? 0.5 : 0;
  const opponentScore = 1 - challengerScore;

  const challengerExpected = calculateExpectedScore(challengerRating, opponentRating);
  const opponentExpected = calculateExpectedScore(opponentRating, challengerRating);

  const challengerDelta = Math.round(
    resolveMemberKFactor(challenger, scoring) * (challengerScore - challengerExpected),
  );
  const opponentDelta = Math.round(
    resolveMemberKFactor(opponent, scoring) * (opponentScore - opponentExpected),
  );

  const nextChallengerRating = normalizeRatingValue(
    challengerRating + challengerDelta,
    initialRating,
  );
  const nextOpponentRating = normalizeRatingValue(opponentRating + opponentDelta, initialRating);

  const updatedMembers = members.map((member) => {
    if (member.id === challengerId) {
      const withStats =
        outcome === "challenger"
          ? applyResultStats(member, "win")
          : outcome === "opponent"
            ? applyResultStats(member, "loss")
            : applyResultStats(member, "draw");
      return { ...withStats, rating: nextChallengerRating };
    }
    if (member.id === opponentId) {
      const withStats =
        outcome === "opponent"
          ? applyResultStats(member, "win")
          : outcome === "challenger"
            ? applyResultStats(member, "loss")
            : applyResultStats(member, "draw");
      return { ...withStats, rating: nextOpponentRating };
    }
    return { ...member, rating: normalizeRatingValue(member.rating, initialRating) };
  });

  const baseRanks = new Map(
    sortMembersByRating(members, initialRating).map((member) => [
      member.id,
      member.rank ?? Number.MAX_SAFE_INTEGER,
    ]),
  );
  const reordered = sortMembersByRating(updatedMembers, initialRating);

  const rankChanges =
    reordered
      .map((member) => {
        const previousRank = baseRanks.get(member.id) ?? member.rank ?? 0;
        if (previousRank !== member.rank) {
          return { memberId: member.id, from: previousRank, to: member.rank ?? previousRank };
        }
        return null;
      })
      .filter(
        (entry): entry is NonNullable<LadderChallengeResult["rankChanges"]>[number] =>
          Boolean(entry),
      ) ?? [];

  const ratingChanges: NonNullable<LadderChallengeResult["ratingChanges"]> = [
    {
      memberId: challengerId,
      from: challengerRating,
      to: nextChallengerRating,
      delta: nextChallengerRating - challengerRating,
    },
    {
      memberId: opponentId,
      from: opponentRating,
      to: nextOpponentRating,
      delta: nextOpponentRating - opponentRating,
    },
  ];

  return { members: reordered, rankChanges, ratingChanges };
}

function applySimpleOutcome(
  members: CapsuleLadderMember[],
  challengerId: string,
  opponentId: string,
  outcome: LadderChallengeOutcome,
): {
  members: CapsuleLadderMember[];
  rankChanges: Array<{ memberId: string; from: number; to: number }>;
} {
  const ordered = orderMembersWithSequentialRanks(members);
  const challenger = ordered.find((member) => member.id === challengerId);
  const opponent = ordered.find((member) => member.id === opponentId);
  if (!challenger || !opponent) {
    throw new CapsuleLadderAccessError("invalid", "Both challenger and opponent must be on the ladder.", 400);
  }
  const challengerRank = challenger.rank ?? Number.MAX_SAFE_INTEGER;
  const opponentRank = opponent.rank ?? Number.MAX_SAFE_INTEGER;

  const updated = ordered.map((member) => {
    if (member.id === challengerId) {
      if (outcome === "challenger") return applyResultStats(member, "win");
      if (outcome === "opponent") return applyResultStats(member, "loss");
      return applyResultStats(member, "draw");
    }
    if (member.id === opponentId) {
      if (outcome === "opponent") return applyResultStats(member, "win");
      if (outcome === "challenger") return applyResultStats(member, "loss");
      return applyResultStats(member, "draw");
    }
    return member;
  });

  const baseRanks = new Map<string, number>(
    ordered.map((member) => [member.id, member.rank ?? Number.MAX_SAFE_INTEGER]),
  );

  const challengerUpdated = updated.find((member) => member.id === challengerId)!;
  let reordered: CapsuleLadderMember[];

  if (outcome === "challenger" && challengerRank > opponentRank) {
    const gap = challengerRank - opponentRank;
    const hop = Math.ceil(gap / 2);
    const targetRank = Math.max(opponentRank + 1, challengerRank - hop);
    const withoutChallenger = updated.filter((member) => member.id !== challengerId);
    const insertIndex = Math.max(0, targetRank - 1);
    withoutChallenger.splice(insertIndex, 0, challengerUpdated);
    reordered = withoutChallenger.map((member, index) => ({ ...member, rank: index + 1 }));
  } else {
    reordered = updated.map((member, index) => ({ ...member, rank: index + 1 }));
  }

  const rankChanges =
    reordered
      .map((member) => {
        const previousRank = baseRanks.get(member.id) ?? member.rank ?? 0;
        if (previousRank !== member.rank) {
          return { memberId: member.id, from: previousRank, to: member.rank ?? previousRank };
        }
        return null;
      })
      .filter(
        (entry): entry is NonNullable<LadderChallengeResult["rankChanges"]>[number] =>
          Boolean(entry),
      ) ?? [];

  return { members: reordered, rankChanges };
}

function assertChallengePermissions(
  ladder: CapsuleLadderDetail,
  viewer: CapsuleViewerContext,
): void {
  const isManager = viewer.isOwner || (viewer.role && MANAGER_ROLES.has(viewer.role));
  if (!viewer.viewerId) {
    throw new CapsuleLadderAccessError("forbidden", "Sign in to manage challenges.", 403);
  }
  if (!isManager && !viewer.isMember) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "Join this capsule to issue challenges.",
      403,
    );
  }
  if (!canViewerAccessLadder(ladder, viewer, false)) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You do not have permission to manage this ladder.",
      403,
    );
  }
}

export async function listLadderChallengesForViewer(
  ladderId: string,
  viewerId: string | null,
): Promise<{ challenges: LadderChallenge[]; history: LadderMatchRecord[]; ladder: CapsuleLadderDetail }> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  const viewer = await resolveCapsuleViewer(ladder.capsuleId, viewerId);
  if (!canViewerAccessLadder(ladder, viewer, false)) {
    throw new CapsuleLadderAccessError(
      "forbidden",
      "You do not have permission to view this ladder.",
      403,
    );
  }
  const { state } = readLadderState(ladder);
  return { challenges: state.challenges, history: state.history, ladder };
}

export async function createLadderChallenge(
  actorId: string,
  ladderId: string,
  payload: { challengerId: string; opponentId: string; note?: string | null },
): Promise<{ challenge: LadderChallenge; ladder: CapsuleLadderDetail }> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  const viewer = await resolveCapsuleViewer(ladder.capsuleId, actorId);
  assertChallengePermissions(ladder, viewer);
  const scoring = resolveScoringConfig(ladder);
  const system = ensureChallengeScoring(ladder);

  const challengerId = normalizeId(payload.challengerId);
  const opponentId = normalizeId(payload.opponentId);
  if (!challengerId || !opponentId || challengerId === opponentId) {
    throw new CapsuleLadderAccessError(
      "invalid",
      "Select two different ladder members to create a challenge.",
      400,
    );
  }

  const memberRecords = await listCapsuleLadderMemberRecords(ladder.id);
  const members =
    system === "elo"
      ? sortMembersByRating(memberRecords, scoring.initialRating ?? DEFAULT_INITIAL_RATING)
      : orderMembersWithSequentialRanks(memberRecords);
  const challenger = members.find((member) => member.id === challengerId);
  const opponent = members.find((member) => member.id === opponentId);
  if (!challenger || !opponent) {
    throw new CapsuleLadderAccessError("invalid", "Both members must exist on this ladder.", 400);
  }
  if (system === "simple") {
    const challengerRank = challenger.rank ?? Number.MAX_SAFE_INTEGER;
    const opponentRank = opponent.rank ?? Number.MAX_SAFE_INTEGER;
    if (challengerRank <= opponentRank) {
      throw new CapsuleLadderAccessError(
        "invalid",
        "Challenger must target someone ranked above them.",
        400,
      );
    }
  }

  const now = new Date().toISOString();
  const note = payload.note ? sanitizeText(payload.note, 240, null) : null;

  const challenge: LadderChallenge = {
    id: randomUUID(),
    ladderId: ladder.id,
    challengerId,
    opponentId,
    createdAt: now,
    createdById: viewer.viewerId,
    status: "pending",
    note: note ?? null,
  };

  const snapshot = readLadderState(ladder);
  const existing = snapshot.state.challenges.filter(
    (entry) => !(entry.challengerId === challengerId && entry.opponentId === opponentId && entry.status === "pending"),
  );
  snapshot.state.challenges = [challenge, ...existing].slice(0, 30);
  snapshot.metaRoot.ladderState = {
    ...(snapshot.metaRoot.ladderState as Record<string, unknown>),
    challenges: snapshot.state.challenges,
    history: snapshot.state.history,
  };

  const updatedLadder = await updateCapsuleLadderRecord(ladder.id, {
    meta: snapshot.metaRoot as LadderStateMeta,
  });

  const ladderForNotification = updatedLadder ?? ladder;
  void notifyLadderChallenge({
    ladder: ladderForNotification,
    challenge,
    members,
    actorId,
  });

  return { challenge, ladder: ladderForNotification };
}

export async function resolveLadderChallenge(
  actorId: string,
  ladderId: string,
  challengeId: string,
  outcome: LadderChallengeOutcome,
  note?: string | null,
): Promise<{
  challenge: LadderChallenge;
  members: CapsuleLadderMember[];
  history: LadderMatchRecord[];
}> {
  const ladder = await getCapsuleLadderRecordById(ladderId);
  if (!ladder) {
    throw new CapsuleLadderAccessError("not_found", "Ladder not found.", 404);
  }
  const viewer = await resolveCapsuleViewer(ladder.capsuleId, actorId);
  assertChallengePermissions(ladder, viewer);
  const system = ensureChallengeScoring(ladder);
  const scoring = resolveScoringConfig(ladder);

  const snapshot = readLadderState(ladder);
  const challengeIndex = snapshot.state.challenges.findIndex((entry) => entry.id === challengeId);
  if (challengeIndex === -1) {
    throw new CapsuleLadderAccessError("not_found", "Challenge not found.", 404);
  }
  const challenge = snapshot.state.challenges[challengeIndex];
  if (!challenge) {
    throw new CapsuleLadderAccessError("not_found", "Challenge not found.", 404);
  }
  if (challenge.status === "resolved") {
    return { challenge, members: await listCapsuleLadderMemberRecords(ladder.id), history: snapshot.state.history };
  }

  const members = await listCapsuleLadderMemberRecords(ladder.id);
  const outcomeResult =
    system === "simple"
      ? applySimpleOutcome(members, challenge.challengerId, challenge.opponentId, outcome)
      : applyEloOutcome(
          members,
          challenge.challengerId,
          challenge.opponentId,
          outcome,
          scoring,
        );
  const rankChanges = outcomeResult.rankChanges ?? [];
  const ratingChanges =
    (outcomeResult as { ratingChanges?: NonNullable<LadderChallengeResult["ratingChanges"]> }).ratingChanges ?? [];
  const reordered = outcomeResult.members;
  const persistedMembers = await replaceCapsuleLadderMemberRecords(
    ladder.id,
    reordered.map(toMemberInput),
  );

  const resolvedAt = new Date().toISOString();
  const sanitizedNote = note ? sanitizeText(note, 240, null) : null;

  const historyRecord: LadderMatchRecord = {
    id: randomUUID(),
    ladderId: ladder.id,
    challengeId: challenge.id,
    challengerId: challenge.challengerId,
    opponentId: challenge.opponentId,
    outcome,
    resolvedAt,
    note: sanitizedNote ?? challenge.note ?? null,
  };
  if (rankChanges.length) {
    historyRecord.rankChanges = rankChanges;
  }
  if (ratingChanges.length) {
    historyRecord.ratingChanges = ratingChanges;
  }

  snapshot.state.history = [historyRecord, ...snapshot.state.history].slice(0, 50);
  snapshot.state.challenges[challengeIndex] = {
    ...challenge,
    status: "resolved",
    result: {
      outcome,
      reportedAt: resolvedAt,
      reportedById: viewer.viewerId,
      note: sanitizedNote ?? null,
    },
  };
  if (rankChanges.length) {
    snapshot.state.challenges[challengeIndex]!.result!.rankChanges = rankChanges;
  }
  if (ratingChanges.length) {
    snapshot.state.challenges[challengeIndex]!.result!.ratingChanges = ratingChanges;
  }

  snapshot.metaRoot.ladderState = {
    ...(snapshot.metaRoot.ladderState as Record<string, unknown>),
    challenges: snapshot.state.challenges,
    history: snapshot.state.history,
  };

  await updateCapsuleLadderRecord(ladder.id, {
    meta: snapshot.metaRoot as LadderStateMeta,
  });

  return {
    challenge: snapshot.state.challenges[challengeIndex]!,
    members: persistedMembers,
    history: snapshot.state.history,
  };
}
