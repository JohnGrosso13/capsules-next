import { searchMemories } from "@/lib/supabase/memories";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";

export type ChatMemorySnippet = {
  id: string;
  title: string | null;
  snippet: string;
  kind: string | null;
  url: string | null;
  createdAt: string | null;
  tags: string[];
  source: string | null;
  highlightHtml?: string | null;
};

export type ChatContextResult = {
  query: string;
  snippets: ChatMemorySnippet[];
  usedIds: string[];
};

const DEFAULT_LIMIT = 6;

type RawMemoryRow = Record<string, unknown>;

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function coerceString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const results: string[] = [];
  for (const entry of value) {
    const text = coerceString(entry);
    if (text) results.push(text);
  }
  return Array.from(new Set(results));
}

function collectSnippet(row: RawMemoryRow): ChatMemorySnippet | null {
  const id = coerceString(row.id);
  if (!id) return null;

  const title = coerceString(row.title);
  const description = coerceString(row.description);
  const kind = coerceString(row.kind);
  const createdAt = coerceString(row.created_at);
  const mediaUrl = coerceString((row.media_url ?? row.mediaUrl) as string | null | undefined);

  const meta = (row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null) ?? {};
  const highlightHtml = coerceString(meta.search_highlight);
  const highlightText = highlightHtml ? stripHtml(highlightHtml) : null;

  const prompt = coerceString(meta.prompt);
  const rawText = coerceString(meta.raw_text ?? meta.original_text);
  const postExcerpt = coerceString(meta.post_excerpt);
  const summaryEntities = meta.summary_entities;

  const snippetCandidates = [
    highlightText,
    description,
    prompt,
    rawText,
    postExcerpt,
    title,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const snippetPrimary = snippetCandidates[0] ?? null;
  const snippet = snippetPrimary ?? `Context from memory ${id}.`;

  const tags = [
    ...coerceStringArray(meta.summary_tags),
    ...coerceStringArray(meta.tags),
  ];

  const source =
    coerceString(meta.source) ??
    coerceString(meta.asset_variant) ??
    coerceString(meta.source_kind) ??
    coerceString(meta.asset_kind) ??
    null;

  const entitySummary = (() => {
    if (!summaryEntities || typeof summaryEntities !== "object") return null;
    const entries = Object.entries(summaryEntities as Record<string, unknown>)
      .map(([entity, raw]) => {
        const labels = coerceStringArray(raw);
        if (!labels.length) return null;
        return `${entity}: ${labels.join(", ")}`;
      })
      .filter(Boolean) as string[];
    return entries.length ? `Entities: ${entries.join(" | ")}` : null;
  })();

  const augmenters = [entitySummary].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const augmentedSnippet = augmenters.length
    ? `${snippet}${snippet.endsWith(".") ? "" : "."} ${augmenters.join(" ")}`
    : snippet;

  return {
    id,
    title,
    snippet: augmentedSnippet,
    kind,
    url: mediaUrl,
    createdAt,
    tags,
    source,
    ...(highlightHtml ? { highlightHtml } : {}),
  };
}

function buildQueryFromHistory(
  latest: string,
  history: ComposerChatMessage[] | undefined,
): string {
  const trimmed = latest.trim();
  if (!history || !history.length) return trimmed;

  const previousUserMessages = history
    .slice()
    .reverse()
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content)
    .filter(
      (content): content is string =>
        typeof content === "string" && content.trim().length > 0,
    )
    .slice(0, 2);

  const merged = [trimmed, ...previousUserMessages].join("\n");
  return merged.length > 2000 ? merged.slice(0, 2000) : merged;
}

export async function getChatContext(params: {
  ownerId: string;
  message: string;
  history?: ComposerChatMessage[];
  limit?: number;
  origin?: string | null;
}): Promise<ChatContextResult | null> {
  const ownerId = coerceString(params.ownerId);
  const message = coerceString(params.message);
  if (!ownerId || !message) return null;

  const query = buildQueryFromHistory(message, params.history);
  if (!query.trim().length) return null;

  const limit = Math.max(1, Math.min(params.limit ?? DEFAULT_LIMIT, 12));

  try {
    const rows = await searchMemories({
      ownerId,
      query,
      limit,
      origin: params.origin ?? null,
    });

    if (!Array.isArray(rows) || !rows.length) {
      return { query, snippets: [], usedIds: [] };
    }

    const snippets = rows
      .map((row) => collectSnippet(row as RawMemoryRow))
      .filter((snippet): snippet is ChatMemorySnippet => Boolean(snippet));

    return {
      query,
      snippets,
      usedIds: snippets.map((snippet) => snippet.id),
    };
  } catch (error) {
    console.warn("chat retrieval failed", error);
    return { query, snippets: [], usedIds: [] };
  }
}

export function formatContextForPrompt(input: ChatContextResult | null): string | null {
  if (!input || !input.snippets.length) return null;
  const lines: string[] = [];
  lines.push("Context memories to ground your response:");
  input.snippets.forEach((snippet, index) => {
    const headerParts = [
      `Memory #${index + 1}`,
      snippet.title ? `title: ${snippet.title}` : null,
      snippet.kind ? `kind: ${snippet.kind}` : null,
      snippet.source ? `source: ${snippet.source}` : null,
      snippet.tags.length ? `tags: ${snippet.tags.join(", ")}` : null,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);
    lines.push(headerParts.join(" | "));
    lines.push(snippet.snippet);
    if (snippet.url) {
      lines.push(`media: ${snippet.url}`);
    }
    lines.push("---");
  });
  lines.push("When useful, cite memories by their Memory # to ground your response.");

  return lines.join("\n");
}

export function buildContextMetadata(input: ChatContextResult | null) {
  if (!input) return null;
  return compactObject({
    query: input.query,
    memoryIds: input.usedIds,
  });
}
function compactObject<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim().length) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    output[key] = value;
  }
  return output;
}
