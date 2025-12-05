import type { GuidedStepId } from "./guidedConfig";
import {
  defaultRegistrationForm,
  defaultScheduleForm,
  defaultScoringForm,
  type LadderMemberFormValues,
  type LadderRegistrationFormValues,
} from "./ladderFormState";
import type { LadderBuilderFormState } from "./builderState";

type GuidedCompletionInput = {
  form: LadderBuilderFormState;
  members: LadderMemberFormValues[];
  visited: Record<GuidedStepId, boolean>;
};

const isRegistrationTouched = (registration: LadderRegistrationFormValues): boolean => {
  const defaults = defaultRegistrationForm;
  return (
    (registration.type && registration.type.trim() && registration.type !== defaults.type) ||
    Boolean(registration.maxTeams.trim().length) ||
    Boolean(registration.requirements?.trim().length) ||
    Boolean(registration.opensAt?.trim().length) ||
    Boolean(registration.closesAt?.trim().length)
  );
};

const isBasicsStepTouched = (form: LadderBuilderFormState): boolean => {
  const { game, schedule } = form;
  const scheduleDefaults = defaultScheduleForm;
  const cadence = schedule.cadence ?? "";
  const kickoff = schedule.kickoff ?? "";
  const defCadence = scheduleDefaults.cadence ?? "";
  const defKickoff = scheduleDefaults.kickoff ?? "";
  const gameTouched =
    game.title.trim().length ||
    game.mode?.trim().length ||
    game.platform?.trim().length ||
    game.region?.trim().length;
  const scheduleTouched =
    cadence.trim() !== defCadence.trim() ||
    kickoff.trim() !== defKickoff.trim() ||
    Boolean(schedule.timezone?.trim().length);
  return Boolean(gameTouched || scheduleTouched);
};

const isFormatTouched = (form: LadderBuilderFormState): boolean => {
  const { game, scoring } = form;
  const gameTouched =
    game.title.trim().length ||
    game.mode?.trim().length ||
    game.platform?.trim().length ||
    game.region?.trim().length;
  const scoreDefault = defaultScoringForm;
  const scoringTouched =
    scoring.system !== scoreDefault.system ||
    scoring.initialRating.trim() !== scoreDefault.initialRating ||
    scoring.kFactor.trim() !== scoreDefault.kFactor ||
    scoring.placementMatches.trim() !== scoreDefault.placementMatches ||
    Boolean(scoring.decayPerDay?.trim().length) ||
    Boolean(scoring.bonusForStreak?.trim().length);
  return Boolean(gameTouched || scoringTouched);
};

export const buildGuidedCompletion = ({
  form,
  members,
  visited,
}: GuidedCompletionInput): Record<GuidedStepId, boolean> => {
  const basicsComplete = {
    blueprint: visited.blueprint,
    title: visited.title || Boolean(form.name.trim().length),
    summary: visited.summary || Boolean(form.summary.trim().length),
    registration: visited.registration || isRegistrationTouched(form.registration),
    type: visited.type || isBasicsStepTouched(form),
    format: visited.format || isFormatTouched(form),
    overview: visited.overview || Boolean(form.sections.overview.body?.trim().length),
    rules: visited.rules || Boolean(form.sections.rules.body?.trim().length),
    shoutouts:
      visited.shoutouts ||
      Boolean(form.sections.shoutouts.body?.trim().length || form.sections.shoutouts.bulletsText?.trim().length),
    roster: visited.roster || members.some((member) => member.displayName.trim().length),
    rewards: visited.rewards || Boolean(form.sections.results.body?.trim().length),
  };
  const reviewReady = Object.values(basicsComplete).every(Boolean);
  return {
    ...basicsComplete,
    review: reviewReady,
  };
};
