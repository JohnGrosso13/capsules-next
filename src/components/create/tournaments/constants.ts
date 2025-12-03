import type { TournamentStepDefinition, TournamentStepId } from "./types";

export const MIN_NAME_QUERY = 2;
export const SUGGESTION_LIMIT = 6;

export const TOURNAMENT_STEPS: TournamentStepDefinition[] = [
  { id: "blueprint", title: "Blueprint", subtitle: "AI draft + structure" },
  { id: "details", title: "Details", subtitle: "Name, summary, visibility" },
  { id: "format", title: "Format", subtitle: "Bracket, registration, timing" },
  { id: "content", title: "Content", subtitle: "Sections & production notes" },
  { id: "participants", title: "Seeds", subtitle: "Entrants and seeds" },
  { id: "review", title: "Review", subtitle: "Preview & publish" },
];

export const TOURNAMENT_STEP_ORDER = TOURNAMENT_STEPS.map((step) => step.id as TournamentStepId);
