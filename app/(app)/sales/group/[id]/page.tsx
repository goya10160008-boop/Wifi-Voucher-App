import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { shortManilaTime } from '@/lib/short-time';
import { VoucherCode } from '@/components/VoucherCode';
import { CopyAll } from '@/components/CopyAll';
import { ReceiptScreen } from '@/components/Receipt';

export default async function SaleGroupPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ new?: string; receipt?: string }>;
}) {
  const { supabase, role } = await requireRole('owner', 'staff');
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
  const total = sales.reduce((a, s) => a + s.price_centavos, 0);
  const live = sales.filter((s) => s.status === 'completed');
  const byPlan = new Map<string, number>();
  for (const s of sales) byPlan.set(s.plan_name, (byPlan.get(s.plan_name) ?? 0) + 1);
  const when = shortManilaTime(sales[0].created_at);

  return (
    <main className="flex flex-col gap-4">
      {isNew && live.length > 0 && <p role="status" className="alert alert-ok self-start font-semibold">Sale complete. Give these {live.length} codes to the guest.</p>}

      <Link href={`/sales/group/${id}?receipt=1`} className="btn">Show receipt</Link>

      <dl className="card grid grid-cols-2 gap-2">
        <dt className="text-mute">Vouchers</dt>
        <dd>{[...byPlan].map(([n, q]) => `${q} × ${n}`).join(', ')}</dd>
        <dt className="text-mute">Total</dt><dd>{formatPeso(total)}</dd>
        {tendered != null && <><dt className="text-mute">Cash / change</dt><dd>{formatPeso(tendered)} / {formatPeso(tendered - total)}</dd></>}
        <dt className="text-mute">Guest</dt><dd>{sales[0].buyer_name || '—'}</dd>
        <dt className="text-mute">Room</dt><dd>{sales[0].buyer_room || '—'}</dd>
        <dt className="text-mute">Sold</dt><dd>{when}</dd>
      </dl>

      {live.length > 1 && <CopyAll codes={live.map((s) => s.voucher_code)} />}

      <ul className="flex flex-col gap-4">
        {sales.map((s) => (
          <li key={s.id} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-mute">{s.seq}. {s.plan_name} · {formatPeso(s.price_centavos)}</p>
            {s.status === 'voided'
              ? <p role="status" className="alert alert-bad">VOIDED: {s.void_reason}. Code {s.voucher_code} is burned.</p>
              : <VoucherCode code={s.voucher_code} />}
            {role === 'owner' && s.status === 'completed' && (
              <Link href={`/sales/${s.id}`} className="btn btn-ghost">Details or void this code</Link>
            )}
          </li>
        ))}
      </ul>

      <Link href="/sell" className="btn btn-ghost">New sale</Link>
    </main>
  );
}
