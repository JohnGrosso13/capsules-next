import { normalizeMediaUrl } from "@/lib/media";
import { resolveToAbsoluteUrl } from "@/lib/url";
import { serverEnv } from "@/lib/env/server";

import type { CapsuleMemberUiRole } from "../roles";
import { isCapsuleMemberUiRole } from "../roles";
import { findCapsuleById } from "../repository";

const REQUEST_MESSAGE_MAX_LENGTH = 500;

export class CapsuleMembershipError extends Error {
  constructor(
    public code: "not_found" | "forbidden" | "conflict" | "invalid",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function normalizeOptionalString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) return null;
    return trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value && typeof value === "object" && "toString" in value) {
    try {
      const converted = String(value);
      const trimmed = converted.trim();
      return trimmed.length ? trimmed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function normalizeId(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  const trimmed = normalized.trim();
  if (!trimmed.length) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function normalizeMemberRole(value: unknown): CapsuleMemberUiRole {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new CapsuleMembershipError("invalid", "Invalid capsule role.", 400);
  }
  const lower = normalized.toLowerCase();
  if (!isCapsuleMemberUiRole(lower)) {
    throw new CapsuleMembershipError("invalid", "Invalid capsule role.", 400);
  }
  return lower as CapsuleMemberUiRole;
}

export function normalizeRequestMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  return trimmed.slice(0, REQUEST_MESSAGE_MAX_LENGTH);
}

export function resolveCapsuleMediaUrl(
  value: string | null,
  originOverride?: string | null,
): string | null {
  const normalized = normalizeMediaUrl(value);
  if (!normalized) return null;
  const origin = originOverride ?? serverEnv.SITE_URL;
  return resolveToAbsoluteUrl(normalized, origin) ?? normalized;
}

export async function requireCapsule(capsuleId: string) {
  const capsule = await findCapsuleById(capsuleId);
  if (!capsule?.id) {
    throw new CapsuleMembershipError("not_found", "Capsule not found.", 404);
  }
  const ownerId = normalizeId(capsule.created_by_id);
  if (!ownerId) {
    throw new Error("capsules.membership: capsule missing owner identifier");
  }
  return { capsule, ownerId };
}

export async function requireCapsuleOwnership(capsuleId: string, ownerId: string) {
  const normalizedOwnerId = normalizeId(ownerId);
  if (!normalizedOwnerId) {
    throw new CapsuleMembershipError("forbidden", "Authentication required.", 403);
  }
  const { capsule, ownerId: capsuleOwnerId } = await requireCapsule(capsuleId);
  if (capsuleOwnerId !== normalizedOwnerId) {
    throw new CapsuleMembershipError(
      "forbidden",
      "You do not have permission to manage this capsule.",
      403,
    );
  }
  return { capsule, ownerId: capsuleOwnerId };
}
