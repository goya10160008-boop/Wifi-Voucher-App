import Link from 'next/link';
import { ACTION_GROUPS, describeEvent, eventSub, type AuditRow } from '@/lib/audit';
import { formatPeso } from '@/lib/money';
import { shortManilaTime } from '@/lib/short-time';

export type LogsViewProps = {
  rows: AuditRow[];
  summary: { id: string; name: string; vouchers: number; total: number }[];
  presets: { label: string; href: string; current: boolean }[];
  from: string; to: string; person: string; type: string;
  people: { id: string; name: string }[];
  prevHref?: string; nextHref?: string;
  now?: Date;
};

// Plain presentational component (no data access), so it can be rendered with sample data.
export function LogsView({ rows, summary, presets, from, to, person, type, people, prevHref, nextHref, now = new Date() }: LogsViewProps) {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="h1">Logs</h1>

      <section className="card" aria-labelledby="by-person">
        <h2 id="by-person" className="text-[17px] font-bold">Today by person</h2>
        {summary.length ? (
          <ul className="mt-2 flex flex-col gap-1">
            {summary.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span className="min-w-0">{p.name} · {p.vouchers} {p.vouchers === 1 ? 'voucher' : 'vouchers'}</span>
                <span className="font-semibold">{formatPeso(p.total)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-mute">No sales today yet.</p>}
      </section>

      <nav aria-label="Quick ranges" className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Link key={p.label} href={p.href} aria-current={p.current ? 'true' : undefined} className="chip px-4 text-[15px]">{p.label}</Link>
        ))}
      </nav>
      <form className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-sm text-mute">From
          <input type="date" name="from" defaultValue={from} className="field date-field mt-1" />
        </label>
        <label className="min-w-0 text-sm text-mute">To
          <input type="date" name="to" defaultValue={to} className="field date-field mt-1" />
        </label>
        <select name="person" defaultValue={person} className="field min-w-0" aria-label="Person">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="type" defaultValue={type} className="field min-w-0" aria-label="Type of event">
          <option value="">All events</option>
          {ACTION_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
        </select>
        <button className="btn col-span-2">Apply</button>
      </form>

      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const sub = eventSub(r);
          return (
            <li key={r.id} className="card flex flex-col gap-0.5 p-3">
              <p className="text-sm text-mute">{shortManilaTime(r.at, now)}</p>
              <p className="font-semibold">{describeEvent(r)}</p>
              {sub && <p className="text-sm text-mute">{sub}</p>}
            </li>
          );
        })}
        {!rows.length && <li className="text-mute">No activity yet.</li>}
      </ul>

      <div className="flex justify-between">
        {prevHref ? <Link href={prevHref} className="flex min-h-12 items-center font-semibold text-pri">← Newer</Link> : <span />}
        {nextHref && <Link href={nextHref} className="flex min-h-12 items-center font-semibold text-pri">Older →</Link>}
      </div>
    </main>
  );
}
