import type { LadderBuilderFormState } from "./builderState";
import { trimOrNull } from "./builderState";
import {
  SECTION_KEYS,
  transformBulletsText,
  parseIntegerField,
  parseOptionalIntegerField,
  type SectionKey,
  type LadderMemberFormValues,
} from "./ladderFormState";

export type MemberPayload = {
  userId?: string | null;
  displayName: string;
  handle?: string | null;
  seed?: number | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  metadata?: Record<string, unknown> | null;
};

export const convertSectionsToPayload = (form: Pick<LadderBuilderFormState, "sections" | "customSections">) => {
  const sections: Record<string, unknown> = {};
  SECTION_KEYS.forEach((key) => {
    sections[key] = buildSectionPayload(key, form.sections[key]);
  });
  if (form.customSections.length) {
    const customPayload = form.customSections
      .map((section) => {
        const title = section.title.trim().length ? section.title.trim() : "Custom Section";
        const body = trimOrNull(section.body ?? "");
        const bulletPoints = buildBulletPoints(section.bulletsText);
        const payload: Record<string, unknown> = {
          id: section.id,
          title,
          body,
        };
        if (bulletPoints.length) {
          payload.bulletPoints = bulletPoints;
        }
        return payload;
      })
      .filter(Boolean);
    if (customPayload.length) {
      sections.custom = customPayload;
    }
  }
  return sections;
};

export const convertMembersToPayload = (members: LadderMemberFormValues[]): MemberPayload[] => {
  const payload: MemberPayload[] = [];
  members.forEach((member) => {
    const displayName = member.displayName.trim();
    if (!displayName.length) return;
    const userId = trimOrNull(member.userId ?? "");
    const capsuleId = trimOrNull(member.capsuleId ?? "");
    const capsuleSlug = trimOrNull(member.capsuleSlug ?? "");
    const avatarUrl = trimOrNull(member.avatarUrl ?? "");
    const handle = trimOrNull(member.handle ?? "");
    const seedValue = parseOptionalIntegerField(member.seed, { min: 1, max: 999 });
    const rating = parseIntegerField(member.rating, 1200, { min: 100, max: 4000 });
    const wins = parseIntegerField(member.wins, 0, { min: 0, max: 500 });
    const losses = parseIntegerField(member.losses, 0, { min: 0, max: 500 });
    const draws = parseIntegerField(member.draws, 0, { min: 0, max: 500 });
    const streak = parseIntegerField(member.streak, 0, { min: -20, max: 20 });
    if (!userId && !capsuleId) {
      // Validation should have caught this, but guard against stray entries.
      return;
    }
    const entry: MemberPayload = {
      displayName,
      rating,
      wins,
      losses,
      draws,
      streak,
    };
    if (userId) entry.userId = userId;
    if (handle) entry.handle = handle;
    if (seedValue !== null) entry.seed = seedValue;
    const metadata: Record<string, unknown> = {};
    if (userId) {
      metadata.userId = userId;
      metadata.identityType = "user";
    }
    if (capsuleId) {
      metadata.capsuleId = capsuleId;
      metadata.capsuleSlug = capsuleSlug;
      metadata.identityType = "capsule";
    }
    if (avatarUrl) {
      metadata.avatarUrl = avatarUrl;
    }
    if (Object.keys(metadata).length) {
      entry.metadata = metadata;
    }
    payload.push(entry);
  });
  return payload;
};

export const convertConfigToPayload = (form: LadderBuilderFormState) => {
  const initialRating = parseIntegerField(form.scoring.initialRating, 1200, { min: 100, max: 4000 });
  const kFactor = parseIntegerField(form.scoring.kFactor, 32, { min: 1, max: 128 });
  const placementMatches = parseIntegerField(form.scoring.placementMatches, 3, { min: 0, max: 20 });
  const maxTeams = parseOptionalIntegerField(form.registration.maxTeams, { min: 2, max: 999 });
  const requirements = (form.registration.requirements ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length);
  const registration: Record<string, unknown> = {
    type: form.registration.type,
    maxTeams: maxTeams ?? null,
  };
  if (requirements.length) {
    registration.requirements = requirements;
  }
  const cadenceValue = (form.schedule.cadence ?? "").trim();
  const kickoffValue = (form.schedule.kickoff ?? "").trim();
  const allowedSystems = new Set(["simple", "elo", "ai", "points", "custom"]);
  const scoringSystem = allowedSystems.has(form.scoring.system) ? form.scoring.system : "elo";
  return {
    scoring: {
      system: scoringSystem,
      initialRating,
      kFactor,
      placementMatches,
    },
    schedule: {
      cadence: cadenceValue.length ? cadenceValue : "Weekly cadence",
      kickoff: kickoffValue.length ? kickoffValue : "TBD",
      timezone: trimOrNull(form.schedule.timezone ?? ""),
    },
    registration,
    communications: {
      announcementsCadence: "Weekly recap + midweek AI shoutouts",
    },
    promoSummary: form.summary.trim(),
  };
};

export const convertGameToPayload = (form: LadderBuilderFormState) => {
  const { title, mode, platform, region } = form.game;
  const trimmedTitle = title.trim();
  return {
    title: trimmedTitle.length ? trimmedTitle : "Featured Game",
    mode: trimOrNull(mode ?? ""),
    platform: trimOrNull(platform ?? ""),
    region: trimOrNull(region ?? ""),
  };
};

const buildSectionPayload = (key: SectionKey, sectionValues: LadderBuilderFormState["sections"][SectionKey]) => {
  const title = sectionValues.title.trim().length ? sectionValues.title.trim() : key;
  const body = trimOrNull(sectionValues.body ?? "");
  const bulletPoints = buildBulletPoints(sectionValues.bulletsText);
  const payload: Record<string, unknown> = { title, body };
  if (bulletPoints.length) {
    payload.bulletPoints = bulletPoints;
  }
  return payload;
};

const buildBulletPoints = (value?: string) => transformBulletsText(value ?? "");
