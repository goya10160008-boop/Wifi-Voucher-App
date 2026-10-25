'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { pinProblem } from '@/lib/pin';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type State = { error?: string; ok?: boolean } | undefined;

export async function setStaffPin(_p: State, form: FormData): Promise<State> {
  const { supabase } = await requireRole('owner');
  const user = String(form.get('user') ?? '');
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const pin = String(form.get('pin') ?? '');
  if (!UUID.test(user)) return { error: 'Staff member not found.' };
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return { error: 'Username: 3 to 20 letters, numbers or _.' };
  const problem = pinProblem(pin, 'staff');
  if (problem) return { error: problem };
  const { error } = await supabase.rpc('set_user_pin', { p_user: user, p_username: username, p_pin: pin });
  if (error?.code === '23505') return { error: 'That username is already taken.' };
  if (error) return { error: 'Could not save the PIN. Please try again.' };
  revalidatePath('/staff');
  return { ok: true };
}

export async function unlockStaffPin(form: FormData) {
  const { supabase } = await requireRole('owner');
  const user = String(form.get('user') ?? '');
  if (!UUID.test(user)) return;
  const { error } = await supabase.rpc('unlock_user_pin', { p_user: user });
  if (error) throw new Error('Could not unlock.');
  revalidatePath('/staff');
}

export async function setStaffActive(form: FormData) {
  const { supabase } = await requireRole('owner');
  const user = String(form.get('user') ?? '');
  if (!UUID.test(user)) return;
  const { error } = await supabase.rpc('set_staff_active', { p_user: user, p_active: form.get('active') === 'true' });
  if (error) throw new Error('Could not update the staff member.');
  revalidatePath('/staff');
}
