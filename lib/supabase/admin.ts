import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/**
 * Service-role client (bypasses RLS). Used ONLY inside pinLogin, after user_pin_verify has said the PIN is right.
 * The key is a Worker secret / .env.local value, never NEXT_PUBLIC_, never sent to the browser.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
