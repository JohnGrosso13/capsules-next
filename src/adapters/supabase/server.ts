import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseServerAdapter } from "@/ports/supabase";
import { serverEnv } from "@/lib/env/server";

let serviceClient: SupabaseClient | null = null;

class SupabaseServiceRoleAdapter implements SupabaseServerAdapter {
  vendor = "supabase";

  getServiceRoleClient(): SupabaseClient {
    if (!serviceClient) {
      if (!serverEnv.SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Supabase service role environment variables are not configured");
      }
      serviceClient = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return serviceClient;
  }
}

let cachedAdapter: SupabaseServerAdapter | null = null;

export function getSupabaseServiceRoleAdapter(): SupabaseServerAdapter {
  if (!cachedAdapter) {
    cachedAdapter = new SupabaseServiceRoleAdapter();
  }
  return cachedAdapter;
}
