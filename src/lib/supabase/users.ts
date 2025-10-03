import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

const NO_ROW_CODE = "PGRST116";

type MaybeString = string | null | undefined;

export type UserIdentifierInput = {
  userId?: MaybeString;
  userKey?: MaybeString;
  email?: MaybeString;
  name?: MaybeString;
  avatarUrl?: MaybeString;
};

function normalize(value: MaybeString): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function decorateError(context: string, error: DatabaseError): Error {
  const err = new Error(`${context}: ${error.message}`);
  const extended = err as Error & Record<string, unknown>;
  if (error.code) extended.code = error.code;
  if (error.details) extended.details = error.details;
  if (error.hint) extended.hint = error.hint;
  return err;
}

function handleResult<T>(result: DatabaseResult<T>, context: string): T | null {
  const error = result.error;
  if (error && error.code !== NO_ROW_CODE) {
    throw decorateError(context, error);
  }
  return result.data ?? null;
}

export async function ensureAliasUserFromName(name: string, avatarUrl: string | null) {
  const db = getDatabaseAdminClient();
  const normalized = String(name ?? "").trim();
  if (!normalized) return null;
  const key = `alias:${normalized.toLowerCase()}`;

  const existingByKey = await db
    .from("users")
    .select<{ id: string }>("id")
    .eq("user_key", key)
    .maybeSingle();
  const existing = handleResult(existingByKey, "users.ensureAlias.lookup");
  if (existing?.id) return existing.id;

  const insert = {
    user_key: key,
    provider: "other",
    full_name: normalized,
    avatar_url: avatarUrl ?? null,
  };
  const result = await db
    .from("users")
    .insert([insert])
    .select<{ id: string }>("id")
    .single();
  const created = handleResult(result, "users.ensureAlias.insert");
  if (!created?.id) {
    throw new Error("users.ensureAlias.insert: missing id in response");
  }
  return created.id;
}

export async function resolveSupabaseUserId(
  input: UserIdentifierInput,
  options: { allowAlias?: boolean } = {},
): Promise<{ userId: string; isAlias: boolean } | null> {
  const db = getDatabaseAdminClient();
  const allowAlias = options.allowAlias ?? false;

  const directId = normalize(input.userId);
  if (directId) {
    const byId = await db
      .from("users")
      .select<{ id: string }>("id")
      .eq("id", directId)
      .maybeSingle();
    const resolved = handleResult(byId, "users.resolve.byId");
    if (resolved?.id) return { userId: resolved.id, isAlias: false };
    return null;
  }

  const key = normalize(input.userKey);
  if (key) {
    const byKey = await db
      .from("users")
      .select<{ id: string }>("id")
      .eq("user_key", key)
      .maybeSingle();
    const resolved = handleResult(byKey, "users.resolve.byKey");
    if (resolved?.id) return { userId: resolved.id, isAlias: false };
  }

  const email = normalize(input.email)?.toLowerCase() ?? null;
  if (email) {
    const byEmail = await db
      .from("users")
      .select<{ id: string }>("id")
      .eq("email", email)
      .maybeSingle();
    const resolved = handleResult(byEmail, "users.resolve.byEmail");
    if (resolved?.id) return { userId: resolved.id, isAlias: false };
  }

  if (allowAlias) {
    const aliasName = normalize(input.name);
    if (aliasName) {
      const aliasId = await ensureAliasUserFromName(aliasName, normalize(input.avatarUrl));
      if (aliasId) return { userId: aliasId, isAlias: true };
    }
  }

  return null;
}
