import { getSupabaseAdminClient } from "./admin";

export async function upsertSocialLink({
  ownerId,
  provider,
  remoteUserId,
  remoteUsername,
  tokens,
}: {
  ownerId: string;
  provider: string;
  remoteUserId?: string | null;
  remoteUsername?: string | null;
  tokens: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  const row = {
    owner_user_id: ownerId,
    provider,
    remote_user_id: remoteUserId ?? null,
    remote_username: remoteUsername ?? null,
    access_token: (tokens.access_token as string) ?? (tokens.accessToken as string) ?? null,
    refresh_token: (tokens.refresh_token as string) ?? (tokens.refreshToken as string) ?? null,
    expires_at: (tokens.expires_at as string) ?? null,
    scope: (tokens.scope as string) ?? null,
    meta: tokens,
  };
  const { error } = await supabase
    .from("social_links")
    .upsert([row], { onConflict: "owner_user_id,provider" });
  if (error) throw error;
}

export async function listSocialLinks(ownerId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("social_links")
    .select("provider, remote_user_id, remote_username, created_at, updated_at")
    .eq("owner_user_id", ownerId)
    .order("provider", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    provider: row.provider,
    connected: true,
    remote_user_id: row.remote_user_id ?? null,
    remote_username: row.remote_username ?? null,
    connected_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }));
}

export async function deleteSocialLink(ownerId: string, provider: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("social_links")
    .delete()
    .eq("owner_user_id", ownerId)
    .eq("provider", provider);
  if (error) throw error;
}
