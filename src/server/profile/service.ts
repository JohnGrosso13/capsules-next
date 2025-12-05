import { resolveSupabaseUserId } from "@/lib/supabase/users";
import { getUserProfileSummary } from "@/server/users/service";
import {
  getFollowStatsSummary,
  getViewerFollowState,
  getViewerFriendState,
  type ViewerFriendState,
} from "@/server/friends/service";
import { getUserCapsules } from "@/server/capsules/service";
import type { CapsuleSummary } from "@/server/capsules/repository";
import { queryPosts, PostsQueryError } from "@/server/posts/services/posts-query";
import type { FeedPost } from "@/domain/feed";
import { listMemories } from "@/server/memories/service";
import { listLaddersByParticipant } from "@/server/ladders/repository";
import type { CapsuleLadderSummary, CapsuleLadderMember, LadderStatus } from "@/types/ladders";
import { PROFILE_SELF_ALIAS, looksLikeProfileId } from "@/lib/profile/routes";
import { getProfilePrivacySettings } from "@/server/profile/privacy";

export type ProfileClip = {
  id: string;
  title: string | null;
  description: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  postId: string | null;
};

export type ProfileEvent = {
  id: string;
  name: string;
  status: LadderStatus;
  summary: string | null;
  capsule: {
    id: string;
    name: string;
    slug: string | null;
  };
  stats: {
    wins: number | null;
    losses: number | null;
    streak: number | null;
  };
  startedAt: string | null;
};

export type ProfilePageData = {
  user: {
    id: string;
    key: string | null;
    name: string | null;
    avatarUrl: string | null;
    bio: string | null;
    joinedAt: string | null;
  };
  stats: {
    followers: number;
    following: number;
    spacesOwned: number;
  };
  spaces: CapsuleSummary[];
  posts: {
    recent: FeedPost[];
    top: FeedPost[];
  };
  clips: ProfileClip[];
  events: ProfileEvent[];
  featuredStore: CapsuleSummary | null;
  privacy: {
    statsVisibility: "public" | "private";
  };
  viewer: {
    id: string | null;
    isSelf: boolean;
    follow: {
      isFollowing: boolean;
      canFollow: boolean;
    };
    friend: ViewerFriendState;
    inviteOptions: CapsuleSummary[];
  };
};

function normalizeIdentifier(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function resolveProfileUserId(params: {
  identifier: string;
  viewerId: string | null;
}): Promise<string> {
  const decoded = normalizeIdentifier(params.identifier);
  if (decoded === PROFILE_SELF_ALIAS) {
    if (!params.viewerId) {
      throw new Error("profile.resolve: sign in to view your profile.");
    }
    return params.viewerId;
  }
  if (looksLikeProfileId(decoded)) {
    return decoded;
  }
  // Non-UUID identifiers should be treated as user keys (e.g., Clerk ids, aliases)
  const resolved = await resolveSupabaseUserId({ userKey: decoded }, { allowAlias: false });
  if (!resolved) {
    throw new Error("profile.resolve: user not found");
  }
  return resolved.userId;
}

function mapClips(rows: Record<string, unknown>[], limit: number): ProfileClip[] {
  const clips: ProfileClip[] = [];
  for (const row of rows) {
    const mediaType =
      typeof row.media_type === "string"
        ? row.media_type
        : typeof row.mediaType === "string"
          ? row.mediaType
          : null;
    const postId =
      typeof row.post_id === "string"
        ? row.post_id
        : typeof row.postId === "string"
          ? row.postId
          : null;
    if (!mediaType || !mediaType.toLowerCase().startsWith("video/")) continue;
    if (!postId) continue;
    const id =
      typeof row.id === "string"
        ? row.id
        : typeof row.id === "number"
          ? String(row.id)
          : null;
    if (!id) continue;
    if (clips.length >= limit) break;
    const meta = (row.meta ?? null) as Record<string, unknown> | null;
    const thumbnail =
      typeof meta?.thumbnail_url === "string"
        ? meta.thumbnail_url
        : typeof meta?.thumbnailUrl === "string"
          ? meta.thumbnailUrl
          : null;
    clips.push({
      id,
      title:
        typeof row.title === "string"
          ? row.title
          : typeof meta?.title === "string"
            ? meta.title
            : null,
      description:
        typeof row.description === "string"
          ? row.description
          : typeof meta?.description === "string"
            ? meta.description
            : null,
      mediaUrl:
        typeof row.media_url === "string"
          ? row.media_url
          : typeof row.mediaUrl === "string"
            ? row.mediaUrl
            : null,
      thumbnailUrl: thumbnail,
      createdAt:
        typeof row.created_at === "string"
          ? row.created_at
          : typeof row.createdAt === "string"
            ? row.createdAt
            : null,
      postId,
    });
  }
  return clips;
}

function mapEvents(
  participation: Array<{ ladder: CapsuleLadderSummary; membership: CapsuleLadderMember }>,
  limit: number,
): ProfileEvent[] {
  const events: ProfileEvent[] = [];
  for (const entry of participation) {
    if (!entry?.ladder || !entry.membership) continue;
    if (events.length >= limit) break;
    events.push({
      id: entry.ladder.id,
      name: entry.ladder.name,
      status: entry.ladder.status,
      summary: entry.ladder.summary ?? null,
      capsule: {
        id: entry.ladder.capsuleId ?? entry.ladder.id,
        name: entry.ladder.name,
        slug: entry.ladder.slug ?? null,
      },
      stats: {
        wins: entry.membership.wins,
        losses: entry.membership.losses,
        streak: entry.membership.streak,
      },
      startedAt: entry.ladder.publishedAt ?? entry.ladder.createdAt ?? null,
    });
  }
  return events;
}

export async function loadProfilePageData(params: {
  viewerId: string | null;
  targetUserId: string;
  origin?: string | null;
}): Promise<ProfilePageData> {
  const { viewerId, targetUserId, origin } = params;
  const normalizedOrigin = origin ?? null;
  const [profile, followStats, viewerFollow, viewerFriend, targetCapsules, privacySettings] = await Promise.all([
    getUserProfileSummary(targetUserId, { origin: normalizedOrigin }),
    getFollowStatsSummary(targetUserId),
    getViewerFollowState(viewerId, targetUserId),
    getViewerFriendState(viewerId, targetUserId),
    getUserCapsules(targetUserId, { origin: normalizedOrigin }),
    getProfilePrivacySettings(targetUserId),
  ]);

  const ownedSpaces = targetCapsules.filter((capsule) => capsule.ownership === "owner");

  const [recentPosts, topPosts] = await Promise.all([
    safeQueryPosts({
      viewerId,
      origin: normalizedOrigin,
      query: { limit: 6, authorId: targetUserId, sort: "recent" },
    }),
    safeQueryPosts({
      viewerId,
      origin: normalizedOrigin,
      query: { limit: 6, authorId: targetUserId, sort: "top" },
    }),
  ]);

  const [memoryRows, ladderParticipation, viewerCapsules] = await Promise.all([
    listMemories({ ownerId: targetUserId, origin: normalizedOrigin }),
    listLaddersByParticipant(targetUserId, { limit: 12 }),
    viewerId ? getUserCapsules(viewerId, { origin: normalizedOrigin }) : Promise.resolve([]),
  ]);

  const clips = Array.isArray(memoryRows) ? mapClips(memoryRows as Record<string, unknown>[], 6) : [];
  const events = mapEvents(ladderParticipation, 8);

  return {
    user: {
      id: profile.id,
      key: profile.key ?? null,
      name: profile.name ?? null,
      avatarUrl: profile.avatarUrl ?? null,
      bio: profile.bio ?? null,
      joinedAt: profile.joinedAt ?? null,
    },
    stats: {
      followers: followStats.followers,
      following: followStats.following,
      spacesOwned: ownedSpaces.length,
    },
    spaces: ownedSpaces,
    posts: {
      recent: recentPosts,
      top: topPosts,
    },
    clips,
    events,
    featuredStore: ownedSpaces[0] ?? null,
    privacy: privacySettings,
    viewer: {
      id: viewerId,
      isSelf: Boolean(viewerId && viewerId === targetUserId),
      follow: viewerFollow,
      friend: viewerFriend,
      inviteOptions: (viewerCapsules ?? []).filter((capsule) => capsule.ownership === "owner"),
    },
  };
}

async function safeQueryPosts(input: Parameters<typeof queryPosts>[0]): Promise<FeedPost[]> {
  try {
    const result = await queryPosts({ ...input, origin: input.origin ?? null });
    return (result.posts as FeedPost[]) ?? [];
  } catch (error) {
    if (error instanceof PostsQueryError) {
      console.warn("profile.posts.fetch_failed", { code: error.code, status: error.status });
    } else {
      console.warn("profile.posts.fetch_failed", error);
    }
    return [];
  }
}
