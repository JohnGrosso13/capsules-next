"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserAdapter } from "@/config/supabase-browser";

let client: SupabaseClient | null = null;

export function getBrowserSupabaseClient() {
  if (!client) {
    client = getSupabaseBrowserAdapter().getBrowserClient();
  }
  return client;
}
