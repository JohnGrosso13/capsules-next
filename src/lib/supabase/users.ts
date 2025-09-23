import { getSupabaseAdminClient } from "./admin";

export async function ensureAliasUserFromName(name: string, avatarUrl: string | null) {
  const supabase = getSupabaseAdminClient();
  const normalized = String(name ?? "").trim();
  if (!normalized) return null;
  const key = `alias:${normalized.toLowerCase()}`;

  const existingByKey = await supabase.from("users").select("id").eq("user_key", key).maybeSingle();
  if (existingByKey.error && existingByKey.error.code !== "PGRST116") throw existingByKey.error;
  if (existingByKey.data?.id) return existingByKey.data.id as string;

  const insert = {
    user_key: key,
    provider: "other",
    full_name: normalized,
    avatar_url: avatarUrl ?? null,
  };
  const { data, error } = await supabase.from("users").insert([insert]).select("id").single();
  if (error) throw error;
  return data.id as string;
}
