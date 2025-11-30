"use server";

import "server-only";

import type { PrompterHandoff } from "@/components/composer/prompter-handoff";
import { getDatabaseAdminClient } from "@/config/database";
import { HOME_COMPOSER_CHIPS, EXPLORE_COMPOSER_CHIPS, CREATE_COMPOSER_CHIPS, CAPSULE_COMPOSER_CHIPS, MEMORY_COMPOSER_CHIPS, PROFILE_COMPOSER_CHIPS, SETTINGS_COMPOSER_CHIPS, LIVE_COMPOSER_CHIPS, STUDIO_COMPOSER_CHIPS, MARKET_COMPOSER_CHIPS } from "@/lib/prompter/chips";
import type { PrompterChipOption } from "@/components/prompter/hooks/usePrompterStageController";

export type PrompterSurface = "home" | "explore" | "create" | "capsule" | "market" | "memory" | "profile" | "settings" | "live" | "studio";

type ChipDefinition = {
  id: string;
  label: string;
  surface: PrompterSurface;
  handoff: PrompterHandoff;
  pinned?: boolean;
  source?: "pinned" | "recent" | "context" | "ai" | "base";
  family?: string;
  meta?: Record<string, unknown>;
};

type ChipEvent = {
  chip_id: string;
  label: string | null;
  surface: string | null;
  user_id: string | null;
  created_at: string | null;
  use_count?: number | null;
};

type RankedChip = ChipDefinition & { score: number };

type ChipContext = {
  now?: Date;
  // Hooks for future personalization/context signals.
  hasRecentPosts?: boolean;
  hasRecentUploads?: boolean;
  hasActiveEvent?: boolean;
};

const MAX_CHIPS = 4;
const MAX_AI_CHIPS = 2;

function toChipDefinitions(options: PrompterChipOption[], surface: PrompterSurface): ChipDefinition[] {
  return options
    .map((chip) => {
      const id = chip.id ?? chip.value ?? chip.label;
      const handoff = chip.handoff ?? null;
      if (!id || !handoff) return null;
      return {
        id,
        label: chip.label ?? chip.value ?? id,
        surface: chip.surface ?? surface,
        handoff,
        pinned: false,
        source: "base" as const,
        family: typeof (chip.meta as { family?: unknown } | undefined)?.family === "string"
          ? ((chip.meta as { family?: unknown }).family as string)
          : undefined,
        meta: chip.meta ?? undefined,
      } as ChipDefinition;
    })
    .filter((entry): entry is ChipDefinition => Boolean(entry));
}

// --- Chip seeds ------------------------------------------------------------

function findHomeChip(label: string): PrompterHandoff | null {
  const entry = HOME_COMPOSER_CHIPS.find((chip) => chip.label === label);
  return entry?.handoff ?? null;
}

function homePinnedChips(): ChipDefinition[] {
  const pairs: Array<{ id: string; label: string; family?: string }> = [
    { id: "home_daily_update", label: "Daily Update", family: "update" },
    { id: "home_community_poll", label: "Community Poll", family: "poll" },
    { id: "home_announcement", label: "Announcement", family: "announce" },
    { id: "home_new_style", label: "New Style", family: "style" },
  ];
  return pairs
    .map(({ id, label, family }) => {
      const handoff = findHomeChip(label);
      if (!handoff) return null;
      return {
        id,
        label,
        surface: "home" as const,
        handoff,
        pinned: true,
        source: "pinned" as const,
        family,
      };
    })
    .filter(Boolean) as ChipDefinition[];
}

function homeBaseChips(): ChipDefinition[] {
  const pairs: Array<{ id: string; label: string; family?: string }> = [
    { id: "home_shoutout", label: "Shoutout", family: "shoutout" },
    { id: "home_qotd", label: "Question of the Day", family: "question" },
  ];
  return pairs
    .map(({ id, label, family }) => {
      const handoff = findHomeChip(label);
      if (!handoff) return null;
      return {
        id,
        label,
        surface: "home" as const,
        handoff,
        pinned: false,
        source: "base" as const,
        family,
      };
    })
    .filter(Boolean) as ChipDefinition[];
}

function contextualHomeChips(now: Date): ChipDefinition[] {
  const hour = now.getHours();
  const morning = hour >= 5 && hour < 12;
  const evening = hour >= 17 && hour < 24;

  const contextual: ChipDefinition[] = [];

  if (morning) {
    contextual.push({
      id: "home_todays_plan",
      label: "Today's Plan",
      surface: "home",
      handoff: {
        intent: "ai_prompt",
        prompt:
          "You are Capsules AI. Help create a concise plan for today. Ask for top 3 priorities, owners, and blockers. Keep it tight and wait for answers before drafting.",
        options: { composeMode: "post", extras: { replyMode: "chat", chipId: "home_todays_plan" } },
      },
      source: "context",
      family: "update",
    });
  }

  if (evening) {
    contextual.push({
      id: "home_daily_recap",
      label: "Daily Recap",
      surface: "home",
      handoff: {
        intent: "ai_prompt",
        prompt:
          "You are Capsules AI. Gather a daily recap. Ask for wins, learnings, blockers, shoutouts, and a next-step CTA. Keep the opener short; wait for inputs before drafting.",
        options: { composeMode: "post", extras: { replyMode: "chat", chipId: "home_daily_recap" } },
      },
      source: "context",
      family: "update",
    });
  }

  contextual.push({
    id: "home_event_reminder",
    label: "Event Reminder",
    surface: "home",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "You are Capsules AI. Draft an event reminder. Ask for event title, time, audience, and CTA (RSVP, join live, bring questions). Keep opener short and gather details first.",
      options: { composeMode: "post", extras: { replyMode: "chat", chipId: "home_event_reminder" } },
    },
    source: "context",
    family: "announce",
  });

  contextual.push({
    id: "home_clip_stream",
    label: "Clip My Stream",
    surface: "home",
    handoff: {
      intent: "ai_prompt",
      prompt:
        "You are Capsules AI. Help turn the latest stream into clips. Ask for the stream title, key moments, and desired clip count or duration. Keep opener short; wait for inputs.",
      options: { composeMode: "post", extras: { replyMode: "chat", chipId: "home_clip_stream" } },
    },
    source: "context",
    family: "recap",
  });

  return contextual;
}

function aiSuggestedHomeChips(now: Date): ChipDefinition[] {
  // Placeholder AI suggestions; ready for a real model later.
  const pool: ChipDefinition[] = [
    {
      id: "home_ai_hot_take",
      label: "Hot Take",
      surface: "home",
      handoff: {
        intent: "ai_prompt",
        prompt:
          "You are Capsules AI. Brainstorm a short, contrarian take to spark replies. Ask for the topic and audience tone. Keep opener brief; wait for inputs.",
        options: { composeMode: "post", extras: { replyMode: "chat", chipId: "home_ai_hot_take" } },
      },
      source: "ai",
      family: "question",
    },
    {
      id: "home_ai_faq",
      label: "Quick FAQ",
      surface: "home",
      handoff: {
        intent: "ai_prompt",
        prompt:
          "You are Capsules AI. Build a quick FAQ for this capsule. Ask for 3-5 common questions and concise answers. Keep opener short; wait for inputs.",
        options: { composeMode: "post", extras: { replyMode: "chat", chipId: "home_ai_faq" } },
      },
      source: "ai",
      family: "doc",
    },
    {
      id: "home_ai_boost",
      label: "Boost Engagement",
      surface: "home",
      handoff: {
        intent: "ai_prompt",
        prompt:
          "You are Capsules AI. Suggest a quick engagement idea (poll, QOTD, shoutout). Ask for audience and topic. Keep opener short; wait for inputs before drafting.",
        options: {
          composeMode: "post",
          extras: { replyMode: "chat", chipId: "home_ai_boost" },
        },
      },
      source: "ai",
      family: "engage",
    },
  ];

  // Simple deterministic shuffle by minute to avoid heavy randomness.
  const minute = now.getMinutes();
  const rotated = [...pool].sort((a, b) => {
    const aScore = (a.id.charCodeAt(0) + minute) % 17;
    const bScore = (b.id.charCodeAt(0) + minute) % 17;
    return bScore - aScore;
  });
  return rotated.slice(0, MAX_AI_CHIPS);
}

function baseChipsForSurface(surface: PrompterSurface): ChipDefinition[] {
  switch (surface) {
    case "home":
      return [...homePinnedChips(), ...homeBaseChips()];
    case "explore":
      return toChipDefinitions(EXPLORE_COMPOSER_CHIPS, "explore");
    case "create":
      return toChipDefinitions(CREATE_COMPOSER_CHIPS, "create");
    case "capsule":
      return toChipDefinitions(CAPSULE_COMPOSER_CHIPS, "capsule");
    case "memory":
      return toChipDefinitions(MEMORY_COMPOSER_CHIPS, "memory");
    case "profile":
      return toChipDefinitions(PROFILE_COMPOSER_CHIPS, "profile");
    case "settings":
      return toChipDefinitions(SETTINGS_COMPOSER_CHIPS, "settings");
    case "live":
      return toChipDefinitions(LIVE_COMPOSER_CHIPS, "live");
    case "market":
      return toChipDefinitions(MARKET_COMPOSER_CHIPS, "market");
    case "studio":
      return toChipDefinitions(STUDIO_COMPOSER_CHIPS, "studio");
    default:
      return [];
  }
}

function contextualChipsForSurface(surface: PrompterSurface, now: Date): ChipDefinition[] {
  switch (surface) {
    case "home":
      return contextualHomeChips(now);
    default:
      return [];
  }
}

function aiChipsForSurface(surface: PrompterSurface, now: Date): ChipDefinition[] {
  switch (surface) {
    case "home":
      return aiSuggestedHomeChips(now);
    default:
      return [];
  }
}

// --- Persistence (best-effort) --------------------------------------------

async function fetchChipEvents(
  userId: string,
  surface: PrompterSurface,
  limit = 30,
): Promise<ChipEvent[]> {
  try {
    const db = getDatabaseAdminClient();
    const result = await db
      .from("prompter_chip_events")
      .select<ChipEvent>("chip_id, label, surface, user_id, created_at, use_count")
      .eq("user_id", userId)
      .eq("surface", surface)
      .order("created_at", { ascending: false })
      .limit(limit)
      .fetch();
    if (result.error || !result.data) return [];
    return result.data;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("prompter: failed to fetch chip events", error);
    }
    return [];
  }
}

export async function recordChipEvent(params: {
  userId: string;
  chipId: string;
  label: string | null;
  surface: string | null;
}): Promise<void> {
  try {
    const db = getDatabaseAdminClient();
    await db
      .from("prompter_chip_events")
      .insert({
        chip_id: params.chipId,
        label: params.label,
        surface: params.surface,
        user_id: params.userId,
      })
      .maybeSingle();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("prompter: failed to record chip event", error);
    }
  }
}

// --- Scoring + slotting ---------------------------------------------------

function aggregateUsage(events: ChipEvent[]): Record<string, { useCount: number; lastUsed: Date | null }> {
  const usage: Record<string, { useCount: number; lastUsed: Date | null }> = {};
  for (const event of events) {
    const id = event.chip_id ?? null;
    if (!id) continue;
    const current = usage[id] ?? { useCount: 0, lastUsed: null as Date | null };
    current.useCount += 1;
    const ts = event.created_at ? new Date(event.created_at) : null;
    if (ts && (!current.lastUsed || ts.getTime() > current.lastUsed.getTime())) {
      current.lastUsed = ts;
    }
    usage[id] = current;
  }
  return usage;
}

function recencyBoost(lastUsed: Date | null, now: Date): number {
  if (!lastUsed) return 0;
  const hours = Math.max(0, (now.getTime() - lastUsed.getTime()) / 36e5);
  const boost = Math.max(0, 36 - hours * 2);
  return boost;
}

function scoreChip(def: ChipDefinition, usage: Record<string, { useCount: number; lastUsed: Date | null }>, now: Date): RankedChip {
  const base =
    def.pinned ? 120 : def.source === "recent" ? 80 : def.source === "context" ? 70 : def.source === "ai" ? 55 : 60;
  const use = usage[def.id] ?? null;
  const useCountBoost = use ? Math.min(40, use.useCount * 6) : 0;
  const recency = use ? recencyBoost(use.lastUsed, now) : 0;
  const score = base + useCountBoost + recency;
  return { ...def, score };
}

function dedupeById(chips: ChipDefinition[]): ChipDefinition[] {
  const seen = new Set<string>();
  const out: ChipDefinition[] = [];
  for (const chip of chips) {
    if (seen.has(chip.id)) continue;
    seen.add(chip.id);
    out.push(chip);
  }
  return out;
}

function enforceFamilyDiversity(chips: RankedChip[]): RankedChip[] {
  const familySeen = new Map<string, number>();
  const out: RankedChip[] = [];
  for (const chip of chips) {
    const family = chip.family ?? chip.id;
    const count = familySeen.get(family) ?? 0;
    if (count >= 2) continue;
    familySeen.set(family, count + 1);
    out.push(chip);
  }
  return out;
}

function pickRecentFromUsage(
  usage: Record<string, { useCount: number; lastUsed: Date | null }>,
  surface: PrompterSurface,
  knownChips: ChipDefinition[],
  limit = 2,
): ChipDefinition[] {
  const byId = new Map(knownChips.map((chip) => [chip.id, chip]));
  const candidates = Object.entries(usage)
    .map(([chipId, stats]) => {
      const known = byId.get(chipId);
      if (!known) return null;
      if (!stats.lastUsed) return null;
      return { chip: known, lastUsed: stats.lastUsed };
    })
    .filter(Boolean) as Array<{ chip: ChipDefinition; lastUsed: Date }>;

  return candidates
    .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
    .slice(0, limit)
    .map(({ chip }) => ({ ...chip, source: "recent" as const }));
}

function slotAndRank(
  surface: PrompterSurface,
  base: ChipDefinition[],
  contextual: ChipDefinition[],
  ai: ChipDefinition[],
  usage: Record<string, { useCount: number; lastUsed: Date | null }>,
  now: Date,
): RankedChip[] {
  const all = dedupeById([...base, ...contextual, ...ai]);
  const recent = pickRecentFromUsage(usage, surface, all, 2);
  const withRecents = dedupeById([...recent, ...all]);
  const scored = withRecents.map((chip) => scoreChip(chip, usage, now));

  const pinned = scored.filter((chip) => chip.pinned).sort((a, b) => b.score - a.score);
  const nonPinned = scored.filter((chip) => !chip.pinned).sort((a, b) => b.score - a.score);

  const ordered: RankedChip[] = [];
  for (const chip of pinned) {
    if (ordered.length >= MAX_CHIPS) break;
    ordered.push(chip);
  }

  const familySafe = enforceFamilyDiversity(nonPinned);
  for (const chip of familySafe) {
    if (ordered.length >= MAX_CHIPS) break;
    ordered.push(chip);
  }

  return ordered.slice(0, MAX_CHIPS);
}

// --- Public API -----------------------------------------------------------

export async function getPrompterChipsForSurface(params: {
  userId: string;
  surface: PrompterSurface;
  context?: ChipContext;
}): Promise<PrompterChipOption[]> {
  const now = params.context?.now ?? new Date();
  const base = baseChipsForSurface(params.surface);
  const contextual = contextualChipsForSurface(params.surface, now);
  const ai = aiChipsForSurface(params.surface, now);
  const events = await fetchChipEvents(params.userId, params.surface);
  const usage = aggregateUsage(events);
  const ranked = slotAndRank(params.surface, base, contextual, ai, usage, now);
  return ranked.map((chip) => ({
    id: chip.id,
    label: chip.label,
    value: chip.label,
    surface: chip.surface,
    handoff: chip.handoff,
    meta: {
      source: chip.source ?? null,
      pinned: Boolean(chip.pinned),
      score: chip.score,
    },
  }));
}
























