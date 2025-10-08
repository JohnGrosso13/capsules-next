import { validatedJson, parseJsonBody } from "@/server/validation/http";
import { z } from "zod";

const requestSchema = z.object({
  message: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
  post: z.record(z.string(), z.unknown()).optional(),
});

const responseSchema = z.object({
  action: z.literal("draft_post"),
  message: z.string().optional(),
  post: z.record(z.string(), z.unknown()),
  choices: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
});

export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, requestSchema);
  if (!parsed.success) return parsed.response;

  const { message, options } = parsed.data;
  const lower = message.toLowerCase();

  const prefer =
    typeof options?.["prefer"] === "string" ? String(options["prefer"]).toLowerCase() : null;

  let kind: string = "text";
  if (prefer === "poll" || /\b(poll|survey|vote|choices?)\b/.test(lower)) kind = "poll";
  else if (/\b(image|photo|picture|graphic|illustration)\b/.test(lower)) kind = "image";
  else if (/\b(video|clip|reel|short|trailer)\b/.test(lower)) kind = "video";

  const draftBase = {
    kind,
    title: null,
    content: kind === "text" ? suggestCaption(lower) : "",
    media_url: kind === "image" || kind === "video" ? "" : null,
    media_prompt: kind === "image" || kind === "video" ? inferMediaPrompt(lower) : null,
    poll: kind === "poll" ? { question: inferPollQuestion(lower), options: ["Yes", "No"] } : null,
    suggestions: suggestAlternates(lower),
    source: "ai-prompter",
  } as Record<string, unknown>;

  const response = {
    action: "draft_post" as const,
    message: summarizeDraft(lower, kind),
    post: draftBase,
    choices: undefined as { key: string; label: string }[] | undefined,
  };

  return validatedJson(responseSchema, response);
}

function suggestCaption(text: string): string {
  const cleaned = text
    .replace(
      /^(make|draft|write|compose|generate)\s+(me\s+)?(a\s+)?(social\s+)?post\s*(about|on)?\s*/i,
      "",
    )
    .trim();
  if (cleaned) return capitalize(cleaned);
  return "Sharing a quick update with my capsule!";
}

function inferMediaPrompt(text: string): string | null {
  const m = text.match(/(?:of|about)\s+(.+)$/i);
  return m ? capitalize(m[1]).slice(0, 200) : null;
}

function inferPollQuestion(text: string): string {
  const m = text.match(/(?:about|on)\s+(.+)$/i);
  return m ? `What do you think about ${m[1]}?` : "What do you think?";
}

function suggestAlternates(text: string): string[] {
  const base = [
    "Make it more concise",
    "Add emojis and a question",
    "Give it a professional tone",
    "Turn this into a thread",
  ];
  if (/\blaunch|drop|release\b/.test(text)) base.unshift("Add a call to action");
  return base;
}

function summarizeDraft(text: string, kind: string): string {
  const noun = kind === "text" ? "post" : kind;
  return `Drafted a ${noun} based on your prompt.`;
}

function capitalize(value: string | null | undefined): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const runtime = "edge";
