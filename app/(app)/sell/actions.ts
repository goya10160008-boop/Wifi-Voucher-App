'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { rpcMessage } from '@/lib/rpc-errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sell(input: {
  key: string; planId: string; tenderedCentavos: number; buyerName: string; buyerRoom: string;
}): Promise<{ error: string; code?: string }> {
  const { supabase } = await requireRole('owner', 'staff');
  const { key, planId, tenderedCentavos, buyerName, buyerRoom } = input;
  if (!UUID.test(key) || !UUID.test(planId)) return { error: 'Choose a plan.' };
  if (!Number.isSafeInteger(tenderedCentavos) || tenderedCentavos < 0 || tenderedCentavos > 100_000_000) {
    return { error: 'Enter the cash received.' };
  }
  if (buyerName.length > 80 || buyerRoom.length > 20) return { error: 'Name or room is too long.' };

  const { data, error } = await supabase.rpc('sell_voucher', {
    p_idempotency_key: key,
    p_plan_id: planId,
    p_tendered_centavos: tenderedCentavos,
    p_buyer_name: buyerName,
    p_buyer_room: buyerRoom,
  });
  if (error) {
    // A same-key retry racing the first call can see the last code locked and report
    // OUT_OF_STOCK although the first call is about to commit. Re-check by key.
    if (error.message === 'OUT_OF_STOCK') {
      const { data: existing } = await supabase.from('sales').select('id').eq('idempotency_key', key).maybeSingle();
      if (existing) redirect(`/sales/${existing.id}?new=1`);
    }
    return { error: rpcMessage(error), code: error.message };
  }
  revalidatePath('/');
  revalidatePath('/sales');
  redirect(`/sales/${data.id}?new=1`);
}
