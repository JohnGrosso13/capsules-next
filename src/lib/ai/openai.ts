import { serverEnv } from "../env/server";

const DEFAULT_EMBED_MODEL = "text-embedding-3-large";

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
  if (!serverEnv.OPENAI_API_KEY) return null;
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
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as {
    data?: Array<{ embedding: number[] }>;
  } | null;
  if (!response.ok) {
    console.error("OpenAI embedding error", json);
    return null;
  }
  const embedding = json?.data?.[0]?.embedding;
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

export async function summarizeMemory(input: MemorySummaryInput): Promise<MemorySummaryResult | null> {
  if (!serverEnv.OPENAI_API_KEY) return null;
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 220,
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
      }),
    });

    const raw = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!response.ok || !raw) {
      console.warn("summarizeMemory error", raw);
      return null;
    }
    const payload = raw.choices?.[0]?.message?.content;
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
      month: typeof timeRaw.month === "number" && Number.isFinite(timeRaw.month) ? timeRaw.month : null,
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
  if (!serverEnv.OPENAI_API_KEY) return null;
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serverEnv.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 180,
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
      }),
    });
    const json = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
    } | null;
    if (!response.ok) {
      console.error("OpenAI caption error", json);
      return null;
    }
    const text = json?.choices?.[0]?.message?.content?.trim() ?? null;
    return text && text.length ? text : null;
  } catch (error) {
    console.error("captionImage error", error);
    return null;
  }
}
