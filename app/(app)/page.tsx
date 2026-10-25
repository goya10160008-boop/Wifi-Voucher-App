import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { manilaDateOf, manilaMonthStart } from '@/lib/manila';

export default async function Home() {
  const { supabase, role, name } = await requireUser();
  if (!role) return null; // layout shows "No access"
  const today = manilaDateOf();
  const [{ data: stock }, { data: day }, { data: month }] = await Promise.all([
    supabase.rpc('plan_stock'),
    supabase.rpc('sales_totals', { p_from: today, p_to: today, p_grain: 'day' }),
    supabase.rpc('sales_totals', { p_from: manilaMonthStart(today), p_to: today, p_grain: 'month' }),
  ]);
  const sum = (rows: { total_centavos: number; sale_count: number }[] | null) => ({
    pesos: (rows ?? []).reduce((a, r) => a + Number(r.total_centavos), 0),
    count: (rows ?? []).reduce((a, r) => a + Number(r.sale_count), 0),
  });
  const d = sum(day);
  const m = sum(month);
  const low = stock?.filter((p) => p.low_stock) ?? [];

  return (
    <main className="flex flex-col gap-5">
      <div>
        <p className="text-mute">Good day{name ? `, ${name}` : ''}</p>
        <h1 className="h1">A&amp;B WiFi</h1>
      </div>
      {low.length > 0 && (
        <p role="alert" className="alert alert-warn">
          Low stock: {low.map((p) => `${p.plan_name} (${p.available} left)`).join(', ')}.{' '}
          {role === 'owner' ? <Link href="/import" className="font-semibold underline">Import more codes</Link> : 'Tell the owner.'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <section className="card flex flex-col"><span className="text-sm text-mute">Today</span><b className="text-[22px]">{formatPeso(d.pesos)}</b><span className="text-sm text-mute">{d.count} sales</span></section>
        <section className="card flex flex-col"><span className="text-sm text-mute">This month</span><b className="text-[22px]">{formatPeso(m.pesos)}</b><span className="text-sm text-mute">{m.count} sales</span></section>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stock?.map((p) => (
          <Link key={p.plan_id} href={`/sell?plan=${p.plan_id}`} aria-disabled={p.available === 0}
            className="tile last:odd:col-span-2 last:odd:min-h-[92px]">
            <b>Sell {p.plan_name}</b>
            <span className="text-sm">{formatPeso(p.price_centavos)} · {p.available} left</span>
          </Link>
        ))}
        {!stock?.length && <p className="col-span-2">{role === 'owner' ? <Link href="/plans" className="font-semibold underline">Create your first plan</Link> : 'No plans yet.'}</p>}
      </div>
    </main>
  );
}
