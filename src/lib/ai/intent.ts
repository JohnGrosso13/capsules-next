export type PromptIntent = "generate" | "post" | "navigate" | "style";

export type IntentSource = "none" | "heuristic" | "ai";

export type IntentResolution = {
  intent: PromptIntent;
  confidence: number;
  reason?: string;
  source: IntentSource;
};

const baseResult: IntentResolution = { intent: "generate", confidence: 0.2, source: "none" };

type Pattern = { regex: RegExp; confidence: number; reason: string };

type StylePattern = Pattern & { guard?: RegExp };

function scoreIntent(intent: PromptIntent, confidence: number, reason: string, source: IntentSource): IntentResolution {
  return {
    intent,
    confidence: Math.max(0, Math.min(1, confidence)),
    reason,
    source,
  };
}

const STYLE_PATTERNS: StylePattern[] = [
  {
    regex: /(make|set|change|turn|paint|color|colour)\b[^.]*\b(friends?|chats?|requests?|buttons?|tiles?|cards?|rails?)\b[^.]*\b(color|colour|theme|palette|white|black|red|blue|green|purple|pink|teal|orange|yellow|cyan|magenta|indigo|violet|halloween|winter|summer|spring|fall)\b/,
    confidence: 0.84,
    reason: "Detected styling verbs targeting UI surfaces.",
  },
  {
    regex: /\b(theme|palette|styler|style up|restyle|recolor|skin)\b/,
    guard: /(post|publish|share|navigate)/,
    confidence: 0.78,
    reason: "Mentions theme or styling keywords.",
  },
  {
    regex: /(apply|use)\b[^.]*\b(theme|colors?|palette)\b/,
    confidence: 0.75,
    reason: "Asks to apply a theme or palette.",
  },
];

const POST_PATTERNS: Pattern[] = [
  { regex: /^post\b/, confidence: 0.95, reason: "Starts with 'post'" },
  { regex: /\bpost(\s+(a|the|my))?\b/, confidence: 0.85, reason: "Mentions posting" },
  { regex: /(share|publish|announce|send)\b.*\b(post|message|update)/, confidence: 0.8, reason: "Share/publish verbs" },
  { regex: /(draft|write)\b.*\b(post|message)/, confidence: 0.75, reason: "Draft/write message" },
];

const NAV_PATTERNS: Pattern[] = [
  { regex: /^(go|open|navigate|launch|take me|show me)\b/, confidence: 0.92, reason: "Starts with navigation verb" },
  { regex: /(go|navigate)\s+(back|home|to\s+home|to\s+the\s+home)/, confidence: 0.88, reason: "Navigate home" },
  { regex: /(go|open|take me|bring me|navigate)\s+(to\s+)?(create|capsule|memory|settings|friends|feed|landing|discover|profile|admin)/, confidence: 0.82, reason: "Navigate to named surface" },
  { regex: /\bopen\s+(the\s+)?capsule\b/, confidence: 0.8, reason: "Open capsule" },
  { regex: /(switch|change|set|turn)\s+(to\s+)?(dark|light)\s+(mode|theme)/, confidence: 0.86, reason: "Toggle theme" },
];

export function detectIntentHeuristically(rawText: string): IntentResolution {
  const text = (rawText || "").trim();
  if (!text) {
    return baseResult;
  }
  const lc = text.toLowerCase();

  for (const pattern of STYLE_PATTERNS) {
    if (pattern.guard && pattern.guard.test(lc)) continue;
    if (pattern.regex.test(lc)) {
      return scoreIntent("style", pattern.confidence, pattern.reason, "heuristic");
    }
  }

  for (const pattern of POST_PATTERNS) {
    if (pattern.regex.test(lc)) {
      return scoreIntent("post", pattern.confidence, pattern.reason, "heuristic");
    }
  }
  for (const pattern of NAV_PATTERNS) {
    if (pattern.regex.test(lc)) {
      return scoreIntent("navigate", pattern.confidence, pattern.reason, "heuristic");
    }
  }

  if (/\b(post|publish|share|navigate|go|open|take|switch|change)\b/.test(lc)) {
    return scoreIntent("generate", 0.45, "Contains action verbs but unclear", "heuristic");
  }

  return { ...baseResult, reason: "Default" };
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
      return "Navigate";
    case "style":
      return "Style";
    default:
      return "Generate";
  }
}
