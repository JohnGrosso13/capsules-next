export type GuidedStepId =
  | "blueprint"
  | "title"
  | "summary"
  | "registration"
  | "type"
  | "format"
  | "overview"
  | "rules"
  | "shoutouts"
  | "roster"
  | "rewards"
  | "review";

export type GuidedStepDefinition = {
  id: GuidedStepId;
  title: string;
  subtitle: string;
  helper: string;
};

export const GUIDED_STEP_DEFINITIONS: GuidedStepDefinition[] = [
  {
    id: "blueprint",
    title: "Blueprint",
    subtitle: "Describe your ladder and auto-fill everything.",
    helper: "Tell your assistant the vibe, game, format, and rules; we'll prefill the steps for you.",
  },
  {
    id: "title",
    title: "Title",
    subtitle: "Short, ownable, and true to the ladder's vibe.",
    helper: 'Try alliteration or a season theme: "{Capsule} Circuit", "Weekend Gauntlet".',
  },
  {
    id: "summary",
    title: "Summary",
    subtitle: "Explain why this ladder matters in a single sentence.",
    helper: "Highlight audience, cadence, or prizes so Capsule AI can build the promo copy.",
  },
  {
    id: "registration",
    title: "Sign-Ups",
    subtitle: "Choose how teams join and set limits.",
    helper: "Capsule uses this for funnel copy, invite buttons, and reminders.",
  },
  {
    id: "type",
    title: "Basics",
    subtitle: "Choose the game, match style, and timing.",
    helper: "We'll use this to pre-fill scoring, cadence, and format details.",
  },
  {
    id: "format",
    title: "Format",
    subtitle: "Dial in the rating defaults and placement matches.",
    helper: "Initial rating, K-factor, and placement games help Capsule guide skill progression.",
  },
  {
    id: "overview",
    title: "Overview",
    subtitle: "Describe the story, vibe, or stakes.",
    helper: "This becomes the hero copy on Capsules and invites, so keep it vivid and specific.",
  },
  {
    id: "rules",
    title: "Rules",
    subtitle: "Lay down the essentials players need to know.",
    helper: "Capsule AI will automate the long-form version; just note the must-follow items.",
  },
  {
    id: "shoutouts",
    title: "Shoutouts",
    subtitle: "Collect story hooks, MVPs, or spotlight moments.",
    helper: "Use bullets for themes (e.g. clutch saves, top fraggers) so AI recaps can riff on them.",
  },
  {
    id: "roster",
    title: "Roster",
    subtitle: "Set seeds, handles, and starting stats.",
    helper: "Edit each row directly. Capsule highlights ratings and streaks in the preview.",
  },
  {
    id: "rewards",
    title: "Rewards",
    subtitle: "Tell challengers what they're chasing.",
    helper: "Capsule AI can hype prizes, shoutouts, or story beats in announcements.",
  },
  {
    id: "review",
    title: "Review",
    subtitle: "Double-check visibility and go live when you're ready.",
    helper: "This guided flow is the primary builder; polish every detail here before launch.",
  },
];

export const GUIDED_STEP_ORDER = GUIDED_STEP_DEFINITIONS.map((step) => step.id);

export const RULE_SNIPPETS = [
  "Matches are best-of-three. Screenshot every result.",
  "Captains have 48 hours to play once a match post goes live.",
  "Subs are allowed but must be reported before kickoff.",
  "Report disputes in #match-review with evidence.",
];

export const REWARD_SNIPPETS = [
  "Top 3 earn featured posts across Capsule Events.",
  "Weekly MVP gets a custom Capsule portrait.",
  "Winners snag merch codes + priority scrim slots.",
  "Perfect records unlock an interview with the Capsule host.",
];

export const DEFAULT_GUIDED_STEP: GuidedStepId = GUIDED_STEP_ORDER[0] ?? "title";

export const GUIDED_STEP_MAP = new Map<GuidedStepId, GuidedStepDefinition>(
  GUIDED_STEP_DEFINITIONS.map((step) => [step.id, step]),
);

export const buildGuidedNameIdeas = (capsuleName?: string | null, gameTitle?: string): string[] => {
  const base = (capsuleName ?? "Capsule").trim() || "Capsule";
  const game = (gameTitle ?? "").trim() || "Open";
  const stem = `${base} ${game}`.trim();
  return [`${stem} Ladder`, `${base} ${game} Gauntlet`, `${game} Spotlight Series`];
};

export const buildGuidedSummaryIdeas = (options: {
  capsuleName?: string | null;
  gameTitle?: string;
  cadence?: string;
  rewardsFocus?: string;
}): string[] => {
  const capsule = (options.capsuleName ?? "the capsule community").trim();
  const game = (options.gameTitle ?? "your game").trim() || "your game";
  const cadence = (options.cadence ?? "weekly rounds").trim() || "weekly rounds";
  const rewards = (options.rewardsFocus ?? "spotlight shoutouts").trim() || "spotlight shoutouts";
  return [
    `${capsule} runs a ${cadence} ${game} ladder with Capsule AI covering every upset.`,
    `${game} challengers climb fast seasons, win ${rewards}, and get auto-generated recaps.`,
  ];
};
