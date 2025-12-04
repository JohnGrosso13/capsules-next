"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseBrowserAdapter } from "@/ports/supabase";
import { clientEnv } from "@/lib/env/client";

let browserClient: SupabaseClient | null = null;

class SupabaseBrowserClientAdapter implements SupabaseBrowserAdapter {
  vendor = "supabase";

  getBrowserClient(): SupabaseClient {
    if (!browserClient) {
      if (!clientEnv.SUPABASE_URL || !clientEnv.SUPABASE_ANON_KEY) {
        throw new Error("Supabase client environment variables are not configured");
      }
      browserClient = createClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY);
    }
    return browserClient;
  }
}

let cachedAdapter: SupabaseBrowserAdapter | null = null;

export function getSupabaseBrowserAdapter(): SupabaseBrowserAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new SupabaseBrowserClientAdapter();
  }
  return cachedAdapter;
}
