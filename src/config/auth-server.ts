import "server-only";

import { clerkAuthServerAdapter } from "@/adapters/auth/clerk/server";
import type { AuthServerAdapter } from "@/ports/auth";

const authVendorEnv =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? process.env.AUTH_VENDOR
    : undefined;

const authVendor = authVendorEnv?.trim() || "clerk";

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
