import { createHash } from "node:crypto";

import type {
  CapsuleHistoryArticle,
  CapsuleHistoryArticleLink,
  CapsuleHistoryContentBlock,
  CapsuleHistoryCoverage,
  CapsuleHistoryPeriod,
  CapsuleHistorySectionContent,
  CapsuleHistorySource,
  CapsuleHistoryTimelineEntry,
} from "@/types/capsules";
export type { CapsuleHistorySectionContent } from "@/types/capsules";

export type CapsuleHistoryPost = {
  id: string;
  kind: string | null;
  content: string;
  createdAt: string | null;
  user: string | null;
  hasMedia: boolean;
};

export type CapsuleHistoryTimeframe = {
  period: CapsuleHistoryPeriod;
  label: string;
  start: string | null;
  end: string | null;
  posts: CapsuleHistoryPost[];
};

export const HISTORY_CONTENT_LIMIT = 320;
export const HISTORY_SUMMARY_LIMIT = 420;
export const HISTORY_LINE_LIMIT = 200;
export const HISTORY_TIMELINE_LIMIT = 24;
export const HISTORY_ARTICLE_LIMIT = 5;
export const HISTORY_ARTICLE_LINK_LIMIT = 8;
export const HISTORY_ARTICLE_TITLE_LIMIT = 180;
export const HISTORY_ARTICLE_PARAGRAPH_LIMIT = 6;
export const HISTORY_ARTICLE_PARAGRAPH_LENGTH = 420;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function sanitizeHistoryContent(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed.length) return "";
  return trimmed.length > HISTORY_CONTENT_LIMIT ? trimmed.slice(0, HISTORY_CONTENT_LIMIT) : trimmed;
}

export function sanitizeHistoryString(value: unknown, limit: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed.length) return null;
  return trimmed.length > limit ? trimmed.slice(0, limit) : trimmed;
}

export function sanitizeHistoryArray(
  value: unknown,
  limit: number,
  itemLimit = HISTORY_LINE_LIMIT,
): string[] {
  if (!Array.isArray(value)) return [];
  const entries: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.replace(/\s+/g, " ").trim();
    if (!trimmed.length) continue;
    entries.push(trimmed.length > itemLimit ? trimmed.slice(0, itemLimit) : trimmed);
    if (entries.length >= limit) break;
  }
  return entries;
}

export function buildHistoryContentId(...parts: Array<string | number | null | undefined>): string {
  const hash = createHash("sha1");
  parts.forEach((part) => {
    hash.update(String(part ?? "-"));
    hash.update("|");
  });
  return hash.digest("hex").slice(0, 16);
}

export function makeContentBlock(params: {
  period: CapsuleHistoryPeriod;
  kind: string;
  index: number;
  text: string;
  seed?: string;
  sourceIds?: string[];
  metadata?: Record<string, unknown> | null;
}): CapsuleHistoryContentBlock {
  const { period, kind, index, text } = params;
  const id = buildHistoryContentId(period, kind, index, params.seed ?? text);
  const uniqueSourceIds = Array.from(new Set(params.sourceIds ?? [])).filter((value) => value);
  return {
    id,
    text,
    sourceIds: uniqueSourceIds,
    pinned: false,
    pinId: null,
    note: null,
    metadata: params.metadata ?? null,
  };
}

export function makeTimelineEntry(params: {
  period: CapsuleHistoryPeriod;
  index: number;
  label: string;
  detail: string;
  timestamp: string | null;
  postId?: string | null;
  permalink?: string | null;
  sourceIds?: string[];
}): CapsuleHistoryTimelineEntry {
  const metadata: Record<string, unknown> | null = params.postId
    ? { postId: params.postId }
    : null;
  const base = makeContentBlock({
    period: params.period,
    kind: "timeline",
    index: params.index,
    text: params.detail,
    seed: params.label,
    ...(Array.isArray(params.sourceIds) ? { sourceIds: params.sourceIds } : {}),
    metadata,
  });
  return {
    ...base,
    label: params.label,
    detail: params.detail,
    timestamp: params.timestamp ?? null,
    postId: params.postId ?? null,
    permalink: params.permalink ?? null,
  };
}

export function isOnOrAfterTimestamp(value: string | null, boundary: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() >= boundary.getTime();
}

export function resolveEarliestTimestamp(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  const candidateDate = new Date(candidate);
  if (Number.isNaN(candidateDate.getTime())) return current;
  if (!current) return candidate;
  const currentDate = new Date(current);
  if (Number.isNaN(currentDate.getTime())) return candidate;
  return candidateDate.getTime() < currentDate.getTime() ? candidate : current;
}

export function mapHistoryPostRow(row: {
  id: string | number | null;
  kind: string | null;
  content: string | null;
  media_url: string | null;
  media_prompt: string | null;
  user_name: string | null;
  created_at: string | null;
}): CapsuleHistoryPost | null {
  const idSource = row.id;
  let id: string | null = null;
  if (typeof idSource === "string") {
    id = idSource.trim();
  } else if (typeof idSource === "number") {
    id = String(idSource);
  }
  if (!id) return null;
  const createdAt =
    typeof row.created_at === "string" && row.created_at.trim().length
      ? row.created_at.trim()
      : null;
  const kind = sanitizeHistoryString(row.kind, 48);
  const hasMedia = typeof row.media_url === "string" && row.media_url.trim().length > 0;
  const contentPrimary = sanitizeHistoryContent(row.content);
  const contentFallback = sanitizeHistoryContent(row.media_prompt);
  const user =
    typeof row.user_name === "string" && row.user_name.trim().length
      ? row.user_name.trim().slice(0, 80)
      : null;
  const content =
    contentPrimary ||
    contentFallback ||
    (hasMedia ? "Shared new media." : "Shared an update.");
  return {
    id,
    kind,
    content,
    createdAt,
    user,
    hasMedia,
  };
}

export function buildHistoryTimeframes(
  posts: CapsuleHistoryPost[],
  now: Date,
): CapsuleHistoryTimeframe[] {
  const nowIso = now.toISOString();
  const weeklyBoundary = new Date(now.getTime() - WEEK_MS);
  const monthlyBoundary = new Date(now.getTime() - MONTH_MS);
  const weeklyPosts = posts.filter((post) => isOnOrAfterTimestamp(post.createdAt, weeklyBoundary));
  const monthlyPosts = posts.filter((post) => isOnOrAfterTimestamp(post.createdAt, monthlyBoundary));
  const earliest = posts.reduce<string | null>(
    (acc, post) => resolveEarliestTimestamp(acc, post.createdAt),
    null,
  );
  return [
    {
      period: "weekly",
      label: "This Week",
      start: weeklyBoundary.toISOString(),
      end: nowIso,
      posts: weeklyPosts,
    },
    {
      period: "monthly",
      label: "This Month",
      start: monthlyBoundary.toISOString(),
      end: nowIso,
      posts: monthlyPosts,
    },
    {
      period: "all_time",
      label: "All Time",
      start: earliest,
      end: nowIso,
      posts,
    },
  ];
}

export function collectAuthorStats(posts: CapsuleHistoryPost[]): Map<string, number> {
  const stats = new Map<string, number>();
  posts.forEach((post) => {
    const name = post.user?.trim();
    if (!name) return;
    stats.set(name, (stats.get(name) ?? 0) + 1);
  });
  return stats;
}

export function getTopAuthorName(stats: Map<string, number>): string | null {
  let topName: string | null = null;
  let topCount = 0;
  for (const [name, count] of stats.entries()) {
    if (count > topCount) {
      topName = name;
      topCount = count;
    }
  }
  return topName;
}

export function buildFallbackSummary(timeframe: CapsuleHistoryTimeframe): string {
  if (!timeframe.posts.length) {
    if (timeframe.period === "all_time") {
      return "No posts have been shared in this capsule yet.";
    }
    return `No activity recorded for ${timeframe.label.toLowerCase()}.`;
  }
  const stats = collectAuthorStats(timeframe.posts);
  const contributorCount = stats.size || (timeframe.posts[0]?.user ? 1 : 0);
  const latestAuthor = timeframe.posts.find((post) => post.user)?.user ?? "a member";
  if (contributorCount > 1) {
    return `${timeframe.posts.length} posts from ${contributorCount} contributors. Latest update from ${latestAuthor}.`;
  }
  return `${timeframe.posts.length} ${timeframe.posts.length === 1 ? "post" : "posts"} from ${latestAuthor}.`;
}

export function buildFallbackHighlights(timeframe: CapsuleHistoryTimeframe): string[] {
  if (!timeframe.posts.length) return [];
  const stats = collectAuthorStats(timeframe.posts);
  const topAuthor = getTopAuthorName(stats);
  const highlights: string[] = [];
  const latest = timeframe.posts[0] ?? null;
  if (latest?.content) {
    highlights.push(latest.content);
  } else if (topAuthor) {
    highlights.push(`${topAuthor} shared an update.`);
  } else {
    highlights.push("Recent member update recorded.");
  }
  if (stats.size > 1) {
    highlights.push(`${stats.size} members contributed updates.`);
  } else if (stats.size === 1 && timeframe.posts.length > 1 && topAuthor) {
    highlights.push(`${topAuthor} posted multiple updates.`);
  }
  return highlights;
}

export function buildFallbackNextFocus(timeframe: CapsuleHistoryTimeframe): string[] {
  if (!timeframe.posts.length) {
    return [
      "Post a kickoff recap to start the capsule wiki.",
      "Invite members to share their wins for this period.",
    ];
  }
  return [
    "Pin a short recap highlighting the latest wins.",
    "Ask members to add media or documents that support these updates.",
  ];
}

export function buildCapsulePostPermalink(capsuleId: string, postId: string): string {
  const base = `/capsule?capsuleId=${encodeURIComponent(capsuleId)}`;
  if (!postId) return base;
  return `${base}&postId=${encodeURIComponent(postId)}`;
}

export function buildFallbackTimelineEntries(
  capsuleId: string,
  timeframe: CapsuleHistoryTimeframe,
  sources: Record<string, CapsuleHistorySource>,
): CapsuleHistoryTimelineEntry[] {
  if (!timeframe.posts.length) return [];
  return timeframe.posts.slice(0, HISTORY_TIMELINE_LIMIT).map((post, index) => {
    const label =
      sanitizeHistoryString(
        post.user ? `Update from ${post.user}` : "New update",
        120,
      ) ?? "New update";
    const detail =
      sanitizeHistoryString(
        post.content || (post.hasMedia ? "Shared new media." : "Shared an update."),
        HISTORY_LINE_LIMIT,
      ) ?? "Shared an update.";
    ensurePostSource(sources, capsuleId, post);
    return makeTimelineEntry({
      period: timeframe.period,
      index,
      label,
      detail,
      timestamp: post.createdAt,
      postId: post.id,
      permalink: buildCapsulePostPermalink(capsuleId, post.id),
      sourceIds: [`post:${post.id}`],
    });
  });
}

export function computeCoverageMetrics(
  timeframe: CapsuleHistoryTimeframe,
  content: CapsuleHistorySectionContent,
): CapsuleHistoryCoverage {
  if (!timeframe.posts.length) {
    return buildEmptyCoverage();
  }

  const totalPosts = timeframe.posts.length;
  const timelinePostIds = new Set(
    content.timeline
      .map((entry) => entry.postId)
      .filter((postId): postId is string => typeof postId === "string" && postId.length > 0),
  );
  const postAuthorMap = new Map<string, string | null>();
  timeframe.posts.forEach((post) => {
    postAuthorMap.set(post.id, post.user ?? null);
  });

  const summaryWeight = content.summary.text ? 1 : 0;
  const coverageScore =
    (summaryWeight + content.highlights.length + content.timeline.length) /
    Math.max(1, totalPosts);

  const authorStats = collectAuthorStats(timeframe.posts);
  const authors = Array.from(authorStats.entries()).map(([name, count]) => {
    let covered = false;
    timelinePostIds.forEach((postId) => {
      if (postAuthorMap.get(postId) === name) {
        covered = true;
      }
    });
    return {
      id: `author:${name}`,
      label: name,
      covered,
      weight: count,
    };
  });

  const themeCounts = new Map<string, number>();
  timeframe.posts.forEach((post) => {
    const kind = typeof post.kind === "string" ? post.kind.trim() : "";
    if (!kind) return;
    themeCounts.set(kind, (themeCounts.get(kind) ?? 0) + 1);
  });
  const themes = Array.from(themeCounts.entries()).map(([kind, count]) => ({
    id: `theme:${kind}`,
    label: kind.replace(/_/g, " "),
    covered: count > 0,
    weight: count,
  }));

  const segmentCount = 3;
  const segmentSize = Math.max(1, Math.ceil(totalPosts / segmentCount));
  const timeSpans: CapsuleHistoryCoverage["timeSpans"] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const start = index * segmentSize;
    const segmentPosts = timeframe.posts.slice(start, start + segmentSize);
    const covered = segmentPosts.some((post) => timelinePostIds.has(post.id));
    timeSpans.push({
      id: `span:${index}`,
      label: index === 0 ? "Early" : index === 1 ? "Mid-period" : "Recent",
      covered,
      weight: segmentPosts.length,
    });
  }

  return {
    completeness: Math.min(1, Number.isFinite(coverageScore) ? coverageScore : 0),
    authors,
    themes,
    timeSpans,
  };
}

export function cloneContentBlock(block: CapsuleHistoryContentBlock): CapsuleHistoryContentBlock {
  return {
    ...block,
    sourceIds: Array.isArray(block.sourceIds) ? [...block.sourceIds] : [],
    metadata:
      block.metadata && typeof block.metadata === "object"
        ? { ...(block.metadata as Record<string, unknown>) }
        : null,
    pinned: Boolean(block.pinned),
    pinId: block.pinId ?? null,
    note: block.note ?? null,
  };
}

export function normalizeArticleBlock(block: CapsuleHistoryArticle): CapsuleHistoryArticle {
  const metadataRaw =
    block.metadata && typeof block.metadata === "object"
      ? (block.metadata as Record<string, unknown>)
      : null;
  const title =
    metadataRaw && typeof metadataRaw.title === "string"
      ? sanitizeHistoryString(metadataRaw.title, HISTORY_ARTICLE_TITLE_LIMIT)
      : null;
  const paragraphs = metadataRaw && Array.isArray(metadataRaw.paragraphs)
    ? (metadataRaw.paragraphs as unknown[])
        .map((paragraph) => sanitizeHistoryString(paragraph, HISTORY_ARTICLE_PARAGRAPH_LENGTH))
        .filter((paragraph): paragraph is string => Boolean(paragraph))
        .slice(0, HISTORY_ARTICLE_PARAGRAPH_LIMIT)
    : [];
  const links = metadataRaw && Array.isArray(metadataRaw.links)
    ? (metadataRaw.links as unknown[])
        .map((link) => {
          if (!link || typeof link !== "object") return null;
          const record = link as Record<string, unknown>;
          const label = sanitizeHistoryString(record.label, 140);
          const url =
            typeof record.url === "string" && record.url.trim().length
              ? record.url.trim()
              : null;
          const sourceId =
            typeof record.sourceId === "string" && record.sourceId.trim().length
              ? record.sourceId.trim()
              : null;
          return {
            label: label ?? "Capsule post",
            url,
            sourceId,
          };
        })
        .filter((link): link is CapsuleHistoryArticleLink => Boolean(link))
        .slice(0, HISTORY_ARTICLE_LINK_LIMIT)
    : [];

  return {
    ...block,
    metadata: {
      title: title ?? (paragraphs[0] ?? block.text ?? null),
      paragraphs: paragraphs.length ? paragraphs : block.text ? [block.text] : [],
      links,
    },
  };
}

export function ensurePostSource(
  sources: Record<string, CapsuleHistorySource>,
  capsuleId: string,
  post: CapsuleHistoryPost,
) {
  const postId = post.id;
  const sourceId = `post:${postId}`;
  if (!sources[sourceId]) {
    const label = post.content ? post.content.slice(0, 140) : `Update from ${post.user ?? "member"}`;
    sources[sourceId] = {
      id: sourceId,
      type: "post",
      label,
      description: post.content ?? null,
      url: buildCapsulePostPermalink(capsuleId, postId),
      postId,
      topicPageId: null,
      quoteId: null,
      authorName: post.user ?? null,
      authorAvatarUrl: null,
      occurredAt: post.createdAt,
      metrics: {
        reactions: null,
        comments: null,
        shares: null,
      },
    };
  }
  return sourceId;
}

export function buildEmptyCoverage(): CapsuleHistoryCoverage {
  return {
    completeness: 0,
    authors: [],
    themes: [],
    timeSpans: [],
  };
}
