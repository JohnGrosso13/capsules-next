import "server-only";

import { embedText } from "@/lib/ai/openai";
import type {
  CapsuleHistoryContentBlock,
  CapsuleHistorySection,
  CapsuleHistorySnapshot,
  CapsuleHistoryTimelineEntry,
} from "@/types/capsules";
import {
  upsertMemoryVector,
  queryMemoryVectors,
  type MemoryVectorMatch,
} from "@/services/memories/vector-store";

const DOC_TEXT_LIMIT = 1200;
const TITLE_LIMIT = 160;
const SUMMARY_LIMIT = 800;
const MAX_HIGHLIGHTS = 3;
const MAX_TIMELINE = 4;
const MAX_NEXT_FOCUS = 2;

export type CapsuleKnowledgeDoc = {
  id: string;
  title: string;
  text: string;
  kind: string;
  source: string;
  createdAt?: string | null;
  tags?: string[];
};

export type CapsuleKnowledgeSnippet = {
  id: string;
  title: string | null;
  snippet: string;
  kind: string | null;
  url: string | null;
  createdAt: string | null;
  tags: string[];
  source: string | null;
};

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length ? trimmed : null;
}

function buildTimeframe(section: CapsuleHistorySection): string | null {
  const start = normalizeText(section.timeframe?.start ?? null);
  const end = normalizeText(section.timeframe?.end ?? null);
  if (start && end && start !== end) return `${start} → ${end}`;
  if (start) return start;
  if (end) return end;
  return null;
}

function createSummaryDoc(
  capsuleLabel: string,
  section: CapsuleHistorySection,
  block: CapsuleHistoryContentBlock | null | undefined,
): CapsuleKnowledgeDoc | null {
  if (!block?.text) return null;
  const timeframe = buildTimeframe(section);
  const title = truncate(
    `${capsuleLabel} ${section.title || section.period} summary${timeframe ? ` (${timeframe})` : ""}`,
    TITLE_LIMIT,
  );
  const text = truncate(block.text.trim(), SUMMARY_LIMIT);
  return {
    id: `capsule-history:${section.period}:${block.id}`,
    title,
    text,
    kind: "capsule_history_summary",
    source: "capsule_history",
  };
}

function createHighlightDocs(
  capsuleLabel: string,
  section: CapsuleHistorySection,
  highlights: CapsuleHistoryContentBlock[] | null | undefined,
): CapsuleKnowledgeDoc[] {
  if (!highlights?.length) return [];
  const docs: CapsuleKnowledgeDoc[] = [];
  const timeframe = buildTimeframe(section);
  highlights.slice(0, MAX_HIGHLIGHTS).forEach((block, index) => {
    if (!block?.text) return;
    const label = block.metadata?.title
      ? normalizeText(String(block.metadata.title))
      : null;
    const titleBase = label ?? `${section.title || section.period} highlight #${index + 1}`;
    const title = truncate(
      `${capsuleLabel} ${titleBase}${timeframe ? ` (${timeframe})` : ""}`,
      TITLE_LIMIT,
    );
    docs.push({
      id: `capsule-history:${section.period}:highlight:${block.id}`,
      title,
      text: truncate(block.text.trim(), DOC_TEXT_LIMIT),
      kind: "capsule_history_highlight",
      source: "capsule_history",
    });
  });
  return docs;
}

function createTimelineDocs(
  capsuleLabel: string,
  section: CapsuleHistorySection,
  timeline: CapsuleHistoryTimelineEntry[] | null | undefined,
): CapsuleKnowledgeDoc[] {
  if (!timeline?.length) return [];
  const docs: CapsuleKnowledgeDoc[] = [];
  const timeframe = buildTimeframe(section);
  timeline.slice(0, MAX_TIMELINE).forEach((entry, index) => {
    if (!entry?.text && !entry?.detail) return;
    const title = truncate(
      `${capsuleLabel} timeline event #${index + 1}${timeframe ? ` (${timeframe})` : ""}`,
      TITLE_LIMIT,
    );
    const detailParts = [
      entry.label ? `Event: ${entry.label}` : null,
      entry.timestamp ? `When: ${entry.timestamp}` : null,
      entry.text ?? entry.detail ?? "",
    ]
      .filter(Boolean)
      .map((part) => part as string);
    docs.push({
      id: `capsule-history:${section.period}:timeline:${entry.id}`,
      title,
      text: truncate(detailParts.join("\n"), DOC_TEXT_LIMIT),
      kind: "capsule_history_timeline",
      source: "capsule_history",
    });
  });
  return docs;
}

function createNextFocusDocs(
  capsuleLabel: string,
  section: CapsuleHistorySection,
  blocks: CapsuleHistoryContentBlock[] | null | undefined,
): CapsuleKnowledgeDoc[] {
  if (!blocks?.length) return [];
  const docs: CapsuleKnowledgeDoc[] = [];
  const timeframe = buildTimeframe(section);
  blocks.slice(0, MAX_NEXT_FOCUS).forEach((block, index) => {
    if (!block?.text) return;
    const title = truncate(
      `${capsuleLabel} next focus #${index + 1}${timeframe ? ` (${timeframe})` : ""}`,
      TITLE_LIMIT,
    );
    docs.push({
      id: `capsule-history:${section.period}:next:${block.id}`,
      title,
      text: truncate(block.text.trim(), DOC_TEXT_LIMIT),
      kind: "capsule_history_next_focus",
      source: "capsule_history",
    });
  });
  return docs;
}

function collectDocsFromSection(
  capsuleLabel: string,
  section: CapsuleHistorySection,
): CapsuleKnowledgeDoc[] {
  const docs: CapsuleKnowledgeDoc[] = [];
  const content = section.published ?? section.suggested;
  if (!content) return docs;

  const summaryDoc = createSummaryDoc(capsuleLabel, section, content.summary);
  if (summaryDoc) docs.push(summaryDoc);
  docs.push(...createHighlightDocs(capsuleLabel, section, content.highlights));
  docs.push(...createTimelineDocs(capsuleLabel, section, content.timeline));
  docs.push(...createNextFocusDocs(capsuleLabel, section, content.nextFocus));

  return docs;
}

async function embedAndUpsertDoc(ownerId: string, doc: CapsuleKnowledgeDoc): Promise<void> {
  const embedding = await embedText(doc.text);
  if (!embedding?.length) return;
  const metadata: Record<string, unknown> = {
    source: doc.source,
  };
  if (doc.tags?.length) {
    metadata.tags = doc.tags.slice(0, 10).join(", ");
  }
  if (doc.createdAt) {
    metadata.createdAt = doc.createdAt;
  }
  await upsertMemoryVector({
    id: doc.id,
    ownerId,
    ownerType: "capsule",
    values: embedding,
    kind: doc.kind,
    title: doc.title,
    description: doc.text,
    mediaUrl: null,
    mediaType: null,
    extra: metadata,
  });
}

export async function indexCapsuleHistorySnapshot(
  capsuleId: string,
  snapshot: CapsuleHistorySnapshot,
): Promise<void> {
  const normalizedCapsuleId = normalizeText(capsuleId);
  if (!normalizedCapsuleId) return;
  const capsuleLabel = snapshot.capsuleName
    ? `${snapshot.capsuleName} capsule`
    : `Capsule ${normalizedCapsuleId}`;

  const sections = snapshot.sections ?? [];
  if (!sections.length) return;

  const docs = sections.flatMap((section) => collectDocsFromSection(capsuleLabel, section));
  if (!docs.length) return;

  for (const doc of docs) {
    try {
      await embedAndUpsertDoc(normalizedCapsuleId, doc);
    } catch (error) {
      console.warn("capsule history vector upsert failed", {
        capsuleId: normalizedCapsuleId,
        docId: doc.id,
        error,
      });
    }
  }
}

export async function indexCapsuleKnowledgeDocs(
  capsuleId: string,
  docs: CapsuleKnowledgeDoc[],
): Promise<void> {
  const normalizedCapsuleId = normalizeText(capsuleId);
  if (!normalizedCapsuleId) return;
  for (const doc of docs) {
    if (!doc?.id || !doc.text?.trim()) continue;
    try {
      await embedAndUpsertDoc(normalizedCapsuleId, doc);
    } catch (error) {
      console.warn("capsule knowledge doc upsert failed", {
        capsuleId: normalizedCapsuleId,
        docId: doc.id,
        error,
      });
    }
  }
}

function convertMatchToSnippet(match: MemoryVectorMatch): CapsuleKnowledgeSnippet | null {
  const id = match.id ?? null;
  if (!id) return null;
  const title = match.metadata?.title ?? null;
  const snippet = match.metadata?.description ?? null;
  if (!snippet) return null;
  const tags = match.metadata?.source ? [match.metadata.source as string] : [];
  return {
    id,
    title,
    snippet,
    kind: match.metadata?.kind ?? "capsule_history",
    url: null,
    createdAt: match.metadata?.createdAt
      ? String(match.metadata.createdAt)
      : null,
    tags,
    source: typeof match.metadata?.source === "string" ? match.metadata.source : null,
  };
}

export async function searchCapsuleKnowledgeSnippets(options: {
  capsuleId?: string | null;
  query: string;
  limit?: number;
}): Promise<CapsuleKnowledgeSnippet[]> {
  const capsuleId = normalizeText(options.capsuleId ?? null);
  const query = normalizeText(options.query ?? null);
  if (!capsuleId || !query) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 4, 12));
  let embedding: number[] | null = null;
  try {
    embedding = await embedText(query);
  } catch (error) {
    console.warn("capsule knowledge search embedding failed", error);
  }
  if (!embedding?.length) return [];

  let matches: MemoryVectorMatch[] = [];
  try {
    matches = await queryMemoryVectors(capsuleId, embedding, Math.max(limit * 2, limit), "capsule");
  } catch (error) {
    console.warn("capsule knowledge vector query failed", { capsuleId, error });
  }
  if (!matches.length) return [];

  const snippets = matches
    .map((match) => convertMatchToSnippet(match))
    .filter((snippet): snippet is CapsuleKnowledgeSnippet => Boolean(snippet))
    .slice(0, limit);

  return snippets;
}

export { searchCapsuleKnowledgeSnippets as searchCapsuleHistorySnippets };
