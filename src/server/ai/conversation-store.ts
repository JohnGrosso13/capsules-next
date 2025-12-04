import "server-only";

import { getRedis } from "@/server/redis/client";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";

const SUMMARY_HISTORY_LIMIT = 6;
const SUMMARY_TEXT_LIMIT = 320;
const SNAPSHOT_TTL_SECONDS = 60 * 60 * 24 * 30;
const SUMMARY_INDEX_WINDOW_MS = SNAPSHOT_TTL_SECONDS * 1000;

type ConversationSnapshot = {
  threadId: string;
  prompt: string;
  message: string | null;
  history: ComposerChatMessage[];
  draft: Record<string, unknown> | null;
  rawPost: Record<string, unknown> | null;
  updatedAt: string;
};

type ConversationSummary = {
  threadId: string;
  prompt: string;
  message: string | null;
  updatedAt: string;
  draft: Record<string, unknown> | null;
  rawPost: Record<string, unknown> | null;
  history: ComposerChatMessage[];
};

function trimText(value: string | null | undefined, limit = SUMMARY_TEXT_LIMIT): string {
  const text = (value ?? "").trim();
  if (!text.length) return "";
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function buildThreadKey(userId: string, threadId: string): string {
  return `composer:thread:${userId}:${threadId}`;
}

function buildSummaryIndexKey(userId: string): string {
  return `composer:summary-index:${userId}`;
}

function buildSummaryItemKey(userId: string, threadId: string): string {
  return `composer:summary-item:${userId}:${threadId}`;
}

export async function storeConversationSnapshot(
  userId: string,
  threadId: string,
  snapshot: ConversationSnapshot,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const threadKey = buildThreadKey(userId, threadId);
  const summaryIndexKey = buildSummaryIndexKey(userId);
  const summaryItemKey = buildSummaryItemKey(userId, threadId);
  const payload = JSON.stringify(snapshot);
  const summary: ConversationSummary = {
    threadId,
    // Keep summaries small to respect Upstash max request limits.
    prompt: trimText(snapshot.prompt),
    message: snapshot.message ? trimText(snapshot.message) : null,
    updatedAt: snapshot.updatedAt,
    // Summaries don’t need full draft/rawPost; keep them null here to avoid oversized hashes.
    draft: null,
    rawPost: null,
    history: snapshot.history
      .slice(-SUMMARY_HISTORY_LIMIT)
      .map((entry) => ({
        id: entry.id,
        role: entry.role,
        content: trimText(entry.content),
        createdAt: entry.createdAt,
        // Attachments can bloat the hash and aren’t needed for the list view.
        attachments: null,
      })),
  };
  const summaryPayload = JSON.stringify(summary);
  const parsedTimestamp = Date.parse(summary.updatedAt);
  const summaryScore = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
  try {
    const tasks: Array<Promise<unknown>> = [
      redis.set(threadKey, payload, { ex: SNAPSHOT_TTL_SECONDS }),
      redis.set(summaryItemKey, summaryPayload, { ex: SNAPSHOT_TTL_SECONDS }),
      redis.zadd(summaryIndexKey, [{ score: summaryScore, member: threadId }]),
    ];
    const cutoff = Date.now() - SUMMARY_INDEX_WINDOW_MS;
    if (cutoff > 0) {
      tasks.push(redis.zremrangebyscore(summaryIndexKey, 0, cutoff));
    }
    await Promise.all(tasks);
  } catch (error) {
    console.warn("Failed to persist composer conversation snapshot", error);
  }
}

export async function loadConversationSnapshot(
  userId: string,
  threadId: string,
): Promise<ConversationSnapshot | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get<string>(buildThreadKey(userId, threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConversationSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (error) {
    console.warn("Failed to load composer conversation snapshot", error);
    return null;
  }
}

export async function listConversationSummaries(
  userId: string,
  limit = 20,
): Promise<ConversationSummary[]> {
  const redis = getRedis();
  if (!redis) return [];
  try {
    const summaryIndexKey = buildSummaryIndexKey(userId);
    const fetchCount = Math.max(limit, 1) * 3;
    const threadIds = await redis.zrange(summaryIndexKey, 0, fetchCount - 1, { rev: true });
    if (!threadIds.length) return [];

    const results = await Promise.all(
      threadIds.map(async (threadIdValue) => {
        const threadId = typeof threadIdValue === "string" ? threadIdValue : String(threadIdValue);
        try {
          const raw = await redis.get<string>(buildSummaryItemKey(userId, threadId));
          if (!raw) {
            return { threadId, summary: null as ConversationSummary | null };
          }
          const parsed = JSON.parse(raw) as ConversationSummary;
          return {
            threadId,
            summary: {
              ...parsed,
              history: Array.isArray(parsed.history) ? parsed.history : [],
            },
          };
        } catch {
          return { threadId, summary: null as ConversationSummary | null };
        }
      }),
    );

    const missingThreadIds = results
      .filter((entry) => entry.summary === null)
      .map((entry) => entry.threadId);
    if (missingThreadIds.length) {
      await Promise.all(
        missingThreadIds.map((threadId) => redis.zrem(summaryIndexKey, threadId)),
      );
    }

    const summaries: ConversationSummary[] = [];
    const seen = new Set<string>();
    for (const entry of results) {
      if (!entry.summary) continue;
      if (seen.has(entry.summary.threadId)) continue;
      seen.add(entry.summary.threadId);
      summaries.push(entry.summary);
      if (summaries.length >= limit) break;
    }

    return summaries;
  } catch (error) {
    console.warn("Failed to list composer conversations", error);
    return [];
  }
}
