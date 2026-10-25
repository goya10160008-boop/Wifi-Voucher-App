'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { rpcMessage } from '@/lib/rpc-errors';
import { REASONS, voidInput } from '@/lib/void-reasons';

type State = { error?: string; ok?: boolean } | undefined;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Void a whole receipt (all its live codes) with one reason. Owner Test puts the codes back on sale (checked in the database). */
export async function voidReceipt(_p: State, form: FormData): Promise<State> {
  const { supabase } = await requireRole('owner');
  const ref = String(form.get('ref') ?? '');
  if (!UUID.test(ref)) return { error: 'Receipt not found.' };
  const v = voidInput(String(form.get('reason') ?? ''), String(form.get('note') ?? ''), String(form.get('typed') ?? ''));
  if (!v.ok) return { error: v.error };
  const { error } = await supabase.rpc('void_receipt', { p_ref: ref, p_reason_code: v.code, p_note: v.note });
  if (error) return { error: rpcMessage(error) };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Void ONE code of a receipt (a code that did not work). Never Owner Test: that is for a whole receipt. */
export async function voidSale(_p: State, form: FormData): Promise<State> {
  const { supabase } = await requireRole('owner');
  const id = String(form.get('id') ?? '');
  if (!UUID.test(id)) return { error: 'Code not found.' };
  const v = voidInput(String(form.get('reason') ?? ''), String(form.get('note') ?? ''), '', { single: true });
  if (!v.ok) return { error: v.error };
  const label = v.code === 'other' ? v.note! : REASONS.find((r) => r.code === v.code)!.label;
  const { error } = await supabase.rpc('void_sale', { p_sale_id: id, p_reason: label });
  if (error) return { error: rpcMessage(error) };
  revalidatePath('/', 'layout');
  return { ok: true };
}
