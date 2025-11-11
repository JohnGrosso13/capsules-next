"use server";

import { getDatabaseAdminClient } from "@/config/database";

type StatsVisibility = "public" | "private";

export type ProfilePrivacySettings = {
  statsVisibility: StatsVisibility;
};

const DEFAULT_SETTINGS: ProfilePrivacySettings = {
  statsVisibility: "public",
};

type SettingsRow = {
  stats_visibility: StatsVisibility;
};

function normalize(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function mapRow(row: SettingsRow | null): ProfilePrivacySettings {
  if (!row) return DEFAULT_SETTINGS;
  return {
    statsVisibility: row.stats_visibility === "private" ? "private" : "public",
  };
}

export async function getProfilePrivacySettings(userId: string): Promise<ProfilePrivacySettings> {
  const normalizedId = normalize(userId);
  if (!normalizedId) return DEFAULT_SETTINGS;

  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_profile_settings")
    .select<SettingsRow>("stats_visibility")
    .eq("user_id", normalizedId)
    .maybeSingle();

  if (result.error) {
    if (result.error.code === "PGRST116") {
      return DEFAULT_SETTINGS;
    }
    throw new Error(`profile.settings.fetch_failed: ${result.error.message}`);
  }

  return mapRow(result.data ?? null);
}

export async function updateProfilePrivacySettings(
  userId: string,
  updates: Partial<ProfilePrivacySettings>,
): Promise<ProfilePrivacySettings> {
  const normalizedId = normalize(userId);
  if (!normalizedId) {
    throw new Error("profile.settings.update: invalid user id");
  }

  const payload: Record<string, unknown> = { user_id: normalizedId };
  if (updates.statsVisibility) {
    payload.stats_visibility = updates.statsVisibility;
  }

  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_profile_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select<SettingsRow>("stats_visibility")
    .eq("user_id", normalizedId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`profile.settings.update_failed: ${result.error.message}`);
  }

  return mapRow(result.data ?? null);
}
