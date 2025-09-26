import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { serverEnv } from '../env/server';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (!cachedClient) {
    cachedClient = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return cachedClient;
}
