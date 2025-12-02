import { getDatabaseAdminClient } from "@/config/database";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { listCapsulesForUser } from "@/server/capsules/repository";
import type { GlobalSearchResponse, GlobalSearchSection, UserSearchResult, CapsuleSearchResult } from "@/types/search";

const QUICK_LIMIT = 12;

type QuickSearchParams = {
  ownerId: string;
  query: string;
  limit?: number;
  origin?: string | null;
};

type FriendRow = {
  friend_user_id: string | null;
  created_at?: string | null;
  users: {
    id: string | null;
    full_name: string | null;
    avatar_url: string | null;
    user_key: string | null;
  } | null;
};

function normalizeQuery(value: string): string {
  return value.trim();
}

function buildUserResult(
  row: FriendRow,
  origin: string | null | undefined,
  query: string,
): UserSearchResult | null {
  const profile = row.users;
  const id = profile?.id ?? row.friend_user_id ?? null;
  if (!id) return null;

  const name = profile?.full_name?.trim() || "";
  const key = profile?.user_key?.trim() || null;
  const avatar = resolveToAbsoluteUrl(profile?.avatar_url ?? null, origin ?? null);

  const needle = query.toLowerCase();
  const score =
    needle && name.toLowerCase().startsWith(needle)
      ? 4
      : needle && key && key.toLowerCase().startsWith(needle)
        ? 3
        : 1;

  return {
    type: "user",
    id,
    name: name || key || "Friend",
    avatarUrl: avatar,
    userKey: key,
    relation: "friend",
    url: `/friends?tab=friends&focus=${encodeURIComponent(id)}`,
    highlight: null,
    subtitle: key ? `@${key}` : "Friend",
    relevanceScore: score,
  };
}

function buildCapsuleResult(
  summary: CapsuleSearchResult,
  query: string,
): CapsuleSearchResult & { relevanceScore?: number | null } {
  const needle = query.toLowerCase();
  const score =
    summary.name?.toLowerCase().startsWith(needle) || summary.slug?.toLowerCase().startsWith(needle)
      ? 5
      : summary.name?.toLowerCase().includes(needle) || summary.slug?.toLowerCase().includes(needle)
        ? 3
        : 1;
  return { ...summary, relevanceScore: score };
}

export async function quickSearch({
  ownerId,
  query,
  limit = QUICK_LIMIT,
  origin,
}: QuickSearchParams): Promise<GlobalSearchResponse> {
  const trimmed = normalizeQuery(query);
  const effectiveLimit = Math.max(1, Math.min(limit, QUICK_LIMIT));
  const db = getDatabaseAdminClient();

  let friendQuery = db
    .from("friendships")
    .select<FriendRow>("friend_user_id, created_at, users:friend_user_id(id, full_name, avatar_url, user_key)")
    .eq("user_id", ownerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (trimmed) {
    const pattern = `%${trimmed}%`;
    friendQuery = friendQuery.or(
      `users.full_name.ilike.${pattern},users.user_key.ilike.${pattern}`,
    );
  }

  const friendPromise = friendQuery.fetch();

  const [friendsResult, capsuleSummaries] = await Promise.all([
    friendPromise,
    listCapsulesForUser(ownerId),
  ]);

  const rows = Array.isArray(friendsResult.data) ? (friendsResult.data as FriendRow[]) : [];
  const userResults = rows
    .map((row) => buildUserResult(row, origin, trimmed))
    .filter((item): item is UserSearchResult => item !== null)
    .filter((item) => {
      if (!trimmed) return true;
      const lower = trimmed.toLowerCase();
      return (
        item.name.toLowerCase().includes(lower) ||
        (item.userKey ? item.userKey.toLowerCase().includes(lower) : false)
      );
    })
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, effectiveLimit);

  const capsuleResults = capsuleSummaries
    .map((capsule) => {
      const base: CapsuleSearchResult = {
        type: "capsule",
        id: capsule.id,
        name: capsule.name,
        slug: capsule.slug ?? null,
        ownership: capsule.ownership,
        role: capsule.role ?? null,
        bannerUrl: resolveToAbsoluteUrl(capsule.bannerUrl ?? null, origin ?? null),
        logoUrl: resolveToAbsoluteUrl(capsule.logoUrl ?? null, origin ?? null),
        url: `/capsule?capsuleId=${encodeURIComponent(capsule.id)}`,
        highlight: null,
        subtitle: capsule.slug ? capsule.slug : capsule.role ?? capsule.ownership,
      };
      return buildCapsuleResult(base, trimmed);
    })
    .filter((item) => {
      if (!trimmed) return true;
      const lower = trimmed.toLowerCase();
      return (
        item.name.toLowerCase().includes(lower) ||
        (item.slug ? item.slug.toLowerCase().includes(lower) : false)
      );
    })
    .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
    .slice(0, effectiveLimit);

  const sections: GlobalSearchSection[] = [];
  if (userResults.length) {
    sections.push({ type: "users", items: userResults });
  }
  if (capsuleResults.length) {
    sections.push({ type: "capsules", items: capsuleResults });
  }

  return { query: trimmed, sections };
}
