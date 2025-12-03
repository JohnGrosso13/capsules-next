import { AIConfigError, callOpenAIChat, extractJSON } from "@/lib/ai/prompter";
import { buildContextMetadata, getCapsuleHistorySnippets, getChatContext } from "@/server/chat/retrieval";
import {
  fetchStructuredPayloads,
  findCapsulePosts,
  getCapsuleMembershipStats,
} from "@/server/capsules/structured";
import { findCapsuleById } from "@/server/capsules/repository";
import { listCapsuleLaddersByCapsule } from "./repository";
import type {
  CapsuleLadderMemberInput,
  LadderAiPlan,
  LadderAiSuggestion,
  LadderConfig,
  LadderGameConfig,
  LadderRegistrationConfig,
  LadderScheduleConfig,
  LadderScoringConfig,
  LadderSections,
  LadderStatus,
  LadderVisibility,
  CapsuleLadderSummary,
} from "@/types/ladders";

import { CapsuleLadderAccessError } from "./errors";
import {
  sanitizeBoolean,
  sanitizeMembers,
  sanitizeStringList,
  sanitizeText,
  sanitizeSections,
  sanitizeVisibility,
} from "./sanitizers";
import { normalizeScoringSystem } from "./scoring";
import { randomSlugSuffix } from "./utils";
import { requireCapsuleManager } from "./access";

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

type OpenAIJsonSchema = { name: string; schema: Record<string, unknown> };

const LADDER_DRAFT_RESPONSE_SCHEMA: OpenAIJsonSchema = {
  name: "ladder_blueprint",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 3, maxLength: 80 },
      summary: { type: "string", minLength: 20, maxLength: 280 },
      visibility: { type: "string", enum: ["private", "capsule", "public"] },
      status: { type: "string", enum: ["draft", "active", "archived"] },
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
          overview: {
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
          },
          rules: { $ref: "#/properties/sections/properties/overview" },
          shoutouts: { $ref: "#/properties/sections/properties/overview" },
          upcoming: { $ref: "#/properties/sections/properties/overview" },
          results: { $ref: "#/properties/sections/properties/overview" },
          custom: {
            type: "array",
            items: {
              $ref: "#/properties/sections/properties/overview",
            },
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
        items: {
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
        },
        maxItems: 24,
      },
      meta: { type: "object", additionalProperties: true },
    },
    required: ["name", "summary", "game", "config", "sections"],
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
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

    const ladders = await listCapsuleLaddersByCapsule(capsuleId).catch(() => [] as CapsuleLadderSummary[]);
    ladders.slice(0, 3).forEach((ladder: CapsuleLadderSummary, index: number) => {
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
    if (focus.length) details.push(`Announcements Focus: ${focus.join(", ")}`);
  }
  if (seed.shoutouts?.length) {
    const shoutouts = sanitizeStringList(seed.shoutouts, 120, 5);
    if (shoutouts.length) details.push(`Shoutout Themes: ${shoutouts.join(", ")}`);
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
