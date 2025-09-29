import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

function raise(context: string, error: DatabaseError): Error {
  const err = new Error(`${context}: ${error.message}`);
  const extended = err as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return err;
}

function ensure(result: DatabaseResult<unknown>, context: string): void {
  if (result.error) throw raise(context, result.error);
}

function ensureRows<T>(result: DatabaseResult<T[]>, context: string): T[] {
  if (result.error) throw raise(context, result.error);
  return result.data ?? [];
}

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
  const db = getDatabaseAdminClient();
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

  const result = await db
    .from("social_links")
    .upsert([row], { onConflict: "owner_user_id,provider" })
    .fetch();

  ensure(result, "social.upsert");
}

export async function listSocialLinks(ownerId: string) {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("social_links")
    .select<{
      provider: string;
      remote_user_id: string | null;
      remote_username: string | null;
      created_at: string | null;
      updated_at: string | null;
    }>("provider, remote_user_id, remote_username, created_at, updated_at")
    .eq("owner_user_id", ownerId)
    .order("provider", { ascending: true })
    .fetch();

  const rows = ensureRows(result, "social.list");

  return rows.map((row) => ({
    provider: row.provider,
    connected: true,
    remote_user_id: row.remote_user_id ?? null,
    remote_username: row.remote_username ?? null,
    connected_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }));
}

export async function deleteSocialLink(ownerId: string, provider: string) {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("social_links")
    .delete()
    .eq("owner_user_id", ownerId)
    .eq("provider", provider)
    .fetch();

  ensure(result, "social.delete");
}
