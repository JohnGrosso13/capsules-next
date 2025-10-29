export type LadderVisibility = "private" | "capsule" | "public";
export type LadderStatus = "draft" | "active" | "archived";

export type LadderSectionBlock = {
  id: string;
  title: string;
  body: string | null;
  bulletPoints?: string[] | null;
  lastUpdatedAt?: string | null;
};

export type LadderSections = {
  overview?: LadderSectionBlock | null;
  rules?: LadderSectionBlock | null;
  shoutouts?: LadderSectionBlock | null;
  upcoming?: LadderSectionBlock | null;
  results?: LadderSectionBlock | null;
  custom?: LadderSectionBlock[];
};

export type LadderGameConfig = {
  title: string | null;
  franchise?: string | null;
  mode?: string | null;
  platform?: string | null;
  region?: string | null;
  summary?: string | null;
};

export type LadderScheduleConfig = {
  cadence?: string | null;
  kickoff?: string | null;
  timezone?: string | null;
  checkInWindowMinutes?: number | null;
  playoffsAt?: string | null;
  finalsAt?: string | null;
};

export type LadderRegistrationConfig = {
  type?: "open" | "invite" | "waitlist";
  closesAt?: string | null;
  opensAt?: string | null;
  requirements?: string[];
  maxTeams?: number | null;
};

export type LadderScoringConfig = {
  system?: "elo" | "points" | "custom";
  initialRating?: number | null;
  kFactor?: number | null;
  placementMatches?: number | null;
  decayPerDay?: number | null;
  bonusForStreak?: number | null;
};

export type LadderModerationConfig = {
  autoResolve?: boolean;
  disputeProtocol?: string | null;
  proofRequired?: boolean;
  escalationChannels?: string[];
};

export type LadderCommunicationConfig = {
  announcementsCadence?: string | null;
  channels?: string[];
  aiCopyProfile?: string | null;
};

export type LadderConfig = {
  objectives?: string[];
  tags?: string[];
  season?: {
    label?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
  };
  schedule?: LadderScheduleConfig;
  registration?: LadderRegistrationConfig;
  scoring?: LadderScoringConfig;
  moderation?: LadderModerationConfig;
  communications?: LadderCommunicationConfig;
  layout?: {
    landingTheme?: string | null;
    showcaseBlocks?: Array<{
      id: string;
      title: string;
      description: string | null;
      imageUrl?: string | null;
    }>;
  };
  [key: string]: unknown;
};

export type LadderAiSuggestion = {
  id: string;
  title: string;
  summary: string;
  section?: keyof LadderSections | null;
};

export type LadderAiPlan = {
  prompt?: string;
  reasoning?: string;
  generatedAt: string;
  version?: string | null;
  suggestions?: LadderAiSuggestion[];
  metadata?: Record<string, unknown> | null;
};

export type CapsuleLadderSummary = {
  id: string;
  capsuleId: string;
  name: string;
  slug: string | null;
  summary: string | null;
  status: LadderStatus;
  visibility: LadderVisibility;
  createdById: string;
  game: LadderGameConfig;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  meta: Record<string, unknown> | null;
};

export type CapsuleLadderDetail = CapsuleLadderSummary & {
  publishedById: string | null;
  config: LadderConfig;
  sections: LadderSections;
  aiPlan: LadderAiPlan | null;
  meta: Record<string, unknown> | null;
};

export type CapsuleLadderMember = {
  id: string;
  ladderId: string;
  userId: string | null;
  displayName: string;
  handle: string | null;
  seed: number | null;
  rank: number | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type CapsuleLadderMemberInput = {
  userId?: string | null;
  displayName: string;
  handle?: string | null;
  seed?: number | null;
  rank?: number | null;
  rating?: number | null;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  streak?: number | null;
  metadata?: Record<string, unknown> | null;
};
