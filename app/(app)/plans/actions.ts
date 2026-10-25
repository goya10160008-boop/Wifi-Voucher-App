'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { pesosToCentavos } from '@/lib/money';

type State = { error?: string; ok?: boolean } | undefined;

function parsePlan(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const minutes = Number(form.get('hours')) * 60;
  const price = pesosToCentavos(String(form.get('price') ?? ''));
  const sort = Number(form.get('sort_order') || 0);
  if (!name || name.length > 60) return { error: 'Name is required (max 60 characters).' } as const;
  if (!Number.isInteger(minutes) || minutes <= 0) return { error: 'Hours must be a whole number above 0.' } as const;
  if (price === null || price > 10_000_000) return { error: 'Enter a valid price, like 20 or 20.50.' } as const;
  if (!Number.isInteger(sort) || Math.abs(sort) > 10_000) return { error: 'Sort order must be a whole number.' } as const;
  return { row: { name, duration_minutes: minutes, price_centavos: price, sort_order: sort } } as const;
}

const dbError = (e: { code?: string }) =>
  e.code === '23505' ? 'A plan with that name already exists.' : 'Could not save. Please try again.';

export async function createPlan(_p: State, form: FormData): Promise<State> {
  const { supabase } = await requireRole('owner');
  const parsed = parsePlan(form);
  if ('error' in parsed) return { error: parsed.error };
  const { error } = await supabase.from('plans').insert(parsed.row);
  if (error) return { error: dbError(error) };
  revalidatePath('/plans');
  return { ok: true };
}

export async function updatePlan(_p: State, form: FormData): Promise<State> {
  const { supabase } = await requireRole('owner');
  const id = String(form.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Bad plan id.' };
  const parsed = parsePlan(form);
  if ('error' in parsed) return { error: parsed.error };
  const { error } = await supabase.from('plans').update(parsed.row).eq('id', id);
  if (error) return { error: dbError(error) };
  revalidatePath('/plans');
  return { ok: true };
}

export async function setPlanActive(form: FormData) {
  const { supabase } = await requireRole('owner');
  const id = String(form.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  await supabase.from('plans').update({ active: form.get('active') === 'true' }).eq('id', id);
  revalidatePath('/plans');
}
