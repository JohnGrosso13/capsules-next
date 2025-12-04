import type { WizardLayoutStep } from "../ladders/components/WizardLayout";

export type FormatOption = "single_elimination" | "double_elimination" | "round_robin";
export type RegistrationType = "open" | "invite" | "waitlist" | "mixed";
export type TournamentStepId =
  | "blueprint"
  | "title"
  | "summary"
  | "signups"
  | "basics"
  | "overview"
  | "rules"
  | "shoutouts"
  | "format"
  | "rewards"
  | "participants"
  | "review";
export type ParticipantEntityType = "custom" | "user" | "capsule";

export type TournamentFormState = {
  name: string;
  summary: string;
  visibility: "private" | "capsule" | "public";
  publish: boolean;
  gameTitle: string;
  gamePlatform: string;
  gameRegion: string;
  seasonLength: string;
  matchCadence: string;
  kickoffNotes: string;
  format: FormatOption;
  matchMode?: "1v1" | "teams" | "capsule_vs_capsule" | "";
  bestOf: string;
  start: string;
  timezone: string;
  registrationType: RegistrationType;
  maxEntrants: string;
  registrationRequirements: string;
  overview: string;
  rules: string;
  broadcast: string;
  updates: string;
  rewards: string;
};

export type ParticipantFormState = {
  id?: string;
  displayName: string;
  handle: string;
  seed: string;
  rating: string;
  wins: string;
  losses: string;
  draws: string;
  streak: string;
  entityType: ParticipantEntityType;
  userId: string;
  capsuleId: string;
};

export type TournamentPreviewModel = {
  title: string;
  summary: string;
  capsuleName: string;
  format: string;
  matchMode?: "1v1" | "teams" | "capsule_vs_capsule" | "";
  registration: string;
  kickoff: string;
  sections: Array<{ id: string; title: string; body: string }>;
  participants: Array<{ name: string; handle: string; seed: string }>;
};

export type ParticipantSuggestion =
  | { kind: "user"; id: string; name: string; subtitle: string | null }
  | { kind: "capsule"; id: string; name: string; subtitle: string | null };

export type TournamentStepDefinition = WizardLayoutStep<TournamentStepId>;
