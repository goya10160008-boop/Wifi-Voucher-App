import { requireRole } from '@/lib/auth';
import { manilaDayEnd, manilaDayStart } from '@/lib/manila';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Quote every cell and neutralise spreadsheet formulas in user-typed text.
const cell = (v: unknown) => `"${String(v ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const { supabase } = await requireRole('owner');
  const u = new URL(req.url);
  const from = u.searchParams.get('from') ?? '';
  const to = u.searchParams.get('to') ?? '';
  if (!DATE.test(from) || !DATE.test(to)) return new Response('Bad dates', { status: 400 });
  const { data } = await supabase.from('sales').select('*').gte('created_at', manilaDayStart(from))
    .lt('created_at', manilaDayEnd(to)).order('created_at').limit(10000);
  const head = ['created_at', 'status', 'code', 'plan', 'price_php', 'guest', 'room', 'void_reason'];
  const rows = (data ?? []).map((s) => [s.created_at, s.status, s.voucher_code, s.plan_name, s.price_centavos / 100, s.buyer_name, s.buyer_room, s.void_reason]);
  const csv = [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv', 'content-disposition': `attachment; filename="sales-${from}-${to}.csv"` } });
}
