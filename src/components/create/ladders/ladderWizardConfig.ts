import { z } from "zod";

import {
  SECTION_KEYS,
  type SectionKey,
  type LadderMemberFormValues,
  ladderGameFormSchema,
  ladderBasicsFormSchema,
  ladderMembersCollectionSchema,
  ladderRegistrationFormSchema,
  ladderScheduleFormSchema,
  ladderScoringFormSchema,
  ladderSectionFormSchema,
  ladderSeedFormSchema,
  ladderVisibilityOptions,
  matchFormatLabel,
  parseIntegerField,
  parseOptionalIntegerField,
  transformBulletsText,
  type LadderWizardState,
} from "./ladderFormState";

type StepValidationResult = { success: true; data: unknown } | { success: false; error: z.ZodError<unknown> };

function toStepResult<T>(result: { success: true; data: T } | { success: false; error: z.ZodError<T> }): StepValidationResult {
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error };
}

export type LadderWizardStepId = "basics" | "seed" | "sections" | "format" | "roster" | "review";

export type LadderWizardStepDefinition = {
  id: LadderWizardStepId;
  title: string;
  subtitle: string;
  description: string;
  validate: (state: LadderWizardState) => StepValidationResult;
  completionCheck: (state: LadderWizardState) => boolean;
};

const validateBasics = (state: LadderWizardState): StepValidationResult =>
  toStepResult(ladderBasicsFormSchema.safeParse(state.basics));

const validateSeed = (state: LadderWizardState): StepValidationResult =>
  toStepResult(ladderSeedFormSchema.safeParse(state.seed));

const validateSections = (state: LadderWizardState): StepValidationResult => {
  const core = SECTION_KEYS.map((key) => ladderSectionFormSchema.safeParse(state.sections[key]));
  const custom = state.sections.custom?.map((entry) => ladderSectionFormSchema.safeParse(entry)) ?? [];
  const failure = [...core, ...custom].find((result) => !result.success);
  if (failure && !failure.success) {
    return { success: false, error: failure.error };
  }
  return { success: true, data: state.sections };
};

const validateFormat = (state: LadderWizardState): StepValidationResult => {
  const game = ladderGameFormSchema.safeParse(state.format.game);
  if (!game.success) return { success: false, error: game.error };
  const scoring = ladderScoringFormSchema.safeParse(state.format.scoring);
  if (!scoring.success) return { success: false, error: scoring.error };
  const schedule = ladderScheduleFormSchema.safeParse(state.format.schedule);
  if (!schedule.success) return { success: false, error: schedule.error };
  const registration = ladderRegistrationFormSchema.safeParse(state.format.registration);
  if (!registration.success) return { success: false, error: registration.error };
  return { success: true, data: state.format };
};

const validateRoster = (state: LadderWizardState): StepValidationResult =>
  toStepResult(ladderMembersCollectionSchema.safeParse(state.roster.members));

export const LADDER_WIZARD_STEPS: LadderWizardStepDefinition[] = [
  {
    id: "basics",
    title: "Basics",
    subtitle: "Name & visibility",
    description: "Collect the ladder headline, summary, and visibility setting.",
    validate: validateBasics,
    completionCheck: (state) => Boolean(state.basics.name.trim()),
  },
  {
    id: "seed",
    title: "AI Seed",
    subtitle: "Goals & prompts",
    description: "Optional creative brief for LadderForge templates and AI drafting.",
    validate: validateSeed,
    completionCheck: () => true,
  },
  {
    id: "sections",
    title: "Story",
    subtitle: "Overview & highlights",
    description: "Configure content blocks that power the Capsule events view.",
    validate: validateSections,
    completionCheck: (state) => SECTION_KEYS.every((key) => Boolean(state.sections[key].title.trim())),
  },
  {
    id: "format",
    title: "Format",
    subtitle: "Game, scoring, schedule",
    description: "Tune match cadence, scoring rules, and registration funnels.",
    validate: validateFormat,
    completionCheck: (state) => Boolean(state.format.game.title.trim() && state.format.game.mode.trim()),
  },
  {
    id: "roster",
    title: "Roster",
    subtitle: "Seeds & records",
    description: "Seed teams or players with initial stats to launch the table.",
    validate: validateRoster,
    completionCheck: (state) => state.roster.members.length > 0,
  },
  {
    id: "review",
    title: "Review",
    subtitle: "Preview & publish",
    description: "Preview the ladder, share the recap, and confirm publish settings.",
    validate: () => ({ success: true, data: null }),
    completionCheck: () => true,
  },
];

export const LADDER_WIZARD_STEP_ORDER = LADDER_WIZARD_STEPS.map((step) => step.id);

export type LadderWizardPreviewMember = {
  displayName: string;
  seed?: number | null;
  rating: number;
  record: string;
  streak: number;
};

export type LadderWizardPreviewSection = {
  key: SectionKey | `custom-${number}`;
  title: string;
  body: string;
  bullets: string[];
};

export type LadderWizardPreviewModel = {
  name: string;
  visibilityLabel: string;
  summary: string;
  gameTitle: string;
  gameMeta: string[];
  schedule: string[];
  scoring: string[];
  registration: string[];
  sections: LadderWizardPreviewSection[];
  members: LadderWizardPreviewMember[];
};

const findVisibilityLabel = (value: LadderWizardState["basics"]["visibility"]) => {
  return ladderVisibilityOptions.find((option) => option.value === value)?.label ?? "Capsule";
};

const formatRecord = (member: LadderMemberFormValues) => {
  const wins = parseIntegerField(member.wins, 0, { min: 0 });
  const losses = parseIntegerField(member.losses, 0, { min: 0 });
  const draws = parseIntegerField(member.draws, 0, { min: 0 });
  return `${wins}-${losses}${draws ? `-${draws}` : ""}`;
};

const buildSections = (sections: LadderWizardState["sections"]): LadderWizardPreviewSection[] => {
  const base = SECTION_KEYS.map((key) => ({
    key,
    title: sections[key].title.trim() || key,
    body: sections[key].body?.trim() ?? "",
    bullets: transformBulletsText(sections[key].bulletsText),
  }));

  const custom =
    sections.custom?.map((entry, index) => ({
      key: `custom-${index}` as const,
      title: entry.title.trim() || `Custom ${index + 1}`,
      body: entry.body?.trim() ?? "",
      bullets: transformBulletsText(entry.bulletsText),
    })) ?? [];

  return [...base, ...custom];
};

const formatScoring = (state: LadderWizardState) => {
  const scoring = state.format.scoring;
  const lines = [`System: ${scoring.system.toUpperCase()}`];
  if (scoring.system === "elo") {
    const rating = parseIntegerField(scoring.initialRating, 1200, { min: 100, max: 4000 });
    const kFactor = parseIntegerField(scoring.kFactor, 32, { min: 4, max: 64 });
    lines.push(`Starting rating ${rating} (K${kFactor})`);
    const placement = parseIntegerField(scoring.placementMatches, 3, { min: 0, max: 10 });
    lines.push(`Placement matches ${placement}`);
  }
  if (scoring.decayPerDay) {
    const decay = parseIntegerField(scoring.decayPerDay, 0, { min: 0, max: 100 });
    lines.push(`Rating decay ${decay}/day`);
  }
  if (scoring.bonusForStreak) {
    const bonus = parseIntegerField(scoring.bonusForStreak, 0, { min: 0, max: 20 });
    lines.push(`Win streak bonus +${bonus}`);
  }
  return lines;
};

export const buildWizardPreviewModel = (state: LadderWizardState): LadderWizardPreviewModel => {
  const gameMeta = [matchFormatLabel(state.format.game.mode), state.format.game.platform, state.format.game.region]
    .map((entry) => (entry ? entry.trim() : ""))
    .filter(Boolean);

  const scheduleMeta = [state.format.schedule.cadence, state.format.schedule.kickoff, state.format.schedule.timezone]
    .map((entry) => (entry ? entry.trim() : ""))
    .filter(Boolean);

  const registrationMeta = [
    `Type: ${state.format.registration.type}`,
    state.format.registration.maxTeams ? `Max teams: ${state.format.registration.maxTeams}` : "",
    state.format.registration.opensAt ? `Opens ${state.format.registration.opensAt}` : "",
    state.format.registration.closesAt ? `Closes ${state.format.registration.closesAt}` : "",
  ].filter(Boolean);

  const members = state.roster.members.slice(0, 12).map((member) => ({
    displayName: member.displayName.trim() || "TBD",
    seed: parseOptionalIntegerField(member.seed ?? "", { min: 1, max: 999 }),
    rating: parseIntegerField(member.rating, 1200, { min: 100, max: 4000 }),
    record: formatRecord(member),
    streak: parseIntegerField(member.streak, 0, { min: -20, max: 20 }),
  }));

  return {
    name: state.basics.name.trim() || "Untitled ladder",
    visibilityLabel: findVisibilityLabel(state.basics.visibility),
    summary: state.basics.summary?.trim() ?? "",
    gameTitle: state.format.game.title.trim(),
    gameMeta,
    schedule: scheduleMeta,
    scoring: formatScoring(state),
    registration: registrationMeta,
    sections: buildSections(state.sections),
    members,
  };
};
