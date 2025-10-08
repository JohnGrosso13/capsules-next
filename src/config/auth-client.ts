"use client";

import { getClerkAuthClientAdapter } from "@/adapters/auth/clerk/client";
import type { AuthClientAdapter } from "@/ports/auth-client";

const authVendor = (
  process.env.NEXT_PUBLIC_AUTH_VENDOR ||
  process.env.AUTH_VENDOR ||
  "clerk"
).trim();

let adapter: AuthClientAdapter | null;

switch (authVendor) {
  case "clerk":
  case "":
    adapter = getClerkAuthClientAdapter();
    break;
  default:
    console.warn(`Unknown auth vendor "${authVendor}". Auth client adapter is disabled.`);
    adapter = null;
}

export function getAuthClientAdapter(): AuthClientAdapter | null {
  return adapter;
}

export function getAuthClientVendor(): string {
  return authVendor;
}
