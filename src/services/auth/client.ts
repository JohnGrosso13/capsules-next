"use client";

import { getAuthClientAdapter, getAuthClientVendor } from "@/config/auth-client";
import type { AuthClientAdapter, AuthClientState } from "@/ports/auth-client";

export type { AuthClientState, AuthClientUser } from "@/ports/auth-client";

function fallbackState(): AuthClientState {
  return { user: null, isLoaded: true };
}

function requireAdapter(): AuthClientAdapter {
  const adapter = getAuthClientAdapter();
  if (!adapter) {
    throw new Error("Auth client adapter is not configured");
  }
  return adapter;
}

export function useCurrentUser(): AuthClientState {
  try {
    return requireAdapter().useCurrentUser();
  } catch (error) {
    console.error("useCurrentUser failed", error);
    return fallbackState();
  }
}

export function getAuthClientVendorName(): string {
  return getAuthClientVendor();
}
