import { getSupabaseAdminClient } from "./admin";

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

export async function ensureAliasUserFromName(name: string, avatarUrl: string | null) {
  const supabase = getSupabaseAdminClient();
  const normalized = String(name ?? "").trim();
  if (!normalized) return null;
  const key = `alias:${normalized.toLowerCase()}`;

  const existingByKey = await supabase.from("users").select("id").eq("user_key", key).maybeSingle();
  if (existingByKey.error && existingByKey.error.code !== NO_ROW_CODE) throw existingByKey.error;
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

export async function resolveSupabaseUserId(
  input: UserIdentifierInput,
  options: { allowAlias?: boolean } = {},
): Promise<{ userId: string; isAlias: boolean } | null> {
  const supabase = getSupabaseAdminClient();
  const allowAlias = options.allowAlias ?? false;

  const directId = normalize(input.userId);
  if (directId) {
    const result = await supabase.from("users").select("id").eq("id", directId).maybeSingle();
    if (result.error && result.error.code !== NO_ROW_CODE) throw result.error;
    if (result.data?.id) return { userId: result.data.id as string, isAlias: false };
    return null;
  }

  const key = normalize(input.userKey);
  if (key) {
    const result = await supabase.from("users").select("id").eq("user_key", key).maybeSingle();
    if (result.error && result.error.code !== NO_ROW_CODE) throw result.error;
    if (result.data?.id) return { userId: result.data.id as string, isAlias: false };
  }

  const email = normalize(input.email)?.toLowerCase() ?? null;
  if (email) {
    const result = await supabase.from("users").select("id").eq("email", email).maybeSingle();
    if (result.error && result.error.code !== NO_ROW_CODE) throw result.error;
    if (result.data?.id) return { userId: result.data.id as string, isAlias: false };
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
