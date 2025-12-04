import { z } from "zod";

import type { LadderVisibility, LadderStatus } from "@/types/ladders";

export const SECTION_KEYS = ["overview", "rules", "shoutouts", "upcoming", "results"] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const ladderVisibilityEnum = z.enum(["private", "capsule", "public"]);

export const ladderStatusEnum = z.enum(["draft", "active", "archived"]);

export const ladderBasicsFormSchema = z
  .object({
    name: z.string().max(80),
    summary: z.string().max(280).nullable().optional(),
    visibility: ladderVisibilityEnum,
    publish: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const trimmed = value.name.trim();
    if (!trimmed.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Enter a ladder name." });
      return;
    }
    if (trimmed.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "Name must include at least 3 characters.",
      });
    }
  });

export type LadderBasicsFormValues = z.infer<typeof ladderBasicsFormSchema>;

export const defaultBasicsForm: LadderBasicsFormValues = {
  name: "",
  summary: "",
  visibility: "capsule",
  publish: false,
};

export const ladderSeedFormSchema = z.object({
  goal: z.string().max(420).optional(),
  audience: z.string().max(160).optional(),
  tone: z.string().max(160).optional(),
  capsuleBrief: z.string().max(420).optional(),
  seasonLengthWeeks: z.string().max(20).optional(),
  participants: z.string().max(20).optional(),
  timezone: z.string().max(80).optional(),
  registrationNotes: z.string().max(420).optional(),
  existingRules: z.string().max(420).optional(),
  notes: z.string().max(420).optional(),
  gameTitle: z.string().max(80).optional(),
  gameMode: z.string().max(80).optional(),
  gamePlatform: z.string().max(80).optional(),
  gameRegion: z.string().max(80).optional(),
  prizeIdeas: z.string().max(420).optional(),
  announcementsFocus: z.string().max(420).optional(),
  shoutouts: z.string().max(420).optional(),
});

export type LadderSeedFormValues = z.infer<typeof ladderSeedFormSchema>;

export const defaultSeedForm: LadderSeedFormValues = {
  goal: "",
  audience: "",
  tone: "",
  capsuleBrief: "",
  seasonLengthWeeks: "",
  participants: "",
  timezone: "",
  registrationNotes: "",
  existingRules: "",
  notes: "",
  gameTitle: "",
  gameMode: "",
  gamePlatform: "",
  gameRegion: "",
  prizeIdeas: "",
  announcementsFocus: "",
  shoutouts: "",
};

export const ladderSectionFormSchema = z
  .object({
    title: z.string().max(80),
    body: z.string().max(1200).optional(),
    bulletsText: z.string().max(1200).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.title.trim().length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["title"], message: "Section title is required." });
    }
    if (value.bulletsText) {
      const lines = value.bulletsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length > 8) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bulletsText"],
          message: "Limit bullet points to 8 entries.",
        });
      }
      const tooLong = lines.find((line) => line.length > 200);
      if (tooLong) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bulletsText"],
          message: "Bullet points must be 200 characters or fewer.",
        });
      }
    }
  });

export type LadderSectionFormValues = z.infer<typeof ladderSectionFormSchema>;

export type LadderCustomSectionFormValues = LadderSectionFormValues & { id: string };

export const defaultSectionsForm = (): Record<SectionKey, LadderSectionFormValues> => ({
  overview: { title: "Ladder Overview", body: "", bulletsText: "" },
  rules: { title: "Core Rules", body: "", bulletsText: "" },
  shoutouts: { title: "Shoutouts & Highlights", body: "", bulletsText: "" },
  upcoming: { title: "Upcoming Challenges", body: "", bulletsText: "" },
  results: { title: "Recent Results", body: "", bulletsText: "" },
});

export const ladderGameFormSchema = z.object({
  title: z.string().max(80),
  mode: z
    .string()
    .max(80)
    .superRefine((value, ctx) => {
      const trimmed = value.trim();
      const allowed = ["1v1", "teams", "capsule_vs_capsule"];
      if (!trimmed.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mode"], message: "Select a match format." });
        return;
      }
      if (!allowed.includes(trimmed)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mode"],
          message: "Choose a match format from the provided options.",
        });
      }
    }),
  platform: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
});

export type LadderGameFormValues = z.infer<typeof ladderGameFormSchema>;

export const defaultGameForm: LadderGameFormValues = {
  title: "",
  mode: "",
  platform: "",
  region: "",
};

export const matchFormatOptions = [
  { value: "1v1", label: "1v1 (player vs player)" },
  { value: "teams", label: "Teams (users vs users)" },
  { value: "capsule_vs_capsule", label: "Capsule vs Capsule" },
];

export const matchFormatLabel = (value?: string | null): string => {
  if (!value) return "";
  const option = matchFormatOptions.find((option) => option.value === value);
  return option?.label ?? value;
};

export const ladderScoringFormSchema = z.object({
  system: z.enum(["simple", "elo", "ai", "points", "custom"]).default("elo"),
  initialRating: z.string().max(4),
  kFactor: z.string().max(4),
  placementMatches: z.string().max(2),
  decayPerDay: z.string().max(4).optional(),
  bonusForStreak: z.string().max(4).optional(),
});

export type LadderScoringFormValues = z.infer<typeof ladderScoringFormSchema>;

export const defaultScoringForm: LadderScoringFormValues = {
  system: "elo",
  initialRating: "1200",
  kFactor: "32",
  placementMatches: "3",
  decayPerDay: "",
  bonusForStreak: "",
};

export const ladderScheduleFormSchema = z.object({
  cadence: z.string().max(80).optional(),
  kickoff: z.string().max(80).optional(),
  timezone: z.string().max(60).optional(),
});

export type LadderScheduleFormValues = z.infer<typeof ladderScheduleFormSchema>;

export const defaultScheduleForm: LadderScheduleFormValues = {
  cadence: "Weekly rounds",
  kickoff: "Mondays 7 PM",
  timezone: "",
};

export const ladderRegistrationFormSchema = z.object({
  type: z.enum(["open", "invite", "waitlist"]).default("open"),
  maxTeams: z.string().max(4),
  requirements: z.string().max(420).optional(),
  opensAt: z.string().max(40).optional(),
  closesAt: z.string().max(40).optional(),
});

export type LadderRegistrationFormValues = z.infer<typeof ladderRegistrationFormSchema>;

export const defaultRegistrationForm: LadderRegistrationFormValues = {
  type: "open",
  maxTeams: "",
  requirements: "",
  opensAt: "",
  closesAt: "",
};

export const ladderMemberFormSchema = z
  .object({
    id: z.string().uuid().optional(),
    userId: z.string().max(80).optional(),
    capsuleId: z.string().max(80).optional(),
    capsuleSlug: z.string().max(80).optional(),
    avatarUrl: z.string().max(512).optional(),
    displayName: z.string().max(80),
    handle: z.string().max(40).optional(),
    seed: z.string().max(3),
    rating: z.string().max(4),
    wins: z.string().max(3),
    losses: z.string().max(3),
    draws: z.string().max(3),
    streak: z.string().max(3),
  })
  .superRefine((value, ctx) => {
    const name = value.displayName.trim();
    if (!name.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["displayName"], message: "Display name is required." });
      return;
    }
    const hasUserId = typeof value.userId === "string" && value.userId.trim().length > 0;
    const hasCapsuleId = typeof value.capsuleId === "string" && value.capsuleId.trim().length > 0;
    if (!hasUserId && !hasCapsuleId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["displayName"],
        message: "Select a real user or Capsule from search.",
      });
    }
  });

export type LadderMemberFormValues = z.infer<typeof ladderMemberFormSchema>;

export const createEmptyMemberForm = (index: number): LadderMemberFormValues => ({
  userId: "",
  capsuleId: "",
  capsuleSlug: "",
  avatarUrl: "",
  displayName: "",
  handle: "",
  seed: String(index + 1),
  rating: "1200",
  wins: "0",
  losses: "0",
  draws: "0",
  streak: "0",
});

export const ladderMembersCollectionSchema = z
  .array(ladderMemberFormSchema)
  .min(1, "Add at least one participant.")
  .max(24, "Limit ladders to 24 participants at launch.");

export type LadderMembersFormValues = z.infer<typeof ladderMembersCollectionSchema>;

export const defaultMembersForm = (): LadderMembersFormValues => [createEmptyMemberForm(0)];

export const ladderWizardStateSchema = z.object({
  basics: ladderBasicsFormSchema,
  seed: ladderSeedFormSchema,
  sections: z.object({
    overview: ladderSectionFormSchema,
    rules: ladderSectionFormSchema,
    shoutouts: ladderSectionFormSchema,
    upcoming: ladderSectionFormSchema,
    results: ladderSectionFormSchema,
    custom: z.array(ladderSectionFormSchema.safeExtend({ id: z.string() })).max(6).optional(),
  }),
  format: z.object({
    game: ladderGameFormSchema,
    scoring: ladderScoringFormSchema,
    schedule: ladderScheduleFormSchema,
    registration: ladderRegistrationFormSchema,
  }),
  roster: z.object({
    members: ladderMembersCollectionSchema,
  }),
  meta: z
    .object({
      variant: z.string().default("ladder"),
      status: ladderStatusEnum.default("draft"),
    })
    .passthrough(),
});

export type LadderWizardState = z.infer<typeof ladderWizardStateSchema>;

export const createDefaultWizardState = (): LadderWizardState => ({
  basics: defaultBasicsForm,
  seed: defaultSeedForm,
  sections: {
    ...defaultSectionsForm(),
    custom: [],
  },
  format: {
    game: defaultGameForm,
    scoring: defaultScoringForm,
    schedule: defaultScheduleForm,
    registration: defaultRegistrationForm,
  },
  roster: {
    members: defaultMembersForm(),
  },
  meta: {
    variant: "ladder",
    status: "draft",
  },
});

export type LadderWizardDesignTokens = {
  surface: string;
  glass: string;
  borderSoft: string;
  borderStrong: string;
  focusRing: string;
  textPrimary: string;
  textSecondary: string;
};

export const ladderWizardTokens: LadderWizardDesignTokens = {
  surface: "var(--studio-surface-panel)",
  glass: "var(--studio-surface-glass)",
  borderSoft: "var(--studio-border-soft)",
  borderStrong: "var(--studio-border-strong)",
  focusRing: "var(--studio-border-focus)",
  textPrimary: "var(--studio-text-primary)",
  textSecondary: "var(--studio-text-secondary)",
};

export type LadderWizardVisibilityOption = {
  value: LadderVisibility;
  label: string;
  description: string;
};

export const ladderVisibilityOptions: LadderWizardVisibilityOption[] = [
  {
    value: "private",
    label: "Private",
    description: "Only managers can view or join. Perfect for test ladders.",
  },
  {
    value: "capsule",
    label: "Capsule",
    description: "Visible to capsule members with invite links enabled.",
  },
  {
    value: "public",
    label: "Public",
    description: "Open to anyone with the link in your Capsule Events tab.",
  },
];

export type LadderWizardStatusOption = {
  value: LadderStatus;
  label: string;
};

export const ladderStatusOptions: LadderWizardStatusOption[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

export const transformBulletsText = (value: string | undefined): string[] => {
  if (!value) return [];
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const parseIntegerField = (value: string, fallback: number, options?: { min?: number; max?: number }): number => {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return clampInteger(fallback, options);
  }
  return clampInteger(parsed, options);
};

export const parseOptionalIntegerField = (
  value: string,
  options?: { min?: number; max?: number },
): number | null => {
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return null;
  return clampInteger(parsed, options);
};

const clampInteger = (value: number, options?: { min?: number; max?: number }): number => {
  if (!options) return value;
  const { min, max } = options;
  let result = value;
  if (typeof min === "number") {
    result = Math.max(min, result);
  }
  if (typeof max === "number") {
    result = Math.min(max, result);
  }
  return result;
};
