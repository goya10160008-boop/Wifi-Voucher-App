/** Quick date ranges for the Sales filter. `today` is a Manila YYYY-MM-DD. All values are YYYY-MM-DD. */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

export function salesPresets(today: string) {
  const t = utc(today);
  const weekAgo = new Date(t); weekAgo.setUTCDate(t.getUTCDate() - 6);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const lastEnd = new Date(utc(thisMonth)); lastEnd.setUTCDate(0); // day 0 = last day of the previous month
  const lastStart = `${iso(lastEnd).slice(0, 7)}-01`;
  return [
    { label: 'Today', from: today, to: today },
    { label: '7 days', from: iso(weekAgo), to: today },
    { label: 'This month', from: thisMonth, to: today },
    { label: 'Last month', from: lastStart, to: iso(lastEnd) },
  ];
}
