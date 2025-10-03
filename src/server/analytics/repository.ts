import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

type AnalyticsOverviewRow = {
  total_users?: number | null;
  active_users_30d?: number | null;
  active_users_7d?: number | null;
  capsules_created?: number | null;
  posts_created_24h?: number | null;
  friend_edges?: number | null;
  last_calculated?: string | null;
};

type DailyMetricRow = {
  date: string | null;
  active_count?: number | null;
  posts_count?: number | null;
};

function toError(error: DatabaseError, context: string): Error {
  const err = new Error(`${context}: ${error.message}`);
  if (error.code) (err as Error & Record<string, unknown>).code = error.code;
  if (error.details) (err as Error & Record<string, unknown>).details = error.details;
  if (error.hint) (err as Error & Record<string, unknown>).hint = error.hint;
  return err;
}

function ensureResult<T>(result: DatabaseResult<T>, context: string): T | null {
  if (result.error) {
    throw toError(result.error, context);
  }
  return result.data ?? null;
}

export async function fetchOverviewSnapshot(): Promise<AnalyticsOverviewRow[]> {
  const db = getDatabaseAdminClient();
  const result = await db.rpc<AnalyticsOverviewRow[]>("analytics_overview_snapshot");
  return ensureResult(result, "analytics.overviewSnapshot") ?? [];
}

export async function fetchDailyActiveRows(limit: number): Promise<DailyMetricRow[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("analytics_daily_active_users")
    .select<DailyMetricRow>("date, active_count")
    .order("date", { ascending: false })
    .limit(limit)
    .fetch();
  return ensureResult(result, "analytics.dailyActive") ?? [];
}

export async function fetchDailyPostRows(limit: number): Promise<DailyMetricRow[]> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("analytics_daily_posts")
    .select<DailyMetricRow>("date, posts_count")
    .order("date", { ascending: false })
    .limit(limit)
    .fetch();
  return ensureResult(result, "analytics.dailyPosts") ?? [];
}
