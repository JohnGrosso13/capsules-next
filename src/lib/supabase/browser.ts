'use client';

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

import { clientEnv } from '../env/client';

let client: SupabaseClient | null = null;

export function getBrowserSupabaseClient() {
  if (!client) {
    if (!clientEnv.SUPABASE_URL || !clientEnv.SUPABASE_ANON_KEY) {
      throw new Error('Supabase client environment variables are not configured');
    }
    client = createClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY);
  }
  return client;
}
