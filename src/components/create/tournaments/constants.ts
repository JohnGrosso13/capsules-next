import type { TournamentStepDefinition, TournamentStepId } from "./types";

export const MIN_NAME_QUERY = 2;
export const SUGGESTION_LIMIT = 6;

export const TOURNAMENT_STEPS: TournamentStepDefinition[] = [
  { id: "blueprint", title: "Blueprint", subtitle: "Describe your tournament" },
  { id: "title", title: "Title", subtitle: "Name your tournament" },
  { id: "summary", title: "Summary", subtitle: "Set the hook and vibe" },
  { id: "signups", title: "Sign-Ups", subtitle: "How players join" },
  { id: "basics", title: "Basics", subtitle: "Choose the game, match style, and timing." },
  { id: "format", title: "Format", subtitle: "Bracket, registration, timing" },
  { id: "overview", title: "Overview", subtitle: "Overview & highlights" },
  { id: "rules", title: "Rules", subtitle: "Rules & format" },
  { id: "shoutouts", title: "Shoutouts", subtitle: "Shoutouts & broadcast" },
  { id: "rewards", title: "Rewards", subtitle: "Prizing & incentives" },
  { id: "participants", title: "Roster", subtitle: "Seeds & records" },
  { id: "review", title: "Review", subtitle: "Preview & publish" },
];

export const TOURNAMENT_STEP_ORDER = TOURNAMENT_STEPS.map((step) => step.id as TournamentStepId);
