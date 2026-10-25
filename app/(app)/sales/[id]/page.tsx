import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { loadNames, sellerLabel } from '@/lib/seller';
import { ReceiptScreen } from '@/components/Receipt';
import { SaleReceipt } from '../SaleReceipt';

// A sale that is part of a receipt shows that receipt (every code sold together). Only an old sale with no
// receipt of its own is shown here, as a receipt of one code.
export default async function SalePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; receipt?: string }>;
}) {
  const { supabase, role, userId } = await requireRole('owner', 'staff');
  const { id } = await params;
  const { new: isNew, receipt } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: sale } = await supabase.from('sales').select('*').eq('id', id).maybeSingle();
  if (!sale) notFound(); // RLS hides other staff's sales
  if (sale.group_id) {
    const q = new URLSearchParams({ ...(isNew === '1' ? { new: '1' } : {}), ...(receipt === '1' ? { receipt: '1' } : {}) }).toString();
    redirect(`/sales/group/${sale.group_id}${q ? `?${q}` : ''}`);
  }
  const { data: pay } = await supabase.from('payments').select('tendered_centavos').eq('sale_id', id).limit(1).maybeSingle();
  const tendered = pay?.tendered_centavos ?? null;

  if (receipt === '1') {
    return <ReceiptScreen sales={[sale]} tendered={tendered} id={sale.id} createdAt={sale.created_at}
      guest={sale.buyer_name} room={sale.buyer_room} backHref={`/sales/${sale.id}`} />;
  }
  const soldBy = role === 'owner' ? sellerLabel(await loadNames(supabase, [sale.sold_by]), sale.sold_by) : null;
  return <SaleReceipt sales={[sale]} tendered={tendered} refId={sale.id} isNew={isNew === '1'} role={role} userId={userId} soldBy={soldBy} />;
}
