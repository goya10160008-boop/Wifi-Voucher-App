import { requireRole } from '@/lib/auth';
import { isDate, manilaDayEnd, manilaDayStart } from '@/lib/manila';

const BATCH = 1000; // hosted Supabase caps each response at 1000 rows by default
// Quote every cell and neutralise spreadsheet formulas (also after a leading tab/CR) in typed text.
const cell = (v: unknown) => `"${String(v ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const { supabase } = await requireRole('owner');
  const u = new URL(req.url);
  const from = u.searchParams.get('from') ?? '';
  const to = u.searchParams.get('to') ?? '';
  if (!isDate(from) || !isDate(to)) return new Response('Bad dates', { status: 400 });

  const sales = [];
  for (let start = 0; ; start += BATCH) {
    const { data, error } = await supabase.from('sales').select('*')
      .gte('created_at', manilaDayStart(from)).lt('created_at', manilaDayEnd(to))
      .order('created_at').order('id').range(start, start + BATCH - 1);
    if (error) return new Response('Could not build the backup. Please try again.', { status: 500 });
    sales.push(...data);
    if (data.length < BATCH) break;
  }

  const head = ['created_at', 'status', 'code', 'plan', 'price_php', 'guest', 'room', 'void_reason'];
  const rows = sales.map((s) => [s.created_at, s.status, s.voucher_code, s.plan_name, s.price_centavos / 100, s.buyer_name, s.buyer_room, s.void_reason]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sales-${from}-${to}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
