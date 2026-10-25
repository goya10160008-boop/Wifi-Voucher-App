import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { shortManilaTime } from '@/lib/short-time';
import { VoucherCode } from '@/components/VoucherCode';
import { ReceiptScreen } from '@/components/Receipt';
import { VoidForm } from '../VoidForm';

export default async function SalePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; receipt?: string }>;
}) {
  const { supabase, role } = await requireRole('owner', 'staff');
  const { id } = await params;
  const { new: isNew, receipt } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: sale } = await supabase.from('sales').select('*').eq('id', id).maybeSingle();
  if (!sale) notFound(); // RLS hides other staff's sales
  const { data: pay } = await supabase.from('payments').select('tendered_centavos').eq('sale_id', id).limit(1).maybeSingle();
  // For a code sold in a cart the cash covers the whole cart, so cash/change only make sense for a lone sale.
  const tendered = sale.group_id ? null : pay?.tendered_centavos ?? null;
  if (receipt === '1') {
    return <ReceiptScreen sales={[sale]} tendered={tendered} id={sale.group_id ?? sale.id} createdAt={sale.created_at}
      guest={sale.buyer_name} room={sale.buyer_room} backHref={`/sales/${sale.id}`} />;
  }
  const voided = sale.status === 'voided';
  const when = shortManilaTime(sale.created_at);

  return (
    <main className="flex flex-col gap-4">
      {isNew && !voided && <p role="status" className="alert alert-ok self-start font-semibold">Sale complete. Give this code to the guest.</p>}
      <Link href={`/sales/${sale.id}?receipt=1`} className="btn">Show receipt</Link>
      {voided
        ? <p role="status" className="alert alert-bad">VOIDED: {sale.void_reason}. Code {sale.voucher_code} is burned.</p>
        : <VoucherCode code={sale.voucher_code} />}
      <dl className="card grid grid-cols-2 gap-2">
        <dt className="text-mute">Plan</dt><dd>{sale.plan_name} ({sale.duration_minutes / 60}h)</dd>
        <dt className="text-mute">Price</dt><dd>{formatPeso(sale.price_centavos)}</dd>
        {tendered !== null && <><dt className="text-mute">Cash / change</dt><dd>{formatPeso(tendered)} / {formatPeso(tendered - sale.price_centavos)}</dd></>}
        <dt className="text-mute">Guest</dt><dd>{sale.buyer_name || '—'}</dd>
        <dt className="text-mute">Room</dt><dd>{sale.buyer_room || '—'}</dd>
        <dt className="text-mute">Sold</dt><dd>{when}</dd>
      </dl>
      {sale.group_id && <Link href={`/sales/group/${sale.group_id}`} className="btn btn-ghost">See all codes sold together</Link>}
      {role === 'owner' && !voided && <VoidForm id={sale.id} />}
      <Link href="/sell" className="btn btn-ghost">New sale</Link>
    </main>
  );
}
