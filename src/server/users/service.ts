import { indexMemory } from "@/server/memories/service";
import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";
import { enforceSafeText } from "@/server/moderation/text";

import {
  findUserById,
  updateUserAvatar,
  updateUserProfileFields,
} from "./repository";

type BannerCrop = {
  offsetX: number;
  offsetY: number;
};

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

const MAX_DISPLAY_NAME_LENGTH = 80;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveProfileMediaUrl(
  value: string | null,
  originOverride?: string | null,
): string | null {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return null;
  const origin = originOverride ?? serverEnv.SITE_URL;
  return resolveToAbsoluteUrl(normalized, origin) ?? normalized;
}

async function requireUser(userId: string) {
  const user = await findUserById(userId);
  if (!user?.id) {
    throw new Error("users.service: user not found");
  }
  return user;
}

export async function getUserProfileSummary(
  userId: string,
  options: { origin?: string | null } = {},
): Promise<{
  id: string;
  key: string | null;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string | null;
}> {
  const user = await requireUser(userId);
  const resolvedId =
    typeof user.id === "number" ? String(user.id) : typeof user.id === "string" ? user.id : "";
  return {
    id: resolvedId,
    key: normalizeOptionalString(user.user_key ?? null),
    name: normalizeOptionalString(user.full_name ?? null),
    avatarUrl: resolveProfileMediaUrl(user.avatar_url ?? null, options.origin ?? null),
    bio: normalizeOptionalString(user.bio ?? null),
    joinedAt: normalizeOptionalString(user.created_at ?? null),
  };
}

export async function updateUserProfile(
  ownerId: string,
  updates: { name?: string | null; bio?: string | null },
): Promise<{ name: string | null; bio: string | null }> {
  await requireUser(ownerId);
  const normalizedName =
    Object.prototype.hasOwnProperty.call(updates, "name") && updates.name !== undefined
      ? normalizeOptionalString(updates.name)
      : undefined;
  const collapsedName =
    typeof normalizedName === "string" ? collapseWhitespace(normalizedName) : normalizedName;
  if (collapsedName && collapsedName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
  }

  const normalizedBio =
    Object.prototype.hasOwnProperty.call(updates, "bio") && updates.bio !== undefined
      ? limitBio(updates.bio)
      : undefined;

  const payload: { fullName?: string | null; bio?: string | null } = {};
  if (collapsedName !== undefined) {
    payload.fullName = collapsedName ?? null;
  }
  if (normalizedBio !== undefined) {
    payload.bio = normalizedBio;
  }
  if (!Object.keys(payload).length) {
    return {
      name: collapsedName ?? null,
      bio: normalizedBio ?? null,
    };
  }

  const safetyChecks: Array<{ value: string; field: "name" | "bio"; maxChars: number }> = [];
  if (typeof collapsedName === "string" && collapsedName.trim().length) {
    safetyChecks.push({ value: collapsedName, field: "name", maxChars: MAX_DISPLAY_NAME_LENGTH });
  }
  if (typeof normalizedBio === "string" && normalizedBio.trim().length) {
    safetyChecks.push({ value: normalizedBio, field: "bio", maxChars: MAX_BIO_LENGTH });
  }
  for (const check of safetyChecks) {
    await enforceSafeText(check.value, { kind: "profile", maxChars: check.maxChars });
  }

  const updated = await updateUserProfileFields({ userId: ownerId, ...payload });
  if (!updated) {
    throw new Error("Failed to update profile settings.");
  }

  return { name: collapsedName ?? null, bio: normalizedBio ?? null };
}

const MAX_BIO_LENGTH = 560;

function limitBio(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = collapseWhitespace(String(value));
  if (!normalized.length) return null;
  if (normalized.length <= MAX_BIO_LENGTH) return normalized;
  return normalized.slice(0, MAX_BIO_LENGTH).trimEnd();
}

export async function updateUserAvatarImage(
  ownerId: string,
  params: {
    avatarUrl: string;
    storageKey?: string | null;
    mimeType?: string | null;
    crop?: BannerCrop | null;
    source?: string | null;
    originalUrl?: string | null;
    originalName?: string | null;
    prompt?: string | null;
    width?: number | null;
    height?: number | null;
    memoryId?: string | null;
  },
  context: { origin?: string | null } = {},
): Promise<{ avatarUrl: string | null }> {
  const user = await requireUser(ownerId);

  const normalizedUrl = normalizeOptionalString(params.avatarUrl ?? null);
  if (!normalizedUrl) {
    throw new Error("A profile avatar URL is required.");
  }

  const resolvedAvatarUrl = resolveProfileMediaUrl(normalizedUrl, context.origin ?? null);
  if (!resolvedAvatarUrl) {
    throw new Error("Failed to resolve profile avatar URL.");
  }

  const updated = await updateUserAvatar({
    userId: ownerId,
    avatarUrl: resolvedAvatarUrl,
  });

  if (!updated) {
    throw new Error("Failed to update profile avatar.");
  }

  const profileName = normalizeOptionalString(user.full_name ?? null) ?? "your profile";
  const originalName = normalizeOptionalString(params.originalName ?? null);
  const memoryTitle = originalName ? `${originalName} avatar` : `Avatar for ${profileName}`;

  const savedAtIso = new Date().toISOString();
  const baseDescription = `Custom avatar saved for ${profileName} on ${savedAtIso}.`;
  const promptText = normalizeOptionalString(params.prompt ?? null);
  const description = promptText ? `${baseDescription} Prompt: ${promptText}` : baseDescription;

  const metadata: Record<string, string | number | boolean> = {
    user_id: ownerId,
    asset_variant: "avatar",
    asset_ratio: "1:1",
  };

  if (params.storageKey) metadata.storage_key = params.storageKey;
  if (params.source) metadata.source_kind = params.source;
  const resolvedOriginalUrl = resolveProfileMediaUrl(
    normalizeOptionalString(params.originalUrl ?? null),
    context.origin ?? null,
  );
  if (resolvedOriginalUrl) metadata.original_url = resolvedOriginalUrl;
  if (promptText) metadata.prompt = promptText;
  if (params.width) metadata.width = params.width;
  if (params.height) metadata.height = params.height;
  if (params.originalName) metadata.original_name = params.originalName;
  if (params.mimeType) metadata.mime_type = params.mimeType;
  const normalizedMemoryId = normalizeOptionalString(params.memoryId ?? null);
  if (normalizedMemoryId) metadata.memory_id = normalizedMemoryId;
  if (params.crop) {
    if (Number.isFinite(params.crop.offsetX)) {
      metadata.crop_offset_x = Number(params.crop.offsetX.toFixed(4));
    }
    if (Number.isFinite(params.crop.offsetY)) {
      metadata.crop_offset_y = Number(params.crop.offsetY.toFixed(4));
    }
  }

  await indexMemory({
    ownerId,
    kind: "upload",
    mediaUrl: resolvedAvatarUrl,
    mediaType: normalizeOptionalString(params.mimeType ?? null) ?? "image/jpeg",
    title: memoryTitle,
    description,
    postId: null,
    metadata: Object.keys(metadata).length ? metadata : null,
    rawText: description,
    source: "profile_avatar",
    tags: ["profile", "avatar", profileName],
    eventAt: savedAtIso,
  });

  return { avatarUrl: resolvedAvatarUrl };
}

export async function clearUserAvatar(ownerId: string): Promise<{ avatarUrl: null }> {
  await requireUser(ownerId);
  const updated = await updateUserAvatar({ userId: ownerId, avatarUrl: null });
  if (!updated) {
    throw new Error("Failed to clear profile avatar.");
  }
  return { avatarUrl: null };
}
