import { searchMemories } from "@/lib/supabase/memories";
import { getCapsuleHistory } from "@/server/capsules/service";
import {
  searchCapsuleKnowledgeSnippets,
  type CapsuleKnowledgeSnippet,
} from "@/server/capsules/knowledge-index";
import {
  fetchStructuredPayloads,
  parseStructuredQuery,
  type StructuredPayload,
} from "@/server/capsules/structured";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";
import type {
  CapsuleHistorySection,
  CapsuleHistorySectionContent,
} from "@/types/capsules";

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

async function resolveStructuredSnippets(params: {
  capsuleId?: string | null;
  query: string;
}): Promise<ChatMemorySnippet[]> {
  const capsuleId = normalizeCapsuleId(params.capsuleId ?? null);
  if (!capsuleId) return [];
  const intents = parseStructuredQuery(params.query);
  if (!intents.length) return [];
  try {
    const payloads = await fetchStructuredPayloads({ capsuleId, intents });
    return payloads
      .map((payload, index) => structuredPayloadToSnippet(payload, index))
      .filter((snippet): snippet is ChatMemorySnippet => Boolean(snippet));
  } catch (error) {
    console.warn("structured snippets fetch failed", { capsuleId, error });
    return [];
  }
}

function structuredPayloadToSnippet(
  payload: StructuredPayload,
  index: number,
): ChatMemorySnippet | null {
  switch (payload.kind) {
    case "membership": {
      const roleLine = payload.roleCounts
        .slice(0, 3)
        .map((entry) => `${entry.role}: ${entry.count}`)
        .join(" | ");
      const recentLine =
        payload.recentJoins.length && payload.recentJoins[0]
          ? `Recent joins - ${payload.recentJoins[0].label}: ${payload.recentJoins[0].count}`
          : null;
      const snippetLines = [
        `Members: ${payload.totalMembers}`,
        roleLine ? `Roles: ${roleLine}` : null,
        recentLine,
      ].filter((line): line is string => Boolean(line));
      if (!snippetLines.length) return null;
      return {
        id: `capsule-structured:membership:${index}`,
        title: "Membership stats",
        snippet: snippetLines.join("\n"),
        kind: "capsule_membership_stats",
        url: null,
        createdAt: null,
        tags: ["membership", "structured"],
        source: "capsule_membership",
      };
    }
    case "posts": {
      if (!payload.posts.length) return null;
      const lines = payload.posts
        .slice(0, 4)
        .map((post) => {
          const date = formatShortDate(post.createdAt);
          return `- ${post.author}${date ? ` (${date})` : ""}: ${post.title}`;
        });
      return {
        id: `capsule-structured:posts:${index}`,
        title: payload.filters.author ? `Posts by ${payload.filters.author}` : "Recent posts",
        snippet: lines.join("\n"),
        kind: "capsule_posts_structured",
        url: null,
        createdAt: payload.posts[0]?.createdAt ?? null,
        tags: ["posts", "structured"],
        source: "capsule_post",
      };
    }
    case "files": {
      if (!payload.files.length) return null;
      const lines = payload.files
        .slice(0, 4)
        .map((file) => `- ${file.title}${file.mimeType ? ` (${file.mimeType})` : ""}`);
      return {
        id: `capsule-structured:files:${index}`,
        title: payload.fileType ? `${payload.fileType.toUpperCase()} files` : "Capsule files",
        snippet: lines.join("\n"),
        kind: "capsule_files_structured",
        url: payload.files[0]?.url ?? null,
        createdAt: null,
        tags: ["files", "structured"],
        source: "capsule_asset",
      };
    }
    case "ladder": {
      if (!payload.standings.length) return null;
      const lines = payload.standings
        .slice(0, 5)
        .map(
          (entry, idx) =>
            `${idx + 1}. ${entry.displayName}${
              entry.record ? ` (${entry.record})` : entry.rating ? ` (ELO ${entry.rating})` : ""
            }`,
        );
      return {
        id: `capsule-structured:ladder:${payload.ladder.id}`,
        title: `${payload.ladder.name} standings`,
        snippet: lines.join("\n"),
        kind: "capsule_ladder_results",
        url: null,
        createdAt: payload.ladder.updatedAt ?? payload.ladder.createdAt ?? null,
        tags: ["ladder", "structured"],
        source: "capsule_ladder",
      };
    }
    default:
      return null;
  }
}

function formatShortDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    const [datePart] = date.toISOString().split("T");
    return datePart ?? null;
  }
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
  capsuleId?: string | null;
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

    const snippets = rows
      .map((row) => collectSnippet(row as RawMemoryRow))
      .filter((snippet): snippet is ChatMemorySnippet => Boolean(snippet));

    const structured = await resolveStructuredSnippets({
      capsuleId: params.capsuleId ?? null,
      query,
    });

    const finalSnippets = structured.length ? [...structured, ...snippets] : snippets;

    return {
      query,
      snippets: finalSnippets,
      usedIds: finalSnippets.map((snippet) => snippet.id),
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
  lines.push("Always cite supporting statements using [Memory #n].");

  return lines.join("\n");
}

export function buildContextMetadata(input: ChatContextResult | null) {
  if (!input) return null;
  return compactObject({
    query: input.query,
    memoryIds: input.usedIds,
  });
}

function normalizeCapsuleId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function truncateSnippet(value: string, limit = 800): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 3)}...`;
}

function buildTimeframeLabel(section: CapsuleHistorySection): string | null {
  const { start, end } = section.timeframe ?? {};
  if (start && end && start !== end) return `${start} -> ${end}`;
  if (start) return start;
  if (end) return end;
  return null;
}

function pickContent(section: CapsuleHistorySection): CapsuleHistorySectionContent | null {
  if (section.published) return section.published;
  if (section.suggested) return section.suggested;
  return null;
}

function buildHistorySnippet(
  capsuleId: string,
  capsuleName: string | null,
  section: CapsuleHistorySection,
  content: CapsuleHistorySectionContent,
): ChatMemorySnippet | null {
  const titleParts: string[] = [];
  if (section.title) {
    titleParts.push(section.title);
  } else if (capsuleName) {
    titleParts.push(`${capsuleName} ${section.period} recap`);
  } else {
    titleParts.push(`Capsule ${section.period} recap`);
  }
  const timeframe = buildTimeframeLabel(section);
  if (timeframe) {
    titleParts.push(`(${timeframe})`);
  }

  const summaryText = content.summary?.text?.trim() ?? "";
  const highlightText =
    content.highlights?.find((block) => block?.text?.trim())?.text?.trim() ?? null;
  const timelineEntry =
    content.timeline?.find((entry) => entry?.text?.trim()) ?? null;
  const nextFocusText =
    content.nextFocus?.find((entry) => entry?.text?.trim())?.text?.trim() ?? null;

  const snippetParts: string[] = [];
  if (summaryText) snippetParts.push(summaryText);
  if (highlightText) snippetParts.push(`Highlight: ${highlightText}`);
  if (timelineEntry) {
    const timeLabel = timelineEntry.timestamp ? ` (${timelineEntry.timestamp})` : "";
    snippetParts.push(`Timeline: ${timelineEntry.text ?? timelineEntry.label}${timeLabel}`);
  }
  if (nextFocusText) snippetParts.push(`Next focus: ${nextFocusText}`);

  if (!snippetParts.length) {
    return null;
  }

  const snippet = truncateSnippet(snippetParts.join("\n\n"));
  const idSeed =
    section.timeframe?.start ??
    section.timeframe?.end ??
    section.title ??
    section.period;
  const safeSeed = (idSeed ?? "unknown").replace(/\s+/g, "-").toLowerCase();

  return {
    id: `capsule-history:${capsuleId}:${safeSeed}`,
    title: titleParts.join(" ").trim(),
    snippet,
    kind: "capsule_history",
    url: null,
    createdAt: section.lastEditedAt ?? null,
    tags: [
      `capsule:${capsuleId}`,
      `period:${section.period}`,
      ...(section.templateId ? [`template:${section.templateId}`] : []),
    ],
    source: "capsule_history",
  };
}

function mapCapsuleVectorSnippet(snippet: CapsuleKnowledgeSnippet): ChatMemorySnippet {
  return {
    id: snippet.id,
    title: snippet.title,
    snippet: snippet.snippet,
    kind: snippet.kind,
    url: snippet.url,
    createdAt: snippet.createdAt,
    tags: snippet.tags,
    source: snippet.source,
    highlightHtml: null,
  };
}

async function loadCapsuleSnapshotSnippets(params: {
  capsuleId: string;
  viewerId?: string | null;
  limit: number;
}): Promise<ChatMemorySnippet[]> {
  try {
    const history = await getCapsuleHistory(params.capsuleId, params.viewerId ?? null, {});
    if (!history?.sections?.length) {
      return [];
    }
    const records: ChatMemorySnippet[] = [];
    for (const section of history.sections) {
      if (records.length >= params.limit) break;
      const content = pickContent(section);
      if (!content) continue;
      const snippet = buildHistorySnippet(
        params.capsuleId,
        history.capsuleName ?? null,
        section,
        content,
      );
      if (snippet) {
        records.push(snippet);
      }
    }
    return records;
  } catch (error) {
    console.warn("capsule history context fetch failed", error);
    return [];
  }
}

export async function getCapsuleHistorySnippets(params: {
  capsuleId?: string | null;
  viewerId?: string | null;
  limit?: number;
  query?: string | null;
}): Promise<ChatMemorySnippet[]> {
  const capsuleId = normalizeCapsuleId(params.capsuleId ?? null);
  if (!capsuleId) {
    return [];
  }

  const limit = Math.max(1, Math.min(params.limit ?? 4, 12));
  const query = typeof params.query === "string" ? params.query.trim() : "";

  let vectorSnippets: ChatMemorySnippet[] = [];
  if (query.length) {
    try {
      const matches = await searchCapsuleKnowledgeSnippets({
        capsuleId,
        query,
        limit,
      });
      vectorSnippets = matches.map((snippet) => mapCapsuleVectorSnippet(snippet));
    } catch (error) {
      console.warn("capsule history vector search failed", error);
    }
  }

  const remaining = Math.max(0, limit - vectorSnippets.length);
  if (remaining === 0) {
    return vectorSnippets.slice(0, limit);
  }

  const fallback = await loadCapsuleSnapshotSnippets({
    capsuleId,
    viewerId: params.viewerId ?? null,
    limit: remaining,
  });

  return [...vectorSnippets, ...fallback].slice(0, limit);
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
