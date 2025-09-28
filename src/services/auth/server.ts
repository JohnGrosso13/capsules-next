import "server-only";

import { getAuthServerAdapter, getAuthServerVendor } from "@/config/auth-server";
import type {
  AuthServerAdapter,
  EnsureUserOptions,
  IncomingUserPayload,
  NormalizedProfile,
} from "@/ports/auth";

function requireAdapter(): AuthServerAdapter {
  const adapter = getAuthServerAdapter();
  if (!adapter) {
    throw new Error("Auth server adapter is not configured");
  }
  return adapter;
}

export type { IncomingUserPayload, NormalizedProfile, EnsureUserOptions } from "@/ports/auth";

export function mergeUserPayloadFromRequest(
  req: Request,
  basePayload?: IncomingUserPayload | null,
): IncomingUserPayload {
  return requireAdapter().mergeUserPayloadFromRequest(req, basePayload);
}

export function normalizeProfileFromPayload(
  payload?: IncomingUserPayload | null,
): NormalizedProfile | null {
  return requireAdapter().normalizeProfileFromPayload(payload);
}

export async function ensureUserFromRequest(
  req: Request,
  basePayload?: IncomingUserPayload | null,
  options?: EnsureUserOptions,
): Promise<string | null> {
  return requireAdapter().ensureUserFromRequest(req, basePayload, options);
}

export async function resolveUserKey(payload: IncomingUserPayload): Promise<string | null> {
  return requireAdapter().resolveUserKey(payload);
}

export async function isAdminRequest(
  req: Request,
  payload: IncomingUserPayload = {},
  supabaseUserId: string | null = null,
): Promise<boolean> {
  const adapter = getAuthServerAdapter();
  if (!adapter?.isAdminRequest) return false;
  return adapter.isAdminRequest(req, payload, supabaseUserId);
}

export function getAuthVendor(): string {
  return getAuthServerVendor();
}
