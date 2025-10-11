import { auth } from "@clerk/nextjs/server";

import { getDatabaseAdminClient } from "@/config/database";
import type { AuthServerAdapter, IncomingUserPayload, NormalizedProfile } from "@/ports/auth";

const ADMIN_CONFIG = {
  ids: parseEnvList("CAPSULES_ADMIN_IDS", "ADMIN_USER_IDS"),

  keys: parseEnvList("CAPSULES_ADMIN_KEYS", "ADMIN_USER_KEYS", "ADMIN_KEYS"),

  emails: parseEnvList("CAPSULES_ADMIN_EMAILS", "ADMIN_EMAILS"),
};

type UserRecord = {
  id: string | number | null;
  user_key?: string | null;
  provider?: string | null;
  clerk_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
};

function parseEnvList(...keys: string[]) {
  const values = new Set<string>();

  keys.forEach((key) => {
    const raw = process.env[key];

    if (!raw) return;

    raw

      .split(/[\s,]+/)

      .map((entry) => entry.trim().toLowerCase())

      .filter(Boolean)

      .forEach((entry) => values.add(entry));
  });

  return Array.from(values);
}

export function normalizeProfileFromPayload(
  payload?: IncomingUserPayload | null,
): NormalizedProfile | null {
  const key = String(payload?.key ?? "").trim();

  if (!key) return null;

  const provider =
    (payload?.provider as string | undefined) ?? (key.startsWith("clerk:") ? "clerk" : "guest");

  const clerkId =
    (payload?.clerk_id as string | undefined) ??
    (provider === "clerk" && key.startsWith("clerk:") ? key.slice("clerk:".length) : null);

  return {
    key,

    provider,

    clerk_id: clerkId ?? null,

    email: (payload?.email as string | undefined) ?? null,

    full_name: (payload?.full_name as string | undefined) ?? null,

    avatar_url: (payload?.avatar_url as string | undefined) ?? null,
  };
}

export function mergeUserPayloadFromRequest(
  req: Request,
  basePayload?: IncomingUserPayload | null,
): IncomingUserPayload {
  const merged: IncomingUserPayload = { ...(basePayload ?? {}) };

  try {
    const headerValue = req.headers.get("x-capsules-user") ?? req.headers.get("x_capsules_user");

    if (headerValue) {
      try {
        const parsed = JSON.parse(headerValue);

        if (parsed && parsed.key) Object.assign(merged, parsed);
      } catch {
        // ignore malformed header
      }
    }

    if (!merged.key) {
      const headerKey =
        req.headers.get("x-capsules-user-key") ?? req.headers.get("x_capsules_user_key");

      if (headerKey) merged.key = headerKey.trim();
    }

    if (!merged.key) {
      const url = new URL(req.url ?? "http://localhost");

      const queryKey = url.searchParams.get("userKey") ?? url.searchParams.get("user_key");

      if (queryKey) merged.key = queryKey.trim();
    }
  } catch {
    // ignore header parsing failures
  }

  if (merged.key && !merged.provider)
    merged.provider = merged.key.startsWith("clerk:") ? "clerk" : "guest";

  return merged;
}

export async function resolveRequestProfile(
  payload: IncomingUserPayload,
  allowGuests = false,
): Promise<NormalizedProfile | null> {
  const { userId, sessionClaims } = await auth();

  if (userId) {
    const claims = sessionClaims ?? {};

    const fullNameClaim =
      (claims as Record<string, unknown>).full_name ||
      [
        (claims as Record<string, unknown>).first_name,

        (claims as Record<string, unknown>).last_name,
      ]

        .filter(Boolean)

        .join(" ") ||
      null;

    const fallbackEmail =
      (claims as Record<string, unknown>).email ||
      (claims as Record<string, unknown>).email_address ||
      null;

    return {
      key: `clerk:${userId}`,

      provider: "clerk",

      clerk_id: userId,

      email: (payload?.email as string | undefined) ?? (fallbackEmail as string | null) ?? null,

      full_name:
        (payload?.full_name as string | undefined) ?? (fullNameClaim as string | null) ?? null,

      avatar_url:
        (payload?.avatar_url as string | undefined) ??
        ((claims as Record<string, unknown>).picture as string | undefined) ??
        null,
    };
  }

  if (!allowGuests) return null;

  return normalizeProfileFromPayload(payload);
}

export async function ensureSupabaseUser(profile: NormalizedProfile): Promise<string> {
  const db = getDatabaseAdminClient();

  const normalizeString = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  };

  const toId = (value: unknown): string | null => {
    if (typeof value === "string") return value;
    if (typeof value === "number") return `${value}`;
    return null;
  };

  const syncUserProfileFields = async (
    userId: string,
    existing: Record<string, unknown>,
    incoming: {
      provider: string;
      clerk_id: string | null;
      email: string | null;
      full_name: string | null;
      avatar_url: string | null;
    },
  ) => {
    const updates: Record<string, unknown> = {};

    const nextName = normalizeString(incoming.full_name);
    const currentName = normalizeString(existing.full_name);
    if (nextName && nextName !== currentName) updates.full_name = nextName;

    const nextAvatar = normalizeString(incoming.avatar_url);
    const currentAvatar = normalizeString(existing.avatar_url);
    if (nextAvatar && nextAvatar !== currentAvatar) updates.avatar_url = nextAvatar;

    const nextEmail = normalizeString(incoming.email);
    const currentEmail = normalizeString(existing.email);
    if (nextEmail && nextEmail !== currentEmail) updates.email = nextEmail;

    const nextClerkId = normalizeString(incoming.clerk_id);
    const currentClerkId = normalizeString(existing.clerk_id);
    if (nextClerkId && nextClerkId !== currentClerkId) updates.clerk_id = nextClerkId;

    const currentProvider = normalizeString(existing.provider);
    if (incoming.provider && incoming.provider !== currentProvider)
      updates.provider = incoming.provider;

    if (!Object.keys(updates).length) return;

    updates.updated_at = new Date().toISOString();
    const result = await db.from("users").update(updates).eq("id", userId).fetch();
    if (result.error) throw result.error;
  };

  const { key, provider, clerk_id, email, full_name, avatar_url } = profile;

  const existingByKey = await db
    .from("users")
    .select<UserRecord>("id, provider, clerk_id, email, full_name, avatar_url")
    .eq("user_key", key)
    .maybeSingle();

  if (existingByKey.error && existingByKey.error.code !== "PGRST116") throw existingByKey.error;

  const existingByKeyRow = existingByKey.data;
  const existingByKeyId = toId(existingByKeyRow?.id);

  if (existingByKeyId && existingByKeyRow) {
    await syncUserProfileFields(existingByKeyId, existingByKeyRow, {
      provider,
      clerk_id,
      email,
      full_name,
      avatar_url,
    });
    return existingByKeyId;
  }

  if (clerk_id) {
    const existingByClerk = await db
      .from("users")
      .select<UserRecord>("id, user_key, provider, email, full_name, avatar_url")
      .eq("clerk_id", clerk_id)
      .maybeSingle();

    if (existingByClerk.error && existingByClerk.error.code !== "PGRST116")
      throw existingByClerk.error;

    const existingByClerkId = toId(existingByClerk.data?.id);

    if (existingByClerkId && existingByClerk.data) {
      if (existingByClerk.data.user_key !== key) {
        const updateResult = await db
          .from("users")
          .update({ user_key: key })
          .eq("id", existingByClerkId)
          .fetch();
        if (updateResult.error) throw updateResult.error;
      }

      await syncUserProfileFields(existingByClerkId, existingByClerk.data, {
        provider,
        clerk_id,
        email,
        full_name,
        avatar_url,
      });

      return existingByClerkId;
    }
  }

  if (email) {
    const existingByEmail = await db
      .from("users")
      .select<UserRecord>("id, provider, clerk_id, user_key, email, full_name, avatar_url")
      .eq("email", email)
      .maybeSingle();

    if (existingByEmail.error && existingByEmail.error.code !== "PGRST116")
      throw existingByEmail.error;

    const existingByEmailId = toId(existingByEmail.data?.id);

    if (existingByEmailId && existingByEmail.data) {
      if (existingByEmail.data.user_key !== key) {
        const updateResult = await db
          .from("users")
          .update({ user_key: key })
          .eq("id", existingByEmailId)
          .fetch();
        if (updateResult.error) throw updateResult.error;
      }

      await syncUserProfileFields(existingByEmailId, existingByEmail.data, {
        provider,
        clerk_id,
        email,
        full_name,
        avatar_url,
      });

      return existingByEmailId;
    }
  }

  const insert = {
    user_key: key,
    provider,
    clerk_id,
    email,
    full_name,
    avatar_url,
  };

  const inserted = await db.from("users").insert([insert]).select<UserRecord>("id").single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const retry = await db
        .from("users")
        .select<UserRecord>("id")
        .eq("user_key", key)
        .maybeSingle();

      if (retry.error && retry.error.code !== "PGRST116") throw retry.error;
      const retryId = toId(retry.data?.id);
      if (retryId) return retryId;
    }

    throw inserted.error;
  }

  const insertedId = toId(inserted.data?.id);
  if (!insertedId) {
    throw new Error("ensureSupabaseUser: insert returned invalid id");
  }

  return insertedId;
}

export async function ensureUserFromRequest(
  req: Request,

  basePayload?: IncomingUserPayload | null,

  options?: { allowGuests?: boolean },
): Promise<string | null> {
  const allowGuests = options?.allowGuests ?? false;

  const mergedPayload = mergeUserPayloadFromRequest(req, basePayload);

  const profile = await resolveRequestProfile(mergedPayload, allowGuests);

  if (!profile) return null;

  return ensureSupabaseUser(profile);
}

export async function resolveUserKey(payload: IncomingUserPayload): Promise<string | null> {
  const { userId } = await auth();

  if (userId) {
    return `clerk:${userId}`;
  }

  const key = String(payload?.key ?? "").trim();

  return key || null;
}

export async function isAdminRequest(
  req: Request,

  payload: IncomingUserPayload = {},

  supabaseUserId: string | null = null,
): Promise<boolean> {
  if (!hasAdminPrivilegesConfigured()) return false;

  const keyCandidates = new Set<string>();

  const emailCandidates = new Set<string>();

  const idCandidates = new Set<string>();

  const addCandidate = (set: Set<string>, value: unknown) => {
    if (typeof value !== "string") return;

    const normalized = value.trim().toLowerCase();

    if (normalized) set.add(normalized);
  };

  addCandidate(keyCandidates, payload.key);

  addCandidate(emailCandidates, payload.email);

  const { userId, sessionClaims } = await auth();

  if (userId) {
    addCandidate(keyCandidates, `clerk:${userId}`);

    const claims = sessionClaims ?? {};

    addCandidate(emailCandidates, (claims as Record<string, unknown>).email);

    addCandidate(emailCandidates, (claims as Record<string, unknown>).email_address);
  }

  if (supabaseUserId) addCandidate(idCandidates, supabaseUserId);

  const matchesKey = ADMIN_CONFIG.keys.length
    ? Array.from(keyCandidates).some((value) => ADMIN_CONFIG.keys.includes(value))
    : false;

  if (matchesKey) return true;

  const matchesEmail = ADMIN_CONFIG.emails.length
    ? Array.from(emailCandidates).some((value) => ADMIN_CONFIG.emails.includes(value))
    : false;

  if (matchesEmail) return true;

  const matchesId = ADMIN_CONFIG.ids.length
    ? Array.from(idCandidates).some((value) => ADMIN_CONFIG.ids.includes(value))
    : false;

  return matchesId;
}

function hasAdminPrivilegesConfigured() {
  return (
    ADMIN_CONFIG.ids.length > 0 || ADMIN_CONFIG.keys.length > 0 || ADMIN_CONFIG.emails.length > 0
  );
}

export const clerkAuthServerAdapter: AuthServerAdapter = {
  mergeUserPayloadFromRequest,
  normalizeProfileFromPayload,
  ensureUserFromRequest,
  ensureSupabaseUser,
  resolveUserKey,
  isAdminRequest,
};
