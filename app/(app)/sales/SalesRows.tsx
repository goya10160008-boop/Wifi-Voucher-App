import Link from 'next/link';
import { formatPeso } from '@/lib/money';
import { clockTime, dayHeading } from '@/lib/short-time';

export type SaleRow = {
  id: string; group_id: string | null; voucher_code: string; plan_name: string; status: string;
  created_at: string; buyer_room: string | null; sold_by: string; price_centavos: number;
};

/** Sales grouped under a day heading, one line per sale. A cart (rows sharing a group) gets a header line, then its codes. */
export function SalesRows({ entries, now, by }: { entries: SaleRow[][]; now: Date; by: (id: string) => string }) {
  const days: { day: string; entries: SaleRow[][] }[] = [];
  for (const rows of entries) {
    const day = dayHeading(rows[0].created_at, now);
    const last = days[days.length - 1];
    if (last?.day === day) last.entries.push(rows);
    else days.push({ day, entries: [rows] });
  }

  const line = (s: SaleRow, nested = false) => {
    const voided = s.status === 'voided';
    return (
      <li key={s.id}>
        <Link href={s.group_id ? `/sales/group/${s.group_id}` : `/sales/${s.id}`} className={`row-dense ${voided ? 'text-mute line-through' : ''}`} style={nested ? { paddingLeft: 28 } : undefined}>
          <b className="font-mono">{s.voucher_code}</b>
          <span className="grow ell">{s.plan_name}{voided ? ' (voided)' : ''}{s.buyer_room ? ` · ${s.buyer_room}` : ''}{by(s.sold_by)}</span>
          <span className="text-mute">{clockTime(s.created_at)}</span>
          <b>{formatPeso(s.price_centavos)}</b>
        </Link>
      </li>
    );
  };

  if (!days.length) return <p className="text-mute">No sales in this period.</p>;
  return (
    <div className="flex flex-col gap-1">
      {days.map((d) => (
        <section key={d.day}>
          <h2 className="dayh">{d.day}</h2>
          <ul className="rows">
            {d.entries.flatMap((rows) => {
              if (rows.length === 1) return [line(rows[0])];
              const live = rows.filter((s) => s.status === 'completed');
              return [
                <li key={`g-${rows[0].group_id}`}>
                  <Link href={`/sales/group/${rows[0].group_id}`} className="row-dense font-semibold">
                    <span className="grow ell">{rows.length} codes{live.length < rows.length ? ` (${rows.length - live.length} voided)` : ''}{by(rows[0].sold_by)}</span>
                    <span className="text-mute">{clockTime(rows[0].created_at)}</span>
                    <b>{formatPeso(live.reduce((a, s) => a + s.price_centavos, 0))}</b>
                    <span className="text-pri" aria-hidden="true">›</span>
                  </Link>
                </li>,
                ...rows.map((s) => line(s, true)),
              ];
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
