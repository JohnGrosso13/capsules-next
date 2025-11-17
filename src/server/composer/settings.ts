import { z } from "zod";

import { getDatabaseAdminClient } from "@/config/database";
import { coerceComposerImageQuality, DEFAULT_COMPOSER_IMAGE_SETTINGS, type ComposerImageSettings } from "@/lib/composer/image-settings";

const QUALITY_VALUES = ["low", "standard", "high"] as const;

type SettingsRow = {
  user_id: string;
  image_quality: string | null;
};

function mapRow(row: SettingsRow | null): ComposerImageSettings {
  if (!row) return DEFAULT_COMPOSER_IMAGE_SETTINGS;
  const quality = coerceComposerImageQuality(row.image_quality) ?? DEFAULT_COMPOSER_IMAGE_SETTINGS.quality;
  return { quality };
}

export async function getComposerSettings(userId: string): Promise<ComposerImageSettings> {
  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_composer_settings")
    .select<SettingsRow>("user_id, image_quality")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error && result.error.code !== "PGRST116") {
    throw new Error(`composer.settings.fetch_failed: ${result.error.message}`);
  }

  return mapRow(result.data ?? null);
}

export async function updateComposerSettings(
  userId: string,
  updates: Partial<ComposerImageSettings>,
): Promise<ComposerImageSettings> {
  const payload: Record<string, string> = { user_id: userId };
  if (updates.quality && QUALITY_VALUES.includes(updates.quality)) {
    payload.image_quality = updates.quality;
  }

  const db = getDatabaseAdminClient();
  const result = await db
    .from("user_composer_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select<SettingsRow>("user_id, image_quality")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) {
    throw new Error(`composer.settings.update_failed: ${result.error.message}`);
  }

  return mapRow(result.data ?? null);
}

export const composerSettingsSchema = z.object({
  quality: z.enum(["low", "standard", "high"]),
});
