import { getDatabaseAdminClient } from "@/config/database";
import type { DatabaseError, DatabaseResult } from "@/ports/database";

type UserRow = {
  id: string;
  user_key: string | null;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
};

const NO_ROW_CODE = "PGRST116";

function normalizeString(value: string | null | undefined): string | null {
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
  if (result.error) {
    if (result.error.code === NO_ROW_CODE) {
      return null;
    }
    throw decorateError(context, result.error);
  }
  return result.data ?? null;
}

export async function findUserById(userId: string): Promise<UserRow | null> {
  const normalizedId = normalizeString(userId);
  if (!normalizedId) return null;

  const db = getDatabaseAdminClient();
  const result = await db
    .from("users")
    .select<UserRow>("id, user_key, full_name, avatar_url, bio, created_at")
    .eq("id", normalizedId)
    .maybeSingle();
  return handleResult(result, "users.findById");
}

export async function updateUserAvatar(params: {
  userId: string;
  avatarUrl: string | null;
}): Promise<boolean> {
  const normalizedId = normalizeString(params.userId);
  if (!normalizedId) return false;

  const db = getDatabaseAdminClient();
  const result = await db
    .from("users")
    .update({ avatar_url: params.avatarUrl ?? null })
    .eq("id", normalizedId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  const updated = handleResult(result, "users.updateAvatar");
  return Boolean(updated?.id);
}

export async function updateUserName(params: {
  userId: string;
  fullName: string | null;
}): Promise<boolean> {
  const normalizedId = normalizeString(params.userId);
  if (!normalizedId) return false;

  const normalizedName = normalizeString(params.fullName);

  const db = getDatabaseAdminClient();
  const result = await db
    .from("users")
    .update({ full_name: normalizedName ?? null })
    .eq("id", normalizedId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  const updated = handleResult(result, "users.updateName");
  return Boolean(updated?.id);
}

export async function updateUserProfileFields(params: {
  userId: string;
  fullName?: string | null;
  bio?: string | null;
}): Promise<boolean> {
  const normalizedId = normalizeString(params.userId);
  if (!normalizedId) return false;

  const payload: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(params, "fullName")) {
    payload.full_name = normalizeString(params.fullName ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(params, "bio")) {
    const bioValue =
      typeof params.bio === "string" ? params.bio : params.bio == null ? null : String(params.bio);
    payload.bio = bioValue;
  }

  if (!Object.keys(payload).length) {
    return true;
  }

  const db = getDatabaseAdminClient();
  const result = await db
    .from("users")
    .update(payload)
    .eq("id", normalizedId)
    .select<{ id: string | null }>("id")
    .maybeSingle();

  const updated = handleResult(result, "users.updateProfileFields");
  return Boolean(updated?.id);
}
