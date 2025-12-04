import { getSupabaseServiceRoleAdapter } from "@/adapters/supabase/server";
import type { SupabaseServerAdapter } from "@/ports/supabase";

const rawVendor =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? process.env.SUPABASE_SERVER_VENDOR ?? process.env.SUPABASE_VENDOR
    : undefined;

const configuredVendor = (rawVendor ?? "supabase").trim().toLowerCase();

let adapter: SupabaseServerAdapter | null = null;

function resolveAdapter(): SupabaseServerAdapter {
  switch (configuredVendor) {
    case "supabase":
    case "":
      return getSupabaseServiceRoleAdapter();
    default:
      console.warn(`Unknown supabase server vendor "${configuredVendor}". Falling back to Supabase.`);
      return getSupabaseServiceRoleAdapter();
  }
}

export function getSupabaseServerAdapter(): SupabaseServerAdapter {
  if (!adapter) {
    adapter = resolveAdapter();
  }
  return adapter;
}

export function getSupabaseServerVendor(): string {
  return configuredVendor || "supabase";
}
