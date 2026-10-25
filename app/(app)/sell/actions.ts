'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { rpcMessage } from '@/lib/rpc-errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sell(input: {
  key: string; planId: string; tenderedCentavos: number; buyerName: string; buyerRoom: string;
}): Promise<{ error: string }> {
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
  if (error) return { error: rpcMessage(error) };
  revalidatePath('/');
  revalidatePath('/sales');
  redirect(`/sales/${data.id}?new=1`);
}
