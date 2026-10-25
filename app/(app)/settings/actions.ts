'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';

export async function saveThreshold(_p: { error?: string; ok?: boolean } | undefined, form: FormData) {
  const { supabase } = await requireRole('owner');
  const n = Number(form.get('threshold'));
  if (!Number.isInteger(n) || n < 0 || n > 10000) return { error: 'Enter a whole number from 0 to 10000.' };
  const { error } = await supabase.from('settings').update({ low_stock_threshold: n }).eq('id', true);
  if (error) return { error: 'Could not save. Please try again.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}
