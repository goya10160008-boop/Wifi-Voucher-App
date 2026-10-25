'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { rpcMessage } from '@/lib/rpc-errors';

export async function voidSale(_p: { error?: string } | undefined, form: FormData): Promise<{ error?: string } | undefined> {
  const { supabase } = await requireRole('owner');
  const id = String(form.get('id') ?? '');
  const reason = String(form.get('reason') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Bad sale id.' };
  if (reason.length < 3 || reason.length > 200) return { error: 'Reason must be 3 to 200 characters.' };
  const { error } = await supabase.rpc('void_sale', { p_sale_id: id, p_reason: reason });
  if (error) return { error: rpcMessage(error) };
  revalidatePath('/', 'layout');
  return undefined;
}
