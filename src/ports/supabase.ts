import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseServerAdapter {
  vendor: string;
  getServiceRoleClient(): SupabaseClient;
}

export interface SupabaseBrowserAdapter {
  vendor: string;
  getBrowserClient(): SupabaseClient;
}
