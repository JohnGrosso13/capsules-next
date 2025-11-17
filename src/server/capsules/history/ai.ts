import { callOpenAIChat, extractJSON } from "@/lib/ai/prompter";

import type { CapsuleHistoryPost, CapsuleHistoryTimeframe } from "./summary";
import { CAPSULE_HISTORY_RESPONSE_SCHEMA, type HistoryModelSection } from "./schema";

export type HistoryModelResult = { generatedAt: string | null; sections: HistoryModelSection[] };

export const HISTORY_MODEL_POST_LIMIT = 90;

export function sanitizeHistoryModelPayload(payload: unknown): HistoryModelResult {
  const parsed = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const sectionsRaw = Array.isArray(parsed.sections)
    ? (parsed.sections as HistoryModelSection[])
    : [];
  const generatedAt =
    typeof parsed.generated_at === "string" && parsed.generated_at.trim().length
      ? parsed.generated_at.trim()
      : null;
  const sections = sectionsRaw.filter(
    (entry): entry is HistoryModelSection => entry && typeof entry === "object",
  );
  return {
    generatedAt,
    sections,
  };
}

export function parseHistoryModelContent(content: string): HistoryModelResult {
  const parsed = extractJSON<Record<string, unknown>>(content) ?? {};
  return sanitizeHistoryModelPayload(parsed);
}

export async function generateCapsuleHistoryFromModel(input: {
  capsuleId: string;
  capsuleName: string | null;
  timeframes: CapsuleHistoryTimeframe[];
  posts: CapsuleHistoryPost[];
  nowIso: string;
}): Promise<HistoryModelResult> {
  const weekly = input.timeframes.find((tf) => tf.period === "weekly") ?? null;
  const monthly = input.timeframes.find((tf) => tf.period === "monthly") ?? null;
  const weeklyIds = new Set((weekly?.posts ?? []).map((post) => post.id));
  const monthlyIds = new Set((monthly?.posts ?? []).map((post) => post.id));
  const postsForModel = input.posts.slice(0, HISTORY_MODEL_POST_LIMIT).map((post) => ({
    id: post.id,
    created_at: post.createdAt,
    author: post.user,
    kind: post.kind,
    has_media: post.hasMedia,
    summary: post.content,
    in_weekly: weeklyIds.has(post.id),
    in_monthly: monthlyIds.has(post.id),
  }));

  const payload = {
    capsule: {
      id: input.capsuleId,
      name: input.capsuleName,
    },
    generated_at: input.nowIso,
    boundaries: input.timeframes.reduce<
      Record<string, { start: string | null; end: string | null; post_count: number }>
    >((acc, timeframe) => {
      acc[timeframe.period] = {
        start: timeframe.start,
        end: timeframe.end,
        post_count: timeframe.posts.length,
      };
      return acc;
    }, {}),
    posts: postsForModel,
  };

  const systemMessage = {
    role: "system",
    content:
      "You are Capsules AI, maintaining a capsule history wiki. For each timeframe (weekly, monthly, all_time) produce concise factual recaps based only on the provided posts and return JSON that matches the schema. Summaries may be up to three sentences. Highlights must be short bullet-style points (<=140 chars) referencing actual activity. Articles should read like short features with 1-2 paragraphs, cite real posts, and include a sources list that prefers provided post_id values (fallback to explicit URLs only when necessary). Timeline entries should mention specific updates and include the related post_id when the post exists in the provided list. Provide 1-3 actionable next_focus suggestions when there is activity. If a timeframe has zero posts, set empty=true, give a summary such as 'No new activity this period.', craft a single article that encourages future participation, and provide one suggestion encouraging participation. Never invent names or events and do not include editing instructions.",
  };

  const userMessage = {
    role: "user",
    content: JSON.stringify(payload),
  };

  const { content } = await callOpenAIChat(
    [systemMessage, userMessage],
    CAPSULE_HISTORY_RESPONSE_SCHEMA,
    { temperature: 0.4 },
  );

  return parseHistoryModelContent(content);
}
