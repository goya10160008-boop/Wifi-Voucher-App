import { manilaDateOf } from '@/lib/manila';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OFFSET_MS = 8 * 3600_000;

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
