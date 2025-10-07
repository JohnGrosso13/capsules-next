import {
  fetchDailyActiveRows,
  fetchDailyPostRows,
  fetchOverviewSnapshot,
} from "./repository";

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
  const rows = await fetchOverviewSnapshot();
  const row = rows[0] ?? {};
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

function normalizeSeries(rows: Array<{ date: string | null; value: number }>): TimeSeriesPoint[] {
  return rows
    .filter((row) => typeof row.date === "string" && row.date.trim().length > 0)
    .map((row) => ({ date: row.date!.trim(), value: row.value }))
    .reverse();
}

export async function fetchDailyActiveUsers(days: number = 30): Promise<TimeSeriesPoint[]> {
  const rows = await fetchDailyActiveRows(days);
  return normalizeSeries(
    rows.map((row) => ({ date: row.date, value: Number(row.active_count ?? 0) })),
  );
}

export async function fetchDailyPosts(days: number = 30): Promise<TimeSeriesPoint[]> {
  const rows = await fetchDailyPostRows(days);
  return normalizeSeries(rows.map((row) => ({ date: row.date, value: Number(row.posts_count ?? 0) })));
}
