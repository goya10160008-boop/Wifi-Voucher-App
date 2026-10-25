import { manilaDateOf } from '@/lib/manila';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OFFSET_MS = 8 * 3600_000;

const manilaWall = (iso: string) => new Date(new Date(iso).getTime() + OFFSET_MS); // read with getUTC*

/** "3:42 PM": the Manila clock time only. */
export function clockTime(iso: string): string {
  const t = manilaWall(iso);
  const h = t.getUTCHours();
  return `${h % 12 || 12}:${String(t.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Day heading for grouped lists: "Today", "Yesterday", "Oct 20", or "Dec 31, 2025" for another year. */
export function dayHeading(iso: string, now: Date = new Date()): string {
  const day = manilaDateOf(new Date(iso));
  const today = manilaDateOf(now);
  if (day === today) return 'Today';
  if (day === manilaDateOf(new Date(now.getTime() - 86_400_000))) return 'Yesterday';
  return shortPeriod(day, 'day', now);
}

/** Compact Manila time for lists: "Today 3:42 PM", "Yesterday 9:05 AM", "Oct 20 · 3:42 PM". */
export function shortManilaTime(iso: string, now: Date = new Date()): string {
  const t = new Date(new Date(iso).getTime() + OFFSET_MS); // read with getUTC*: this is Manila wall time
  const h = t.getUTCHours();
  const time = `${h % 12 || 12}:${String(t.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const day = manilaDateOf(new Date(iso));
  const today = manilaDateOf(now);
  if (day === today) return `Today ${time}`;
  if (day === manilaDateOf(new Date(now.getTime() - 86_400_000))) return `Yesterday ${time}`;
  const date = `${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}${day.slice(0, 4) === today.slice(0, 4) ? '' : `, ${day.slice(0, 4)}`}`;
  return `${date} · ${time}`;
}

/** Label for a totals bucket (a YYYY-MM-DD date): "Oct 25" or, for month buckets, "Oct 2026". */
export function shortPeriod(date: string, grain: 'day' | 'month', now: Date = new Date()): string {
  const month = MONTHS[Number(date.slice(5, 7)) - 1];
  if (grain === 'month') return `${month} ${date.slice(0, 4)}`;
  const year = date.slice(0, 4) === manilaDateOf(now).slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  return `${month} ${Number(date.slice(8, 10))}${year}`;
}
