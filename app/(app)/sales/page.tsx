import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { formatPeso } from '@/lib/money';
import { isDate, manilaDateOf, manilaDayEnd, manilaDayStart, manilaMonthStart } from '@/lib/manila';
import { salesPresets } from '@/lib/sales-range';
import { shortManilaTime, shortPeriod } from '@/lib/short-time';

const PAGE = 50;

export default async function SalesPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string; plan?: string; grain?: string; page?: string }>;
}) {
  const { supabase, role } = await requireRole('owner', 'staff');
  const sp = await searchParams;
  const today = manilaDateOf();
  const from = sp.from && isDate(sp.from) ? sp.from : manilaMonthStart(today);
  const to = sp.to && isDate(sp.to) ? sp.to : today;
  const plan = sp.plan && /^[0-9a-f-]{36}$/i.test(sp.plan) ? sp.plan : undefined;
  const grain = sp.grain === 'month' ? 'month' : 'day';
  const page = Math.max(0, Number.parseInt(sp.page ?? '0', 10) || 0);

  let q = supabase.from('sales').select('*').gte('created_at', manilaDayStart(from)).lt('created_at', manilaDayEnd(to))
    .order('created_at', { ascending: false }).order('id').range(page * PAGE, page * PAGE + PAGE - 1);
  if (plan) q = q.eq('plan_id', plan);
  const [{ data: sales, error: e1 }, { data: totals, error: e2 }, { data: plans, error: e3 }, { data: monthly, error: e4 }] = await Promise.all([
    q,
    supabase.rpc('sales_totals', { p_from: from, p_to: to, p_grain: grain, p_plan_id: plan }),
    supabase.from('plans').select('id, name').order('name'),
    // Grand total comes from month buckets: few rows, so the API row cap cannot truncate it.
    supabase.rpc('sales_totals', { p_from: from, p_to: to, p_grain: 'month', p_plan_id: plan }),
  ]);
  // Show a real error, never a quiet "₱0.00".
  if (e1 || e2 || e3 || e4) throw new Error('Could not load sales. Please try again.');

  // Rows of one cart sit together: keep first-seen order, gather the rest of a group under it.
  const entries: NonNullable<typeof sales>[] = [];
  const seen = new Map<string, NonNullable<typeof sales>>();
  for (const s of sales ?? []) {
    const g = s.group_id && seen.get(s.group_id);
    if (g) g.push(s);
    else {
      const e = [s];
      entries.push(e);
      if (s.group_id) seen.set(s.group_id, e);
    }
  }

  const grand =(monthly ?? []).reduce((a, t) => a + Number(t.total_centavos), 0);
  const now = new Date();
  const link = (f: string, t: string) => `?${new URLSearchParams({ from: f, to: t, grain, ...(plan ? { plan } : {}) })}`;
  const qs = (n: number) => `?${new URLSearchParams({ from, to, grain, ...(plan ? { plan } : {}), page: String(n) })}`;

  return (
    <main className="flex flex-col gap-4">
      <h1 className="h1">Sales</h1>
      <nav aria-label="Quick ranges" className="flex flex-wrap gap-2">
        {salesPresets(today).map((p) => (
          <Link key={p.label} href={link(p.from, p.to)} aria-current={p.from === from && p.to === to ? 'true' : undefined} className="chip px-4 text-[15px]">{p.label}</Link>
        ))}
      </nav>
      <form className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-sm text-mute">From
          <input type="date" name="from" defaultValue={from} className="field date-field mt-1" />
        </label>
        <label className="min-w-0 text-sm text-mute">To
          <input type="date" name="to" defaultValue={to} className="field date-field mt-1" />
        </label>
        <select name="plan" defaultValue={plan ?? ''} className="field min-w-0" aria-label="Plan">
          <option value="">All plans</option>
          {plans?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="grain" defaultValue={grain} className="field min-w-0" aria-label="Group by">
          <option value="day">By day</option><option value="month">By month</option>
        </select>
        <button className="btn col-span-2">Apply</button>
      </form>

      <section className="card">
        <p className="text-lg font-bold">Total: {formatPeso(grand)}</p>
        <ul className="mt-2 flex flex-col gap-1">
          {totals?.map((t) => (
            <li key={`${t.period}-${t.plan_id}`} className="flex justify-between gap-2">
              <span className="min-w-0">{shortPeriod(t.period, grain, now)} · {t.plan_name} × {t.sale_count}</span><span>{formatPeso(Number(t.total_centavos))}</span>
            </li>
          ))}
        </ul>
      </section>

      <ul className="flex flex-col gap-2">
        {entries.map((rows) => {
          const row = (s: (typeof rows)[number]) => (
            <Link href={`/sales/${s.id}`} className={`row-link ${s.status === 'voided' ? 'text-mute line-through' : ''}`}>
              <span className="min-w-0"><b className="font-mono">{s.voucher_code}</b> · {s.plan_name}{s.status === 'voided' ? ' (voided)' : ''}<br /><small className="text-mute">{shortManilaTime(s.created_at, now)}{s.buyer_room ? ` · ${s.buyer_room}` : ''}</small></span>
              <span>{formatPeso(s.price_centavos)}</span>
            </Link>
          );
          if (rows.length === 1) return <li key={rows[0].id}>{row(rows[0])}</li>;
          const live = rows.filter((s) => s.status === 'completed');
          return (
            <li key={rows[0].group_id} className="card flex flex-col gap-2 p-3">
              <Link href={`/sales/group/${rows[0].group_id}`} className="flex min-h-12 items-center justify-between font-semibold">
                <span>{rows.length} codes · {formatPeso(live.reduce((a, s) => a + s.price_centavos, 0))}{live.length < rows.length ? ` (${rows.length - live.length} voided)` : ''}</span>
                <span className="text-pri">Open →</span>
              </Link>
              <ul className="flex flex-col gap-2">{rows.map((s) => <li key={s.id}>{row(s)}</li>)}</ul>
            </li>
          );
        })}
        {!entries.length && <li className="text-mute">No sales in this period.</li>}
      </ul>

      <div className="flex justify-between">
        {page > 0 ? <Link href={qs(page - 1)} className="flex min-h-12 items-center font-semibold text-pri">← Newer</Link> : <span />}
        {sales?.length === PAGE && <Link href={qs(page + 1)} className="flex min-h-12 items-center font-semibold text-pri">Older →</Link>}
      </div>
      {role === 'owner' && <a href={`/sales/export?from=${from}&to=${to}`} className="btn btn-ghost">Download CSV backup</a>}
    </main>
  );
}
