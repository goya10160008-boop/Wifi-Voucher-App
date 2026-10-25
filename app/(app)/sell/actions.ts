'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { MAX_VOUCHERS } from '@/lib/cart';
import { rpcMessage } from '@/lib/rpc-errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sell(input: {
  key: string; items: { planId: string; qty: number }[]; tenderedCentavos: number; buyerName: string; buyerRoom: string;
}): Promise<{ error: string; code?: string }> {
  const { supabase } = await requireRole('owner', 'staff');
  const { key, items, tenderedCentavos, buyerName, buyerRoom } = input;
  if (!UUID.test(key) || !Array.isArray(items) || items.length < 1 || items.length > MAX_VOUCHERS
    || items.some((i) => !UUID.test(String(i?.planId)) || !Number.isInteger(i?.qty) || i.qty < 1 || i.qty > MAX_VOUCHERS)) {
    return { error: 'Choose at least one plan.' };
  }
  if (items.reduce((a, i) => a + i.qty, 0) > MAX_VOUCHERS) return { error: rpcMessage({ message: 'CART_TOO_BIG' }) };
  if (!Number.isSafeInteger(tenderedCentavos) || tenderedCentavos < 0 || tenderedCentavos > 100_000_000) {
    return { error: 'Enter the cash received.' };
  }
  if (typeof buyerName !== 'string' || typeof buyerRoom !== 'string' || buyerName.length > 80 || buyerRoom.length > 20) {
    return { error: 'Name or room is too long.' };
  }

  const { data, error } = await supabase.rpc('sell_cart', {
    p_group_key: key,
    p_items: items.map((i) => ({ plan_id: i.planId, qty: i.qty })),
    p_tendered_centavos: tenderedCentavos,
    p_buyer_name: buyerName,
    p_buyer_room: buyerRoom,
  });
  if (error) {
    // PGRST202: the function does not exist yet because migration 0002 was not applied.
    if (error.code === 'PGRST202') return { error: 'The database is missing the cart update (migration 0002). Ask your developer to apply it.' };
    return { error: rpcMessage(error), code: error.message };
  }
  revalidatePath('/');
  revalidatePath('/sales');
  // One code goes straight to its sale page; several go to the group page showing every code.
  redirect(data.length === 1 ? `/sales/${data[0].id}?new=1` : `/sales/group/${key}?new=1`);
}
