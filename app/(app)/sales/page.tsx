import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { manilaDateOf, manilaDayEnd, manilaDayStart, manilaMonthStart } from '@/lib/manila';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 50;

export default async function SalesPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string; plan?: string; grain?: string; page?: string }>;
}) {
  const { supabase, role } = await requireRole('owner', 'staff');
  const sp = await searchParams;
  const today = manilaDateOf();
  const from = sp.from && DATE.test(sp.from) ? sp.from : manilaMonthStart(today);
  const to = sp.to && DATE.test(sp.to) ? sp.to : today;
  const plan = sp.plan && /^[0-9a-f-]{36}$/i.test(sp.plan) ? sp.plan : undefined;
  const grain = sp.grain === 'month' ? 'month' : 'day';
  const page = Math.max(0, Number.parseInt(sp.page ?? '0', 10) || 0);

  let q = supabase.from('sales').select('*').gte('created_at', manilaDayStart(from)).lt('created_at', manilaDayEnd(to))
    .order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (plan) q = q.eq('plan_id', plan);
  const [{ data: sales }, { data: totals }, { data: plans }] = await Promise.all([
    q,
    supabase.rpc('sales_totals', { p_from: from, p_to: to, p_grain: grain, p_plan_id: plan }),
    supabase.from('plans').select('id, name').order('name'),
  ]);

  const grand = (totals ?? []).reduce((a, t) => a + Number(t.total_centavos), 0);
  const fmt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
  const qs = (n: number) => `?${new URLSearchParams({ from, to, grain, ...(plan ? { plan } : {}), page: String(n) })}`;
  const field = 'min-h-12 rounded-lg border border-gray-400 px-3 text-base';

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Sales</h1>
      <form className="grid grid-cols-2 gap-2">
        <input type="date" name="from" defaultValue={from} className={field} aria-label="From" />
        <input type="date" name="to" defaultValue={to} className={field} aria-label="To" />
        <select name="plan" defaultValue={plan ?? ''} className={field} aria-label="Plan">
          <option value="">All plans</option>
          {plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="grain" defaultValue={grain} className={field} aria-label="Group by">
          <option value="day">By day</option><option value="month">By month</option>
        </select>
        <button className="col-span-2 min-h-12 rounded-lg bg-blue-700 font-semibold text-white">Apply</button>
      </form>

      <section className="rounded-xl border border-gray-300 p-4">
        <p className="text-lg font-semibold">Total: {formatPeso(grand)}</p>
        <ul className="mt-2 flex flex-col gap-1">
          {totals?.map((t) => (
            <li key={`${t.period}-${t.plan_id}`} className="flex justify-between">
              <span>{t.period} · {t.plan_name} × {t.sale_count}</span><span>{formatPeso(Number(t.total_centavos))}</span>
            </li>
          ))}
        </ul>
      </section>

      <ul className="flex flex-col gap-2">
        {sales?.map((s) => (
          <li key={s.id}>
            <Link href={`/sales/${s.id}`} className={`flex min-h-14 items-center justify-between rounded-lg border border-gray-300 px-3 ${s.status === 'voided' ? 'text-gray-500 line-through' : ''}`}>
              <span><b className="font-mono">{s.voucher_code}</b> · {s.plan_name}<br /><small>{fmt.format(new Date(s.created_at))}{s.buyer_room ? ` · ${s.buyer_room}` : ''}</small></span>
              <span>{formatPeso(s.price_centavos)}</span>
            </Link>
          </li>
        ))}
        {!sales?.length && <li>No sales in this period.</li>}
      </ul>

      <div className="flex justify-between">
        {page > 0 ? <Link href={qs(page - 1)} className="min-h-12 content-center">← Newer</Link> : <span />}
        {sales?.length === PAGE && <Link href={qs(page + 1)} className="min-h-12 content-center">Older →</Link>}
      </div>
      {role === 'owner' && <a href={`/sales/export?from=${from}&to=${to}`} className="flex min-h-12 items-center justify-center rounded-lg border border-gray-400">Download CSV backup</a>}
    </main>
  );
}
