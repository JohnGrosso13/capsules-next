import { getDatabaseAdminClient } from "@/config/database";

export type CapsuleHistoryPostRow = {
  id: string | number | null;
  kind: string | null;
  content: string | null;
  media_url: string | null;
  media_prompt: string | null;
  user_name: string | null;
  created_at: string | null;
};

export async function fetchCapsuleHistoryPostRows(
  capsuleId: string,
  limit: number,
  db = getDatabaseAdminClient(),
): Promise<CapsuleHistoryPostRow[]> {
  const result = await db
    .from("posts_view")
    .select<CapsuleHistoryPostRow>("id, kind, content, media_url, media_prompt, user_name, created_at")
    .eq("capsule_id", capsuleId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .fetch();

  if (result.error) {
    throw new Error(`capsules.history.posts: ${result.error.message}`);
  }

  return result.data ?? [];
}

