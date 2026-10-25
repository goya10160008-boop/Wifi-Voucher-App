import { requireRole } from '@/lib/auth';
import { actionsFor, summarizeByPerson, type AuditRow } from '@/lib/audit';
import { isDate, manilaDateOf, manilaDayEnd, manilaDayStart } from '@/lib/manila';
import { salesPresets } from '@/lib/sales-range';
import { nameMap, sellerLabel } from '@/lib/seller';
import { LogsView } from './LogsView';

const PAGE = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LogsPage({ searchParams }: {
  searchParams: Promise<{ from?: string; to?: string; person?: string; type?: string; page?: string }>;
}) {
  const { supabase } = await requireRole('owner'); // staff get a 404
  const sp = await searchParams;
  const today = manilaDateOf();
  const presets = salesPresets(today);
  const week = presets[1]; // "7 days" is the default window
  const from = sp.from && isDate(sp.from) ? sp.from : week.from;
  const to = sp.to && isDate(sp.to) ? sp.to : week.to;
  const person = sp.person && UUID.test(sp.person) ? sp.person : '';
  const acts = actionsFor(sp.type);
  const type = acts ? sp.type! : '';
  const page = Math.max(0, Number.parseInt(sp.page ?? '0', 10) || 0);

  let q = supabase.from('audit_log').select('*').gte('at', manilaDayStart(from)).lt('at', manilaDayEnd(to))
    .order('at', { ascending: false }).order('id', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (person) q = q.eq('actor', person);
  if (acts) q = q.in('action', acts);

  const [{ data: rows, error: e1 }, { data: todaySales, error: e2 }, { data: profiles, error: e3 }] = await Promise.all([
    q,
    // shortcut: first 1000 sales of today (API row cap); at shop volume that is a full day, upgrade to an RPC if it grows.
    supabase.from('sales').select('sold_by, price_centavos, status').gte('created_at', manilaDayStart(today)).lt('created_at', manilaDayEnd(today)).limit(1000),
    supabase.from('profiles').select('user_id, display_name').order('display_name'),
  ]);
  // PGRST205 / 42P01: audit_log does not exist because migration 0003 has not been applied yet.
  if (e1 && (e1.code === 'PGRST205' || e1.code === '42P01')) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="h1">Logs</h1>
        <p role="alert" className="alert alert-warn">The activity log is not switched on yet. Ask your developer to apply database update 0003.</p>
      </main>
    );
  }
  if (e1 || e2 || e3) throw new Error('Could not load the logs. Please try again.');

  const names = nameMap(profiles ?? []);
  const people = (profiles ?? []).map((p) => ({ id: p.user_id, name: sellerLabel(names, p.user_id) }));
  const summary = summarizeByPerson(todaySales ?? [], names);

  const href = (f: string, t: string, n = 0) =>
    `?${new URLSearchParams({ from: f, to: t, ...(person ? { person } : {}), ...(type ? { type } : {}), ...(n ? { page: String(n) } : {}) })}`;

  return (
    <LogsView
      rows={(rows ?? []) as AuditRow[]} summary={summary} from={from} to={to} person={person} type={type} people={people}
      presets={presets.map((p) => ({ label: p.label, href: href(p.from, p.to), current: p.from === from && p.to === to }))}
      prevHref={page > 0 ? href(from, to, page - 1) : undefined}
      nextHref={rows?.length === PAGE ? href(from, to, page + 1) : undefined}
    />
  );
}
