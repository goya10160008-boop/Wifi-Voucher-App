import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Role = 'owner' | 'staff';

/** Verified user id + role, or null. Role comes from profiles (RLS: users read their own row). */
export async function getSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('user_id', userId)
    .eq('active', true)
    .maybeSingle();
  return { supabase, userId, role: (profile?.role ?? null) as Role | null, name: profile?.display_name ?? null };
}

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

/** Pages and Server Actions call this; non-matching roles get a 404 (spec section 5). */
export async function requireRole(...roles: Role[]) {
  const s = await requireUser();
  if (!s.role || !roles.includes(s.role)) notFound();
  return s as typeof s & { role: Role };
}
