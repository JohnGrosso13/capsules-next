import "server-only";

import { clerkAuthServerAdapter } from "@/adapters/auth/clerk/server";
import type { AuthServerAdapter } from "@/ports/auth";

const authVendor = process.env.AUTH_VENDOR?.trim() || "clerk";

let adapter: AuthServerAdapter | null;

switch (authVendor) {
  case "clerk":
  case "":
    adapter = clerkAuthServerAdapter;
    break;
  default:
    console.warn(`Unknown auth vendor "${authVendor}". Auth server adapter is disabled.`);
    adapter = null;
}

export function getAuthServerAdapter(): AuthServerAdapter | null {
  return adapter;
}

export function getAuthServerVendor(): string {
  return authVendor;
}
