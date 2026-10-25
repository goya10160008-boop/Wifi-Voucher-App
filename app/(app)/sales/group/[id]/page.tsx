import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { loadNames, sellerLabel } from '@/lib/seller';
import { ReceiptScreen } from '@/components/Receipt';
import { SaleReceipt } from '../../SaleReceipt';

export default async function SaleGroupPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; receipt?: string }>;
}) {
  const { supabase, role, userId } = await requireRole('owner', 'staff');
  const { id } = await params;
  const { new: isNew, receipt } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: sales, error } = await supabase.from('sales').select('*').eq('group_id', id).order('seq');
  if (error) throw new Error('Could not load this sale. Please try again.');
  if (!sales?.length) notFound(); // RLS hides other staff's sales

  const { data: pays, error: payError } = await supabase.from('payments').select('sale_id, tendered_centavos').in('sale_id', sales.map((s) => s.id));
  if (payError) throw new Error('Could not load this sale. Please try again.');
  // The whole cash handed over is stored on the first code's payment.
  const tendered = pays?.find((p) => p.sale_id === sales[0].id)?.tendered_centavos ?? null;

  if (receipt === '1') {
    return <ReceiptScreen sales={sales} tendered={tendered} id={id} createdAt={sales[0].created_at}
      guest={sales[0].buyer_name} room={sales[0].buyer_room} backHref={`/sales/group/${id}`} />;
  }
  const soldBy = role === 'owner' ? sellerLabel(await loadNames(supabase, [sales[0].sold_by]), sales[0].sold_by) : null;
  return <SaleReceipt sales={sales} tendered={tendered} refId={id} isNew={isNew === '1'} role={role} userId={userId} soldBy={soldBy} />;
}
