import { getDatabaseAdminClient } from "@/config/database";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { listCapsulesForUser } from "@/server/capsules/repository";
import { searchMemories } from "@/server/memories/service";
import { searchCapsuleKnowledgeSnippets } from "@/server/capsules/knowledge-index";
import type {
  CapsuleSearchResult,
  GlobalSearchResponse,
  GlobalSearchSection,
  MemorySearchResult,
  MemorySearchItem,
  UserSearchResult,
  CapsuleRecordSearchResult,
} from "@/types/search";
import type { CapsuleKnowledgeSnippet } from "@/server/capsules/knowledge-index";
import {
  fetchStructuredPayloads,
  parseStructuredQuery,
  structuredPayloadToRecords,
  type StructuredRecord,
} from "@/server/capsules/structured";
import { sanitizeUserKey } from "@/lib/users/format";
import { buildProfileHref } from "@/lib/profile/routes";

const USER_SECTION_LIMIT = 6;
const CAPSULE_SECTION_LIMIT = 6;
const EMBED_BUDGET_LIMIT = 8;
const EMBED_BUDGET_WINDOW_MS = 60_000;
const MEMORIES_ENABLED = process.env.SEARCH_DISABLE_MEMORIES !== "true";

const embedBudget = new Map<string, { count: number; resetAt: number }>();

function canUseEmbeddings(ownerId: string): boolean {
  if (!ownerId) return false;
  const now = Date.now();
  const entry = embedBudget.get(ownerId);
  if (!entry || now >= entry.resetAt) {
    embedBudget.set(ownerId, { count: 1, resetAt: now + EMBED_BUDGET_WINDOW_MS });
    return true;
  }
  if (entry.count >= EMBED_BUDGET_LIMIT) {
    return false;
  }
  entry.count += 1;
  embedBudget.set(ownerId, entry);
  return true;
}

type FriendRow = {
  friend_user_id: string | null;
  users: {
    id: string | null;
    full_name: string | null;
    avatar_url: string | null;
    user_key: string | null;
  } | null;
};

type GlobalSearchParams = {
  ownerId: string;
  query: string;
  limit: number;
  capsuleId?: string | null;
  origin?: string | null;
  scopes?: SearchScope[] | null;
};

type SearchScope = "users" | "capsules" | "memories" | "capsule_records";
const DEFAULT_SCOPES: SearchScope[] = ["users", "capsules", "memories", "capsule_records"];

function normalizeQueryTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Highlightable = {
  text: string;
  tokens: string[];
};

function buildHighlight({ text, tokens }: Highlightable): string | null {
  if (!text || !tokens.length) return null;
  const lower = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];

  tokens.forEach((token) => {
    const needle = token.trim().toLowerCase();
    if (!needle.length) return;
    let index = lower.indexOf(needle);
    const guard = 200;
    let attempts = 0;
    while (index !== -1 && attempts < guard) {
      ranges.push({ start: index, end: index + needle.length });
      index = lower.indexOf(needle, index + needle.length);
      attempts += 1;
    }
  });

  if (!ranges.length) return null;
  ranges.sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  ranges.forEach((range) => {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  });

  const parts: string[] = [];
  let cursor = 0;
  merged.forEach((range) => {
    if (range.start > cursor) {
      parts.push(escapeHtml(text.slice(cursor, range.start)));
    }
    const fragment = escapeHtml(text.slice(range.start, range.end));
    parts.push(`<em>${fragment}</em>`);
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push(escapeHtml(text.slice(cursor)));
  }
  return parts.join("");
}

function computeMatchScore(text: string | null, fullNeedle: string, tokens: string[]): number {
  if (!text) return 0;
  const normalized = text.trim().toLowerCase();
  if (!normalized.length) return 0;

  let score = 0;
  if (normalized === fullNeedle) score += 6;
  if (normalized.startsWith(fullNeedle)) score += 4;
  if (normalized.includes(fullNeedle)) score += 3;
  tokens.forEach((token) => {
    if (token && normalized.includes(token)) {
      score += 1;
    }
  });
  return score;
}

async function searchCapsulesForUser(
  ownerId: string,
  query: string,
  tokens: string[],
  origin: string | null | undefined,
  limit: number,
): Promise<CapsuleSearchResult[]> {
  if (!ownerId) return [];
  const summaries = await listCapsulesForUser(ownerId);
  if (!summaries.length) return [];

  const needle = query.toLowerCase();
  const matches = summaries
    .map((capsule) => {
      const score = Math.max(
        computeMatchScore(capsule.name, needle, tokens),
        computeMatchScore(capsule.slug ?? null, needle, tokens) - 1,
      );
      if (score <= 0) return null;

      const highlight = buildHighlight({ text: capsule.name, tokens });
      const subtitleParts: string[] = [];
      if (capsule.slug) subtitleParts.push(capsule.slug);
      if (capsule.ownership === "owner") {
        subtitleParts.push("Owner");
      } else if (capsule.ownership === "follower") {
        subtitleParts.push("Follower");
      } else if (capsule.role) {
        subtitleParts.push(capsule.role);
      }

      return {
        type: "capsule" as const,
        id: capsule.id,
        name: capsule.name,
        slug: capsule.slug ?? null,
        ownership: capsule.ownership,
        role: capsule.role ?? null,
        bannerUrl: resolveToAbsoluteUrl(capsule.bannerUrl ?? null, origin ?? null),
        logoUrl: resolveToAbsoluteUrl(capsule.logoUrl ?? null, origin ?? null),
        url: `/capsule?capsuleId=${encodeURIComponent(capsule.id)}`,
        highlight,
        subtitle: subtitleParts.length ? subtitleParts.join(" | ") : null,
        relevanceScore: score,
      };
    })
    .filter((entry): entry is CapsuleSearchResult & { relevanceScore: number } => entry !== null)
    .sort((a, b) => {
      if ((b.relevanceScore ?? 0) !== (a.relevanceScore ?? 0))
        return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
      return a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(1, limit))
    .map(({ relevanceScore, ...rest }) => ({ ...rest, relevanceScore }));

  return matches;
}

async function searchFriendsForUser(
  ownerId: string,
  query: string,
  tokens: string[],
  origin: string | null | undefined,
  limit: number,
): Promise<UserSearchResult[]> {
  if (!ownerId) return [];
  const db = getDatabaseAdminClient();
  const result = await db
    .from("friendships")
    .select<FriendRow>(
      "friend_user_id, users:friend_user_id(id, full_name, avatar_url, user_key)",
    )
    .eq("user_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(400)
    .fetch();

  const rows = Array.isArray(result.data) ? (result.data as FriendRow[]) : [];
  const needle = query.toLowerCase();
  const seen = new Map<string, UserSearchResult & { score: number }>();

  rows.forEach((row) => {
    const profile = row.users;
    const id = profile?.id ?? row.friend_user_id ?? null;
    if (!id) return;

    const name = profile?.full_name ?? "";
    const key = sanitizeUserKey(profile?.user_key);
    const avatar = resolveToAbsoluteUrl(profile?.avatar_url ?? null, origin ?? null);
    const profileHref =
      buildProfileHref({ userId: id, userKey: key }) ?? `/profile/${encodeURIComponent(key ?? id)}`;

    const nameScore = computeMatchScore(name, needle, tokens);
    const keyScore = computeMatchScore(key, needle, tokens);
    const score = Math.max(nameScore, keyScore);
    if (score <= 0) return;

    const highlightSource = nameScore >= keyScore ? name : key ?? name;
    const highlight = buildHighlight({ text: highlightSource, tokens });

    const subtitleParts: string[] = [];
    if (key) subtitleParts.push(`@${key}`);
    subtitleParts.push("Friend");

    const candidate: UserSearchResult & { score: number } = {
      type: "user",
      id,
      name: name || key || "Friend",
      avatarUrl: avatar,
      userKey: key,
      relation: "friend",
      url: profileHref,
      highlight,
      subtitle: subtitleParts.join(" | "),
      score,
    };

    const existing = seen.get(id);
    if (!existing || existing.score < candidate.score) {
      seen.set(id, candidate);
    }
  });

  const sorted = Array.from(seen.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(1, limit))
    .map(({ score, ...rest }) => ({ ...rest, relevanceScore: score }));

  return sorted;
}

function coerceMemoryResults(items: MemorySearchItem[], limit: number): MemorySearchResult[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, Math.max(1, limit)).map((item) => ({
    ...item,
    relevanceScore: (() => {
      if (typeof item.relevanceScore === "number") return item.relevanceScore;
      const meta = (item.meta ?? {}) as Record<string, unknown>;
      if (typeof meta.search_score === "number") return meta.search_score;
      if (typeof meta.search_highlight === "string") return 3;
      return 1;
    })(),
    post_id:
      typeof item.post_id === "string" && item.post_id.trim().length
        ? item.post_id.trim()
        : typeof item.postId === "string" && item.postId.trim().length
          ? item.postId.trim()
          : null,
    type: "memory" as const,
  }));
}

function mapKnowledgeSnippet(snippet: CapsuleKnowledgeSnippet): MemorySearchItem {
  const meta =
    typeof snippet.source === "string" && snippet.source.trim().length
      ? { source: snippet.source }
      : null;
  return {
    id: snippet.id,
    kind: snippet.kind,
    title: snippet.title ?? "Capsule record",
    description: snippet.snippet,
    created_at: snippet.createdAt ?? null,
    meta,
    relevanceScore: 1,
  };
}

function mapStructuredRecord(record: StructuredRecord): CapsuleRecordSearchResult {
  return {
    id: record.id,
    title: record.title,
    subtitle: record.subtitle,
    detail: record.detail,
    kind: record.kind,
    url: null,
  };
}

export async function globalSearch({
  ownerId,
  query,
  limit,
  capsuleId,
  origin,
  scopes = null,
}: GlobalSearchParams): Promise<GlobalSearchResponse> {
  const trimmed = query.trim();
  if (!trimmed.length) {
    return { query: "", sections: [] };
  }

  const tokens = normalizeQueryTokens(trimmed);
  if (!tokens.length) {
    return { query: trimmed, sections: [] };
  }

  const memoryLimit = Math.max(1, limit);
  const scopeSet = new Set<SearchScope>(scopes && scopes.length ? scopes : DEFAULT_SCOPES);
  const includeUsers = scopeSet.has("users");
  const includeCapsules = scopeSet.has("capsules");
  const includeMemories = MEMORIES_ENABLED && scopeSet.has("memories");
  const includeCapsuleRecords = scopeSet.has("capsule_records");
  const shouldSearchMemories = includeMemories && trimmed.length >= 4;
  const shouldSearchStructured = includeCapsuleRecords && capsuleId && trimmed.length >= 4;

  const allowEmbeddings = shouldSearchMemories && canUseEmbeddings(ownerId);
  if (shouldSearchMemories && !allowEmbeddings) {
    if (process.env.NODE_ENV === "development") {
      console.info("search:skip-memories", { ownerId, reason: "embed-budget" });
    }
  }

  const [memoryItems, capsules, users, capsuleKnowledge] = await Promise.all([
    shouldSearchMemories
      ? searchMemories({
          ownerId,
          query: trimmed,
          limit: memoryLimit,
          origin: origin ?? null,
          useEmbedding: allowEmbeddings,
        })
      : Promise.resolve([]),
    includeCapsules
      ? searchCapsulesForUser(ownerId, trimmed, tokens, origin, CAPSULE_SECTION_LIMIT)
      : Promise.resolve([]),
    includeUsers
      ? searchFriendsForUser(ownerId, trimmed, tokens, origin, USER_SECTION_LIMIT)
      : Promise.resolve([]),
    shouldSearchStructured
      ? searchCapsuleKnowledgeSnippets({
          capsuleId: capsuleId as string,
          query: trimmed,
          limit: memoryLimit,
        })
      : Promise.resolve([]),
  ]);

  let capsuleRecords: CapsuleRecordSearchResult[] = [];
  if (shouldSearchStructured) {
    const structuredIntents = parseStructuredQuery(trimmed);
    if (structuredIntents.length) {
      try {
        const structuredPayloads = await fetchStructuredPayloads({
          capsuleId: capsuleId as string,
          intents: structuredIntents,
        });
        capsuleRecords = structuredPayloads
          .flatMap((payload) => structuredPayloadToRecords(payload))
          .map((record) => mapStructuredRecord(record));
      } catch (error) {
        console.warn("capsule structured search failed", { capsuleId, error });
      }
    }
  }

  const sections: GlobalSearchSection[] = [];
  if (includeUsers && users.length) {
    sections.push({ type: "users", items: users });
  }
  if (includeCapsules && capsules.length) {
    sections.push({ type: "capsules", items: capsules });
  }
  if (includeCapsuleRecords && capsuleRecords.length) {
    sections.push({ type: "capsule_records", items: capsuleRecords });
  }

  const combinedMemoryItems: MemorySearchItem[] = [
    ...(Array.isArray(memoryItems) ? (memoryItems as MemorySearchItem[]) : []),
    ...((capsuleKnowledge as CapsuleKnowledgeSnippet[]).map((snippet) =>
      mapKnowledgeSnippet(snippet),
    ) ?? []),
  ];

  const memoryResults = includeMemories ? coerceMemoryResults(combinedMemoryItems, memoryLimit) : [];
  if (memoryResults.length) {
    sections.push({ type: "memories", items: memoryResults });
  }

  const scoreForSection = (section: GlobalSearchSection): number => {
    if (!section.items.length) return -Infinity;
    switch (section.type) {
      case "users":
      case "capsules":
        return Math.max(
          ...section.items.map((item) => (typeof item.relevanceScore === "number" ? item.relevanceScore : 0)),
        );
      case "memories":
        return Math.max(
          ...section.items.map((item) => (typeof item.relevanceScore === "number" ? item.relevanceScore : 0)),
        );
      case "capsule_records":
        return 0;
      default:
        return 0;
    }
  };

  const orderedSections = sections
    .map((section, index) => ({ section, index, score: scoreForSection(section) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((entry) => entry.section);

  return {
    query: trimmed,
    sections: orderedSections,
  };
}
