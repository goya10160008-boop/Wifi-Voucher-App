import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';

/** Writes a session event to the activity log. Never throws: a log problem must not block sign-in, sign-out or a download. */
export async function recordEvent(
  supabase: SupabaseClient<Database>,
  action: 'login' | 'logout' | 'idle_signout' | 'csv_export',
  detail: Json = {},
) {
  try {
    await supabase.rpc('record_event', { p_action: action, p_detail: detail });
  } catch {
    /* ignored on purpose */
  }
}
