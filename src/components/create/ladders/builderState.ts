import type { LadderVisibility } from "@/types/ladders";
import {
  defaultSectionsForm,
  type SectionKey,
  type LadderSectionFormValues,
  type LadderCustomSectionFormValues,
  type LadderGameFormValues,
  type LadderScoringFormValues,
  type LadderScheduleFormValues,
  type LadderRegistrationFormValues,
  type LadderMemberFormValues,
  defaultGameForm,
  defaultScoringForm,
  defaultScheduleForm,
  defaultRegistrationForm,
  defaultBasicsForm,
} from "./ladderFormState";

export type LadderBuilderFormState = {
  name: string;
  summary: string;
  visibility: LadderVisibility;
  publish: boolean;
  sections: Record<SectionKey, LadderSectionFormValues>;
  customSections: LadderCustomSectionFormValues[];
  game: LadderGameFormValues;
  scoring: LadderScoringFormValues;
  schedule: LadderScheduleFormValues;
  registration: LadderRegistrationFormValues;
};

export function createInitialFormState(): LadderBuilderFormState {
  return {
    name: defaultBasicsForm.name,
    summary: defaultBasicsForm.summary ?? "",
    visibility: defaultBasicsForm.visibility,
    publish: defaultBasicsForm.publish,
    sections: defaultSectionsForm(),
    customSections: [],
    game: { ...defaultGameForm },
    scoring: { ...defaultScoringForm },
    schedule: { ...defaultScheduleForm },
    registration: { ...defaultRegistrationForm },
  };
}

export function trimOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeMemberList(list: LadderMemberFormValues[]): LadderMemberFormValues[] {
  return list.map((member, index) => ({
    ...member,
    seed: member.seed.trim().length ? member.seed : String(index + 1),
    rating: member.rating.trim().length ? member.rating : "1200",
    wins: member.wins.trim().length ? member.wins : "0",
    losses: member.losses.trim().length ? member.losses : "0",
    draws: member.draws.trim().length ? member.draws : "0",
    streak: member.streak.trim().length ? member.streak : "0",
  }));
}

export const streakLabel = (value: number): string => {
  if (Number.isNaN(value)) return "0";
  if (value > 0) return `+${value}`;
  return String(value);
};
