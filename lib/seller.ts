// Seller names for the owner's views. Names come from public.profiles (the owner can read all rows).
import type { createClient } from '@/lib/supabase/server';

export type NameMap = Map<string, string>;

export const nameMap = (rows: { user_id: string; display_name: string | null }[]): NameMap =>
  new Map(rows.map((r) => [r.user_id, r.display_name?.trim() ?? '']));

/** Display name, or "User ab12" (first 4 of the id) when there is no name or no profile. */
export const sellerLabel = (names: NameMap, id: string) => names.get(id) || `User ${id.slice(0, 4)}`;

/** One query for all distinct sellers on a page (no N+1). Throws on a database error. */
export async function loadNames(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<NameMap> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('profiles').select('user_id, display_name').in('user_id', unique);
  if (error) throw new Error('Could not load seller names. Please try again.');
  return nameMap(data ?? []);
}
