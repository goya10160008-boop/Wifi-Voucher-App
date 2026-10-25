import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { durationLabel } from '@/lib/duration';
import { formatPeso } from '@/lib/money';
import { manilaDateOf, manilaMonthStart } from '@/lib/manila';

export default async function Home() {
  const { supabase, role, name } = await requireUser();
  if (!role) return null; // layout shows "No access"
  const today = manilaDateOf();
  const [{ data: stock, error: e1 }, { data: day, error: e2 }, { data: month, error: e3 }] = await Promise.all([
    supabase.rpc('plan_stock'),
    supabase.rpc('sales_totals', { p_from: today, p_to: today, p_grain: 'day' }),
    supabase.rpc('sales_totals', { p_from: manilaMonthStart(today), p_to: today, p_grain: 'month' }),
  ]);
  if (e1 || e2 || e3) throw new Error('Could not load the dashboard. Please try again.');
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
      <h2 className="text-[17px] font-bold">Tap a plan to sell</h2>
      <div className="menu">
        {stock?.map((p) => {
          const out = p.available === 0;
          return (
            <Link key={p.plan_id} href={`/sell?plan=${p.plan_id}`} aria-disabled={out} data-low={!out && p.low_stock}
              aria-label={out ? `${p.plan_name}, sold out` : `Sell ${p.plan_name}, ${formatPeso(p.price_centavos)}, ${p.available} left`}
              title={p.plan_name} className="menu-tile">
              <span className="menu-badge">
                {(out || p.low_stock) && (
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d={out ? 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.6 5.6l12.8 12.8' : 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01'} />
                  </svg>
                )}
                {out ? 'Sold out' : `${p.available} left`}
              </span>
              <span className="menu-hero" data-long={durationLabel(p.duration_minutes).includes(' ')}>
                {durationLabel(p.duration_minutes).split(' ').map((part) => (
                  <span key={part}>{part.slice(0, -1)}<small>{part.slice(-1)}</small></span>
                ))}
              </span>
              <span className="menu-name">{p.plan_name}</span>
              <span className="menu-price">{formatPeso(p.price_centavos)}</span>
            </Link>
          );
        })}
      </div>
      {!stock?.length && <p>{role === 'owner' ? <Link href="/plans" className="font-semibold underline">Create your first plan</Link> : 'No plans yet.'}</p>}
    </main>
  );
}
