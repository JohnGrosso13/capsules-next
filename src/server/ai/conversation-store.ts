import "server-only";

import { Redis } from "@upstash/redis";

import { serverEnv } from "@/lib/env/server";
import type { ComposerChatMessage } from "@/lib/composer/chat-types";

const SUMMARY_HISTORY_LIMIT = 6;

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

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = serverEnv;
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

function buildThreadKey(userId: string, threadId: string): string {
  return `composer:thread:${userId}:${threadId}`;
}

function buildSummaryKey(userId: string): string {
  return `composer:summary:${userId}`;
}

export async function storeConversationSnapshot(
  userId: string,
  threadId: string,
  snapshot: ConversationSnapshot,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const threadKey = buildThreadKey(userId, threadId);
  const summaryKey = buildSummaryKey(userId);
  const payload = JSON.stringify(snapshot);
  const summary: ConversationSummary = {
    threadId,
    prompt: snapshot.prompt,
    message: snapshot.message,
    updatedAt: snapshot.updatedAt,
    draft: snapshot.draft,
    rawPost: snapshot.rawPost,
    history: snapshot.history.slice(-SUMMARY_HISTORY_LIMIT),
  };
  try {
    await Promise.all([
      redis.set(threadKey, payload, { ex: 60 * 60 * 24 * 30 }),
      redis.hset(summaryKey, { [threadId]: JSON.stringify(summary) }),
    ]);
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
    const entries = await redis.hgetall<Record<string, string>>(buildSummaryKey(userId));
    if (!entries) return [];
    const summaries: ConversationSummary[] = Object.values(entries)
      .map((value) => {
        try {
          const parsed = JSON.parse(value) as ConversationSummary;
          return {
            ...parsed,
            history: Array.isArray(parsed.history) ? parsed.history : [],
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is ConversationSummary => Boolean(item));
    return summaries
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, limit);
  } catch (error) {
    console.warn("Failed to list composer conversations", error);
    return [];
  }
}
