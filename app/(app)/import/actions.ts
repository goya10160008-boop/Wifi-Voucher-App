'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { rpcMessage } from '@/lib/rpc-errors';

export type ImportResult =
  | { error: string }
  | { inserted: number; skippedDuplicate: number; skippedInvalid: number };

export async function importCodes(planId: string, codes: string[]): Promise<ImportResult> {
  const { supabase } = await requireRole('owner');
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return { error: 'Choose a plan.' };
  if (!Array.isArray(codes) || codes.length === 0) return { error: 'No codes to import.' };
  if (codes.length > 5000 || codes.some((c) => typeof c !== 'string' || c.length > 64)) {
    return { error: rpcMessage({ message: 'TOO_MANY_CODES' }) };
  }
  const { data, error } = await supabase.rpc('import_vouchers', { p_plan_id: planId, p_codes: codes });
  if (error) return { error: rpcMessage(error) };
  const r = data?.[0];
  revalidatePath('/');
  return { inserted: r?.inserted ?? 0, skippedDuplicate: r?.skipped_duplicate ?? 0, skippedInvalid: r?.skipped_invalid ?? 0 };
}
