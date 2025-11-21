import { hasOpenAIApiKey, postOpenAIJson } from "@/adapters/ai/openai/server";
import { serverEnv } from "../env/server";

const DEFAULT_EMBED_MODEL = "text-embedding-3-large";

const RESPONSES_COMPLETION_PREFIXES = ["gpt-5", "gpt-4.1", "o1", "o3", "o4"];

function shouldUseCompletionTokenKey(model: string | null | undefined): boolean {
  if (typeof model !== "string") return false;
  const normalized = model.trim().toLowerCase();
  if (!normalized.length) return false;
  return RESPONSES_COMPLETION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function buildCompletionTokenLimit(model: string | null | undefined, limit: number) {
  const key = shouldUseCompletionTokenKey(model) ? "max_completion_tokens" : "max_tokens";
  return { [key]: limit };
}

function normalizeEmbedModel(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : DEFAULT_EMBED_MODEL;
}

function inferEmbeddingDimensions(model: string): number | null {
  const normalized = model.toLowerCase();
  if (normalized.includes("text-embedding-3-large")) return 3072;
  if (normalized.includes("text-embedding-3-small")) return 1536;
  if (normalized.includes("text-embedding-ada-002")) return 1536;
  if (normalized.includes("gpt-4o-mini-embed")) return 1536;
  return null;
}

const EMBEDDING_CONFIG = (() => {
  const model = normalizeEmbedModel(serverEnv.OPENAI_EMBED_MODEL);
  const explicit =
    typeof serverEnv.OPENAI_EMBED_DIM === "number" && Number.isFinite(serverEnv.OPENAI_EMBED_DIM)
      ? serverEnv.OPENAI_EMBED_DIM
      : null;
  const inferred = inferEmbeddingDimensions(model);
  return {
    model,
    dimensions: explicit ?? inferred ?? null,
  } as const;
})();

export function getEmbeddingModelConfig() {
  return EMBEDDING_CONFIG;
}

export async function embedText(input: string) {
  if (!hasOpenAIApiKey()) return null;
  const text = input.slice(0, 8000);
  if (!text) return null;
  const { model, dimensions } = EMBEDDING_CONFIG;
  const body: Record<string, unknown> = {
    model,
    input: text,
    encoding_format: "float",
  };
  if (dimensions && Number.isFinite(dimensions)) {
    body.dimensions = dimensions;
  }
  const result = await postOpenAIJson<{ data?: Array<{ embedding: number[] }> }>(
    "/embeddings",
    body,
  );
  if (!result.ok) {
    console.error("OpenAI embedding error", result.parsedBody);
    return null;
  }
  const embedding = result.data?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) return null;
  if (dimensions && embedding.length !== dimensions) {
    console.warn(
      "Embedding dimension mismatch from OpenAI",
      embedding.length,
      "expected",
      dimensions,
    );
  }
  return embedding;
}

export type MemorySummaryInput = {
  text: string;
  title?: string | null;
  kind?: string | null;
  source?: string | null;
  mediaType?: string | null;
  hasMedia?: boolean;
  timestamp?: string | null;
  tags?: string[] | null;
};

export type MemorySummaryResult = {
  summary: string;
  title?: string | null;
  tags: string[];
  entities: Record<string, string[]>;
  timeHints: {
    isoDate?: string | null;
    year?: number | null;
    month?: number | null;
    holiday?: string | null;
    relative?: string | null;
  };
};

function sanitizeStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.replace(/\s+/g, " ").trim();
    if (!normalized) continue;
    results.push(normalized.slice(0, limit));
    if (results.length >= 24) break;
  }
  return results;
}

export async function summarizeMemory(
  input: MemorySummaryInput,
): Promise<MemorySummaryResult | null> {
  const devSummariesFlag = process.env.ENABLE_MEMORY_SUMMARIES ?? null;
  if (process.env.NODE_ENV !== "production" && devSummariesFlag === "false") {
    return null;
  }
  if (!hasOpenAIApiKey()) return null;
  const text = input.text?.trim();
  if (!text) return null;

  const contextParts: string[] = [];
  if (input.kind) contextParts.push(`kind: ${input.kind}`);
  if (input.source) contextParts.push(`source: ${input.source}`);
  if (input.mediaType) contextParts.push(`media: ${input.mediaType}`);
  if (input.hasMedia) contextParts.push("hasMedia: true");
  if (input.timestamp) contextParts.push(`timestamp: ${input.timestamp}`);
  if (input.tags?.length) contextParts.push(`tags: ${input.tags.join(", ")}`);

  try {
    const model = serverEnv.OPENAI_MODEL || "gpt-4o-mini";
    const tokenLimit = buildCompletionTokenLimit(model, 220);
    const result = await postOpenAIJson<{
      choices?: Array<{ message?: { content?: string } }>;
    }>("/chat/completions", {
      model,
      temperature: 0.35,
      ...tokenLimit,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You summarize user memories for fast recall.",
            "Return JSON with summary, title, tags, entities, time_hints.",
            "summary: 1-2 vivid sentences (<= 220 chars).",
            "title: optional catchy label (<= 60 chars).",
            "tags: 4-8 short search cues (lowercase).",
            "entities: object of string arrays (people, places, objects, colors, topics, animals, events).",
            "time_hints: include iso_date (YYYY-MM-DD if known), year, month, holiday, relative (e.g. 'last week').",
            "Never invent facts beyond the provided text.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            input.title ? `title: ${input.title}` : null,
            contextParts.length ? `context: ${contextParts.join(" | ")}` : null,
            "content:",
            text,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    if (!result.ok || !result.data) {
      console.warn("summarizeMemory error", result.parsedBody);
      return null;
    }
    const payload = result.data.choices?.[0]?.message?.content;
    if (!payload) return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(payload) as Record<string, unknown>;
    } catch (error) {
      console.warn("summarizeMemory parse error", error);
      return null;
    }
    const summaryRaw = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    if (!summaryRaw) return null;
    const titleRaw = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const tags = sanitizeStringArray(parsed.tags, 48);
    const entitiesRaw = (parsed.entities as Record<string, unknown> | undefined) ?? {};
    const entities: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(entitiesRaw)) {
      const sanitized = sanitizeStringArray(value, 72);
      if (sanitized.length) {
        entities[key] = sanitized;
      }
    }
    const timeRaw = (parsed.time_hints as Record<string, unknown> | undefined) ?? {};
    const timeHints = {
      isoDate:
        typeof timeRaw.iso_date === "string" && timeRaw.iso_date.trim().length
          ? timeRaw.iso_date.trim()
          : null,
      year: typeof timeRaw.year === "number" && Number.isFinite(timeRaw.year) ? timeRaw.year : null,
      month:
        typeof timeRaw.month === "number" && Number.isFinite(timeRaw.month) ? timeRaw.month : null,
      holiday:
        typeof timeRaw.holiday === "string" && timeRaw.holiday.trim().length
          ? timeRaw.holiday.trim()
          : null,
      relative:
        typeof timeRaw.relative === "string" && timeRaw.relative.trim().length
          ? timeRaw.relative.trim()
          : null,
    } as const;

    return {
      summary: summaryRaw.slice(0, 360),
      title: titleRaw ? titleRaw.slice(0, 64) : null,
      tags,
      entities,
      timeHints,
    };
  } catch (error) {
    console.error("summarizeMemory request failed", error);
    return null;
  }
}

// Generate a compact caption and salient tags for an image URL.
// Used to enrich vector memory for natural language recall of images.
function resolveCaptionUrl(raw: string): string | null {
  const source = typeof raw === "string" ? raw.trim() : "";
  if (!source) return null;
  if (source.startsWith("data:") || source.startsWith("blob:")) return null;

  try {
    const direct = new URL(source);
    if (direct.protocol === "http:" || direct.protocol === "https:") {
      return direct.toString();
    }
    return null;
  } catch {
    // fall through to relative handling
  }

  if (source.startsWith("//")) {
    return resolveCaptionUrl(`https:${source}`);
  }

  try {
    const base = serverEnv.SITE_URL || "";
    if (!base) return null;
    return new URL(source, `${base}/`).toString();
  } catch {
    return null;
  }
}

export async function captionImage(url: string): Promise<string | null> {
  if (!hasOpenAIApiKey()) return null;
  const resolvedUrl = resolveCaptionUrl(url);
  if (!resolvedUrl) return null;
  try {
    const normalized = resolvedUrl.toLowerCase();
    if (
      normalized.includes("media.local.example") ||
      normalized.startsWith("http://localhost") ||
      normalized.startsWith("https://localhost")
    ) {
      return null;
    }
  } catch {
    // ignore URL parse errors
  }
  try {
    const model = serverEnv.OPENAI_MODEL || "gpt-4o-mini";
    const tokenLimit = buildCompletionTokenLimit(model, 180);
    const result = await postOpenAIJson<{
      choices?: Array<{ message?: { content?: string } }>;
    }>("/chat/completions", {
      model,
      temperature: 0.2,
      ...tokenLimit,
      messages: [
        {
          role: "system",
          content:
            "You write short search-friendly photo captions. Output one sentence followed by 6-10 comma-separated tags in [brackets]. Mention clothing, colors, objects, places, season/holiday cues if present.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Describe this image for later semantic search:" },
            { type: "image_url", image_url: { url: resolvedUrl } },
          ],
        },
      ],
    });
    if (!result.ok || !result.data) {
      console.error("OpenAI caption error", result.parsedBody);
      return null;
    }
    const text = result.data.choices?.[0]?.message?.content?.trim() ?? null;
    return text && text.length ? text : null;
  } catch (error) {
    console.error("captionImage error", error);
    return null;
  }
}

export async function captionVideo(
  url: string | null | undefined,
  thumbnailUrl?: string | null | undefined,
): Promise<string | null> {
  const thumb = typeof thumbnailUrl === "string" && thumbnailUrl.trim().length ? thumbnailUrl : null;
  if (thumb) {
    const caption = await captionImage(thumb);
    if (caption) return caption;
  }
  const targetUrl = typeof url === "string" && url.trim().length ? url : null;
  if (!targetUrl) return null;
  return captionImage(targetUrl);
}
