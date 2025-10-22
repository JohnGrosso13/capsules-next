import { getSupabaseDatabaseAdapter } from "@/adapters/database/supabase/admin";
import type { DatabaseAdapter, DatabaseClient } from "@/ports/database";

const configuredVendor = (process.env.DATABASE_VENDOR ?? "supabase").trim().toLowerCase();

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
