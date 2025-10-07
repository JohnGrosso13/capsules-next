import { parseJsonBody, validatedJson } from "@/server/validation/http";
import { z } from "zod";

const requestSchema = z.object({ message: z.string().min(1) });

const responseSchema = z.object({
  intent: z.enum(["generate", "post", "navigate", "style"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional(),
  source: z.enum(["heuristic", "ai", "none"]).optional(),
});

const STYLE_GUARD =
  /(post|publish|share|navigate|go|open|take|launch|switch\s+(to\s+)?(dark|light))/;
const STYLE_PRIMARY = [
  /(make|set|change|turn|paint|color|colour)[^.]*\b(friends?|chats?|requests?|buttons?|tiles?|cards?|rails?)\b[^.]*\b(color|colour|theme|palette|white|black|red|blue|green|purple|pink|teal|orange|yellow|cyan|magenta|indigo|violet|halloween|winter|summer|spring|fall)\b/,
  /\b(theme|palette|styler|restyle|recolor|skin)\b/,
  /(apply|use)[^.]*\b(theme|colors?|palette)\b/,
];

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) return parsed.response;
  const text = parsed.data.message.trim().toLowerCase();

  const style = !STYLE_GUARD.test(text) && STYLE_PRIMARY.some((pattern) => pattern.test(text));
  const nav =
    /(go|open|navigate|take|bring|show|switch|launch|visit)\b/.test(text) ||
    /(home|create|capsule|settings|dark mode|light mode)/.test(text);
  const post =
    /\bpost\b/.test(text) ||
    /(make|draft|write|compose|generate)\s+(me\s+)?(a\s+)?(social\s+)?post/.test(text);

  let intent: "style" | "navigate" | "post" | "generate" = "generate";
  let reason = "Default generate mode.";
  let confidence = 0.3;

  if (style) {
    intent = "style";
    reason = "Detected styling keywords.";
    confidence = 0.72;
  } else if (nav) {
    intent = "navigate";
    reason = "Detected navigation keywords.";
    confidence = 0.7;
  } else if (post) {
    intent = "post";
    reason = "Detected posting keywords.";
    confidence = 0.7;
  }

  return validatedJson(responseSchema, { intent, confidence, reason, source: "ai" });
}

export const runtime = "edge";
