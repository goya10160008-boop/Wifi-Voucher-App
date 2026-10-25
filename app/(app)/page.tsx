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
      <h1 className="text-2xl font-bold">Hi{name ? `, ${name}` : ''}</h1>
      {low.length > 0 && (
        <p role="alert" className="rounded-lg bg-amber-100 p-3 text-amber-900">
          Low stock: {low.map((p) => `${p.plan_name} (${p.available})`).join(', ')}.{' '}
          {role === 'owner' ? <Link href="/import" className="underline">Import more codes</Link> : 'Tell the owner.'}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-xl border border-gray-300 p-3"><p className="text-sm text-gray-600">Today</p><p className="text-xl font-bold">{formatPeso(d.pesos)}</p><p className="text-sm">{d.count} sales</p></section>
        <section className="rounded-xl border border-gray-300 p-3"><p className="text-sm text-gray-600">This month</p><p className="text-xl font-bold">{formatPeso(m.pesos)}</p><p className="text-sm">{m.count} sales</p></section>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stock?.map((p) => (
          <Link key={p.plan_id} href={`/sell?plan=${p.plan_id}`} aria-disabled={p.available === 0}
            className={`flex min-h-24 flex-col justify-center rounded-xl bg-blue-700 p-3 text-white ${p.available === 0 ? 'pointer-events-none opacity-40' : ''}`}>
            <span className="text-lg font-semibold">Sell {p.plan_name}</span>
            <span>{formatPeso(p.price_centavos)} · {p.available} left</span>
          </Link>
        ))}
        {!stock?.length && <p className="col-span-2">{role === 'owner' ? <Link href="/plans" className="underline">Create your first plan</Link> : 'No plans yet.'}</p>}
      </div>
    </main>
  );
}
