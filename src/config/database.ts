import { getSupabaseDatabaseAdapter } from "@/adapters/database/supabase/admin";
import type { DatabaseAdapter, DatabaseClient } from "@/ports/database";

const rawDatabaseVendor =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? process.env.DATABASE_VENDOR
    : undefined;

const configuredVendor = (rawDatabaseVendor ?? "supabase").trim().toLowerCase();

let adapter: DatabaseAdapter | null = null;

switch (configuredVendor) {
  case "supabase":
  case "":
    adapter = getSupabaseDatabaseAdapter();
    break;
  default:
    console.warn(
      `Unknown database vendor "${configuredVendor}". Falling back to Supabase implementation.`,
    );
    adapter = getSupabaseDatabaseAdapter();
    break;
}

export function getDatabaseAdminClient(): DatabaseClient {
  return adapter!.getAdminClient();
}

export function getDatabaseVendor(): string {
  return adapter!.getVendor();
}
