import { MAX_RATING, MIN_RATING } from "./scoring";
import { randomSlugSuffix, slugify } from "./utils";
import { CapsuleLadderAccessError } from "./errors";
import type {
  CapsuleLadderMemberInput,
  CapsuleLadderMemberUpdateInput,
  LadderChallenge,
  LadderChallengeOutcome,
  LadderMatchRecord,
  LadderSectionBlock,
  LadderSections,
  LadderVisibility,
} from "@/types/ladders";

export function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed.length) return "Untitled Ladder";
  return trimmed.slice(0, 80);
}

export function sanitizeText(value: unknown, maxLength: number, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact.length) return fallback;
  return compact.slice(0, maxLength);
}

export function sanitizeVisibility(
  value: unknown,
  fallback: LadderVisibility = "capsule",
): LadderVisibility {
  const normalized = sanitizeText(value, 20, null)?.toLowerCase();
  if (normalized === "private" || normalized === "public") return normalized;
  if (normalized === "capsule") return "capsule";
  return fallback;
}

export function sanitizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return fallback;
}

export function sanitizeNumber(
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

export function normalizeTimestampString(value: unknown): string | null {
  if (typeof value === "string" || value instanceof Date) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

export function sanitizeStringList(value: unknown, maxLength: number, maxItems = 8): string[] {
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

export function sanitizeSectionBlock(raw: unknown, fallbackTitle: string): LadderSectionBlock {
  const source = isPlainObject(raw) ? raw : {};
  const title = sanitizeText(source.title, 80, fallbackTitle) ?? fallbackTitle;
  const body = sanitizeText(source.body, 1200, null);
  const bullets = sanitizeStringList(source.bulletPoints ?? source.bullets ?? source.highlights, 160, 6);
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

export function sanitizeSections(raw: unknown): LadderSections {
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

export function sanitizeMembers(raw: unknown): CapsuleLadderMemberInput[] {
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

export function sanitizeMemberCreateInput(member: CapsuleLadderMemberInput): CapsuleLadderMemberInput {
  const displayName = member.displayName?.trim();
  if (!displayName) {
    throw new CapsuleLadderAccessError("invalid", "Each member must include a display name.", 400);
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

export function sanitizeMemberUpdateInput(
  patch: CapsuleLadderMemberUpdateInput,
): CapsuleLadderMemberUpdateInput {
  const sanitized: CapsuleLadderMemberUpdateInput = {};
  if (patch.userId !== undefined) {
    sanitized.userId = normalizeId(patch.userId);
  }
  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim();
    if (!name.length) {
      throw new CapsuleLadderAccessError("invalid", "Display name cannot be empty.", 400);
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

export function sanitizeRankChanges(value: unknown): Array<{ memberId: string; from: number; to: number }> {
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

export function sanitizeRatingChanges(
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

export function sanitizeChallenge(
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

export function sanitizeMatchRecord(
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
