import {
  parseIntegerField,
  parseOptionalIntegerField,
  transformBulletsText,
  type LadderWizardState,
  type SectionKey,
  type LadderSectionFormValues,
  matchFormatLabel,
} from "./ladderFormState";
import { trimOrNull } from "./builderState";
import type {
  CapsuleLadderDetail,
  CapsuleLadderMember,
  CapsuleLadderSummary,
  LadderConfig,
  LadderRegistrationConfig,
  LadderSections,
} from "@/types/ladders";

export type LadderPreviewSnapshot = {
  summary: CapsuleLadderSummary;
  detail: CapsuleLadderDetail;
  members: CapsuleLadderMember[];
};

export const buildPreviewSnapshot = (
  state: LadderWizardState,
  capsuleId: string | null,
): LadderPreviewSnapshot => {
  const now = new Date().toISOString();
  const ladderId = "preview-ladder";
  const normalizeText = (value?: string | null, fallback: string | null = null) =>
    trimOrNull(typeof value === "string" ? value : "") ?? fallback;
  const game = {
    title: state.format.game.title.trim() || "Featured Game",
    mode: normalizeText(matchFormatLabel(state.format.game.mode), null),
    platform: normalizeText(state.format.game.platform),
    region: normalizeText(state.format.game.region),
    summary: null,
  };
  const normalizeSection = (key: SectionKey | "custom", section: LadderSectionFormValues, index?: number) => {
    const bullets = transformBulletsText(section.bulletsText ?? "");
    return {
      id: key === "custom" ? `custom-${index ?? 0}` : key,
      title: section.title.trim() || key,
      body: normalizeText(section.body, ""),
      bulletPoints: bullets.length ? bullets : null,
      lastUpdatedAt: now,
    };
  };
  const baseSections: LadderSections = {
    overview: normalizeSection("overview", state.sections.overview),
    rules: normalizeSection("rules", state.sections.rules),
    shoutouts: normalizeSection("shoutouts", state.sections.shoutouts),
    upcoming: normalizeSection("upcoming", state.sections.upcoming),
    results: normalizeSection("results", state.sections.results),
  };
  const customSections = (state.sections.custom ?? []).map((section, index) =>
    normalizeSection("custom", section, index),
  );
  if (customSections.length) {
    baseSections.custom = customSections;
  }

  const schedule = {
    cadence: normalizeText(state.format.schedule.cadence, "Schedule TBD"),
    kickoff: normalizeText(state.format.schedule.kickoff),
    timezone: normalizeText(state.format.schedule.timezone),
    checkInWindowMinutes: null,
    playoffsAt: null,
    finalsAt: null,
  };
  const registrationRequirements = transformBulletsText(state.format.registration.requirements ?? "");
  const registration: LadderRegistrationConfig = {
    type: state.format.registration.type,
    maxTeams: parseOptionalIntegerField(state.format.registration.maxTeams ?? "", { min: 2, max: 999 }),
    opensAt: normalizeText(state.format.registration.opensAt),
    closesAt: normalizeText(state.format.registration.closesAt),
    requirements: registrationRequirements.length ? registrationRequirements : [],
  };
  const scoring: LadderConfig["scoring"] = {
    system: state.format.scoring.system,
    initialRating: parseIntegerField(state.format.scoring.initialRating, 1200, { min: 100, max: 4000 }),
    kFactor: parseIntegerField(state.format.scoring.kFactor, 32, { min: 1, max: 128 }),
    placementMatches: parseIntegerField(state.format.scoring.placementMatches, 3, { min: 0, max: 20 }),
    decayPerDay: parseIntegerField(state.format.scoring.decayPerDay ?? "", 0, { min: 0, max: 100 }),
    bonusForStreak: parseIntegerField(state.format.scoring.bonusForStreak ?? "", 0, { min: 0, max: 50 }),
  };

  const summary: CapsuleLadderSummary = {
    id: ladderId,
    capsuleId: capsuleId ?? "preview-capsule",
    name: state.basics.name.trim() || "Untitled ladder",
    slug: null,
    summary: normalizeText(state.basics.summary, ""),
    status: state.meta.status ?? "draft",
    visibility: state.basics.visibility,
    createdById: "preview-user",
    game,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    meta: {
      preview: true,
      game: {
        title: game.title,
        mode: game.mode,
        platform: game.platform,
        region: game.region,
      },
      gameTitle: game.title,
    },
  };

  const detail: CapsuleLadderDetail = {
    ...summary,
    publishedById: null,
    config: {
      schedule,
      registration,
      scoring,
    },
    sections: baseSections,
    aiPlan: null,
  };

  const members: CapsuleLadderMember[] = state.roster.members.slice(0, 12).map((member, index) => {
    const rating = parseIntegerField(member.rating, 1200, { min: 100, max: 4000 });
    const wins = parseIntegerField(member.wins, 0, { min: 0, max: 500 });
    const losses = parseIntegerField(member.losses, 0, { min: 0, max: 500 });
    const draws = parseIntegerField(member.draws, 0, { min: 0, max: 500 });
    const streak = parseIntegerField(member.streak, 0, { min: -20, max: 20 });
    const seed = parseOptionalIntegerField(member.seed, { min: 1, max: 999 });
    return {
      id: `preview-member-${index}`,
      ladderId,
      userId: member.userId?.trim() || null,
      displayName: member.displayName.trim() || `Player ${index + 1}`,
      handle: member.handle?.trim() || null,
      seed,
      rank: seed ?? index + 1,
      rating,
      wins,
      losses,
      draws,
      streak,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    };
  });

  return { summary, detail, members };
};
