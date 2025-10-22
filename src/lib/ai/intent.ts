import { resolveNavigationTarget } from "@/lib/ai/nav";

export type PromptIntent = "generate" | "post" | "navigate" | "style";

export type IntentSource = "none" | "heuristic" | "ai";

export type IntentResolution = {
  intent: PromptIntent;
  confidence: number;
  reason?: string;
  source: IntentSource;
};

type HeuristicPattern = {
  regex: RegExp;
  confidence: number;
  reason: string;
  guard?: RegExp;
};

const DEFAULT_POST_CONFIDENCE = 0.62;
const EMPTY_POST_CONFIDENCE = 0.35;
const STRONG_OVERRIDE_CONFIDENCE = 0.78;
const NAVIGATION_TARGET_CONFIDENCE = 0.9;

const POST_PATTERNS: HeuristicPattern[] = [
  {
    regex: /^post\s*[:\-]\s*\S+/,
    confidence: 0.92,
    reason: "Direct 'post:' directive detected.",
  },
  {
    regex: /^p:\s*\S+/,
    confidence: 0.9,
    reason: "Shorthand 'p:' directive detected.",
  },
  {
    regex:
      /\b(post|publish|share)\s+(?:this|that|the|my)\s+(?:update|post|message|story|photo|video|image|idea)\b/,
    confidence: 0.84,
    reason: "Asks to publish existing content.",
  },
  {
    regex:
      /\b(post|publish|share)\s+(?:to|on)\s+(?:my\s+)?(feed|capsule|timeline|friends|audience|followers)\b/,
    confidence: 0.8,
    reason: "Requests posting to a Capsule surface.",
  },
];

const STYLE_PATTERNS: HeuristicPattern[] = [
  {
    regex:
      /\b(style|restyle|recolor|recolour|theme|retune|skin|paint|decorate)\b[^.?!]*(capsule|page|profile|feed|tiles?|cards?|buttons?|background|header|banner|module)\b/,
    confidence: 0.84,
    reason: "Styling language targeting Capsule surfaces.",
  },
  {
    regex:
      /\b(change|set|switch|make|turn)\b[^.?!]*(capsule|page|profile|feed|background|buttons?|tiles?|cards?|banner)\b[^.?!]*(color|colour|theme|palette)\b/,
    confidence: 0.82,
    reason: "Requests to adjust Capsule colors or theme.",
  },
  {
    regex: /\b(styler|theme\s+builder|capsule\s+styler)\b/,
    confidence: 0.82,
    reason: "Mentions the Capsule styling tools.",
  },
  {
    regex: /\btheme\s+(ideas?|options?|suggestions?)\b/,
    confidence: 0.78,
    reason: "Asks for theme inspiration.",
  },
];

const NAV_PATTERNS: HeuristicPattern[] = [
  {
    regex: /^(go|open|navigate|take|bring|show|switch|return)\b/,
    confidence: 0.85,
    reason: "Starts with a navigation verb.",
  },
  {
    regex:
      /\b(go|open|navigate|take|bring|show|switch)\b[^.?!]*(page|tab|view|screen|section|area)\b/,
    confidence: 0.82,
    reason: "Navigation verb paired with a destination surface.",
  },
];

const GENERATE_PATTERNS: HeuristicPattern[] = [
  {
    regex:
      /\b(create|generate|write|draft|compose|craft|produce|build|spin\s*up|brainstorm|whip\s*up)\b[^.?!]*(post|caption|message|update|announcement|story|bio|tagline|blurb|copy|comment|reply|thread|tweet|outline|script|plan|pitch|summary)\b/,
    confidence: 0.88,
    reason: "Requests AI to create written content.",
    guard: /\b(post|publish|share)\s+(?:this|that|the|my)\b/,
  },
  {
    regex:
      /\b(create|generate|design|make|render|draw|illustrate|produce)\b[^.?!]*(image|photo|picture|graphic|art|poster|banner|thumbnail|visual|logo|icon)\b/,
    confidence: 0.9,
    reason: "Requests AI to create a visual asset.",
  },
  {
    regex:
      /\b(create|generate|make|produce|edit|cut)\b[^.?!]*(video|clip|reel|short|story|animation|montage)\b/,
    confidence: 0.87,
    reason: "Requests AI to create or edit a video.",
  },
  {
    regex:
      /\b(create|generate|draft|build|make|set\s*up|plan)\b[^.?!]*(poll|survey|questionnaire|vote|ballot|quiz)\b/,
    confidence: 0.88,
    reason: "Requests AI to create an interactive poll or survey.",
  },
  {
    regex: /\b(summarize|summarise|summary|recap|tl;dr|tldr|tl-dr|digest|synopsis)\b/,
    confidence: 0.86,
    reason: "Asks AI to summarize content.",
  },
  {
    regex:
      /\b(create|generate|draft|write|build)\b[^.?!]*(pdf|deck|slides?|presentation|whitepaper|document|report|proposal|brief)\b/,
    confidence: 0.85,
    reason: "Requests AI to create a document or deck.",
  },
];

function scoreIntent(
  intent: PromptIntent,
  confidence: number,
  reason: string,
  source: IntentSource,
): IntentResolution {
  return {
    intent,
    confidence: Math.max(0, Math.min(1, confidence)),
    reason,
    source,
  };
}

function matchPattern(patterns: HeuristicPattern[], text: string): HeuristicPattern | null {
  let best: HeuristicPattern | null = null;
  for (const pattern of patterns) {
    if (pattern.guard && pattern.guard.test(text)) continue;
    if (!pattern.regex.test(text)) continue;
    if (!best || pattern.confidence > best.confidence) {
      best = pattern;
    }
  }
  return best;
}

function detectPostIntent(lc: string): IntentResolution | null {
  const match = matchPattern(POST_PATTERNS, lc);
  if (!match) return null;
  return scoreIntent("post", match.confidence, match.reason, "heuristic");
}

function detectStyleIntent(lc: string): IntentResolution | null {
  const match = matchPattern(STYLE_PATTERNS, lc);
  if (!match) return null;
  return scoreIntent("style", match.confidence, match.reason, "heuristic");
}

function detectNavigationIntent(raw: string, lc: string): IntentResolution | null {
  const target = resolveNavigationTarget(raw);
  if (target) {
    const reason =
      target.kind === "theme"
        ? `Detected request to switch to ${target.label}.`
        : `Detected navigation intent to ${target.label}.`;
    return scoreIntent("navigate", NAVIGATION_TARGET_CONFIDENCE, reason, "heuristic");
  }

  const match = matchPattern(NAV_PATTERNS, lc);
  if (!match) return null;
  return scoreIntent("navigate", match.confidence, match.reason, "heuristic");
}

function detectGenerateIntent(lc: string): IntentResolution | null {
  const match = matchPattern(GENERATE_PATTERNS, lc);
  if (!match) return null;
  return scoreIntent("generate", match.confidence, match.reason, "heuristic");
}

export function detectIntentHeuristically(rawText: string): IntentResolution {
  const text = (rawText || "").trim();
  if (!text) {
    return scoreIntent("post", EMPTY_POST_CONFIDENCE, "Ready when you are.", "heuristic");
  }
  const lc = text.toLowerCase();
  const candidates: IntentResolution[] = [];

  const navIntent = detectNavigationIntent(text, lc);
  if (navIntent) candidates.push(navIntent);

  const styleIntent = detectStyleIntent(lc);
  if (styleIntent) candidates.push(styleIntent);

  const generateIntent = detectGenerateIntent(lc);
  if (generateIntent) candidates.push(generateIntent);

  const postIntent = detectPostIntent(lc);

  const bestAlternative = candidates.length
    ? [...candidates].sort((a, b) => b.confidence - a.confidence)[0]
    : null;

  const postCandidate =
    postIntent ??
    scoreIntent("post", DEFAULT_POST_CONFIDENCE, "Defaulting to post intent.", "heuristic");

  if (
    bestAlternative &&
    bestAlternative.intent !== "post" &&
    bestAlternative.confidence >= STRONG_OVERRIDE_CONFIDENCE &&
    bestAlternative.confidence >= postCandidate.confidence
  ) {
    return bestAlternative;
  }

  return postCandidate;
}

export function normalizeIntent(intent: string | null | undefined): PromptIntent {
  if (intent === "post" || intent === "navigate" || intent === "style") return intent;
  return "generate";
}

export function intentLabel(intent: PromptIntent): string {
  switch (intent) {
    case "post":
      return "Post";
    case "navigate":
      // Use user-facing action label for navigation
      return "Go";
    case "style":
      return "Style";
    default:
      return "Generate";
  }
}
