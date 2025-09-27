import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type AnalyticsOverview = {
  totalUsers: number;
  activeUsers30d: number;
  activeUsers7d: number;
  capsulesCreated: number;
  postsCreated24h: number;
  friendsConnections: number;
  lastSync: string;
};

export async function fetchAnalyticsOverview(): Promise<AnalyticsOverview> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("analytics_overview_snapshot");
  if (error) {
    throw error;
  }
  const row = (data as Record<string, unknown>[] | null)?.[0] ?? {};
  const isoNow = new Date().toISOString();
  return {
    totalUsers: Number(row.total_users ?? 0),
    activeUsers30d: Number(row.active_users_30d ?? 0),
    activeUsers7d: Number(row.active_users_7d ?? 0),
    capsulesCreated: Number(row.capsules_created ?? 0),
    postsCreated24h: Number(row.posts_created_24h ?? 0),
    friendsConnections: Number(row.friend_edges ?? 0),
    lastSync: String(row.last_calculated ?? isoNow),
  };
}

export type TimeSeriesPoint = {
  date: string;
  value: number;
};

export async function fetchDailyActiveUsers(days: number = 30): Promise<TimeSeriesPoint[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("analytics_daily_active_users")
    .select("date, active_count")
    .order("date", { ascending: false })
    .limit(days);
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({ date: String(row.date), value: Number(row.active_count ?? 0) }))
    .reverse();
}

export async function fetchDailyPosts(days: number = 30): Promise<TimeSeriesPoint[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("analytics_daily_posts")
    .select("date, posts_count")
    .order("date", { ascending: false })
    .limit(days);
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({ date: String(row.date), value: Number(row.posts_count ?? 0) }))
    .reverse();
}
