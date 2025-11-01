import { getDatabaseAdminClient } from "@/config/database";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { listCapsulesForUser } from "@/server/capsules/repository";
import { searchMemories } from "@/server/memories/service";
import type {
  CapsuleSearchResult,
  GlobalSearchResponse,
  GlobalSearchSection,
  MemorySearchResult,
  MemorySearchItem,
  UserSearchResult,
} from "@/types/search";

const USER_SECTION_LIMIT = 6;
const CAPSULE_SECTION_LIMIT = 6;

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
  origin?: string | null;
};

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
        subtitle: subtitleParts.length ? subtitleParts.join(" • ") : null,
        score,
      };
    })
    .filter((entry): entry is CapsuleSearchResult & { score: number } => entry !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    })
    .slice(0, Math.max(1, limit))
    .map(({ score: _score, ...rest }) => rest);

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
    const key = profile?.user_key ?? null;
    const avatar = resolveToAbsoluteUrl(profile?.avatar_url ?? null, origin ?? null);

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
      url: `/friends?tab=friends&focus=${encodeURIComponent(id)}`,
      highlight,
      subtitle: subtitleParts.join(" • "),
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
    .map(({ score: _score, ...rest }) => rest);

  return sorted;
}

function coerceMemoryResults(items: MemorySearchItem[], limit: number): MemorySearchResult[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, Math.max(1, limit)).map((item) => ({
    ...item,
    type: "memory" as const,
  }));
}

export async function globalSearch({
  ownerId,
  query,
  limit,
  origin,
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

  const [memoryItems, capsules, users] = await Promise.all([
    searchMemories({ ownerId, query: trimmed, limit: memoryLimit, origin: origin ?? null }),
    searchCapsulesForUser(ownerId, trimmed, tokens, origin, CAPSULE_SECTION_LIMIT),
    searchFriendsForUser(ownerId, trimmed, tokens, origin, USER_SECTION_LIMIT),
  ]);

  const sections: GlobalSearchSection[] = [];
  if (users.length) {
    sections.push({ type: "users", items: users });
  }
  if (capsules.length) {
    sections.push({ type: "capsules", items: capsules });
  }

  const memoryResults = coerceMemoryResults(memoryItems as MemorySearchItem[], memoryLimit);
  if (memoryResults.length) {
    sections.push({ type: "memories", items: memoryResults });
  }

  return {
    query: trimmed,
    sections,
  };
}
