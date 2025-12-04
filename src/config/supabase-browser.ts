"use client";

import { getSupabaseBrowserAdapter as getSupabaseBrowserAdapterImpl } from "@/adapters/supabase/browser";
import type { SupabaseBrowserAdapter } from "@/ports/supabase";

const rawVendor =
  typeof process !== "undefined" && process && typeof process.env === "object"
    ? (process.env.NEXT_PUBLIC_SUPABASE_VENDOR as string | undefined)
    : undefined;

const configuredVendor = (rawVendor ?? "supabase").trim().toLowerCase();

let adapter: SupabaseBrowserAdapter | null = null;

function resolveAdapter(): SupabaseBrowserAdapter {
  switch (configuredVendor) {
    case "supabase":
    case "":
      return getSupabaseBrowserAdapterImpl();
    default:
      console.warn(
        `Unknown supabase browser vendor "${configuredVendor}". Falling back to Supabase.`,
      );
      return getSupabaseBrowserAdapterImpl();
  }
}

export function getSupabaseBrowserAdapter(): SupabaseBrowserAdapter {
  if (!adapter) {
    adapter = resolveAdapter();
  }
  return adapter;
}

export function getSupabaseBrowserVendor(): string {
  return configuredVendor || "supabase";
}
