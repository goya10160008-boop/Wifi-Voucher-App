// Pure receipt maths and text. Money is integer centavos; format only at the edge.
import { formatPeso } from '@/lib/money';

export const BUSINESS_NAME = 'A&B Boarding House WiFi';
export const INSTRUCTION = 'Enter your code on the WiFi login page';
export const THANKS = 'Thank you!';

export type ReceiptSale = {
  seq: number | null; voucher_code: string; plan_name: string; duration_minutes: number; price_centavos: number; status: string;
};
export type ReceiptCode = { seq: number; code: string | null; voided: boolean };
export type ReceiptLine = { plan: string; minutes: number; qty: number; price: number; subtotal: number };
export type Receipt = {
  lines: ReceiptLine[]; codes: ReceiptCode[]; total: number; cash: number | null; change: number | null; voidedCount: number;
};

/** Short number for the customer to quote: last 6 characters of the group or sale id. */
export const receiptNumber = (id: string) => id.replace(/-/g, '').slice(-6).toUpperCase();

export function durationLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Number((minutes / 60).toFixed(2));
  return `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

/** `tendered` = whole cash handed over (stored on the first code's payment), or null if unknown. */
export function buildReceipt(sales: ReceiptSale[], tendered: number | null): Receipt {
  // A single old sale has seq null; it is number 1.
  const rows = sales.map((s, i) => ({ ...s, seq: s.seq ?? i + 1 })).sort((a, b) => a.seq - b.seq);
  const lines = new Map<string, ReceiptLine>();
  for (const s of rows) {
    const key = `${s.plan_name}|${s.duration_minutes}|${s.price_centavos}`;
    const l = lines.get(key) ?? { plan: s.plan_name, minutes: s.duration_minutes, qty: 0, price: s.price_centavos, subtotal: 0 };
    l.qty += 1;
    l.subtotal += s.price_centavos;
    lines.set(key, l);
  }
  // The total is what was paid, so voided codes stay in it; their digits never reach the receipt.
  const total = rows.reduce((a, s) => a + s.price_centavos, 0);
  return {
    lines: [...lines.values()],
    codes: rows.map((s) => (s.status === 'voided' ? { seq: s.seq, code: null, voided: true } : { seq: s.seq, code: s.voucher_code, voided: false })),
    total,
    cash: tendered,
    change: tendered === null ? null : tendered - total,
    voidedCount: rows.filter((s) => s.status === 'voided').length,
  };
}

export function buildReceiptText(r: Receipt, meta: { number: string; when: string; guest: string | null; room: string | null }) {
  const out = [BUSINESS_NAME, `Receipt #${meta.number}`, meta.when, ''];
  for (const l of r.lines) out.push(`${l.qty} x ${l.plan} (${durationLabel(l.minutes)}) @ ${formatPeso(l.price)} = ${formatPeso(l.subtotal)}`);
  out.push('', 'CODES');
  for (const c of r.codes) out.push(`${c.seq}. ${c.voided ? 'VOIDED' : c.code}`);
  if (r.voidedCount) out.push('Voided codes cannot be used.');
  out.push('', `Total:  ${formatPeso(r.total)}`);
  if (r.cash !== null && r.change !== null) out.push(`Cash:   ${formatPeso(r.cash)}`, `Change: ${formatPeso(r.change)}`);
  if (meta.guest) out.push(`Guest: ${meta.guest}`);
  if (meta.room) out.push(`Room: ${meta.room}`);
  out.push('', `${INSTRUCTION}.`, THANKS);
  return out.join('\n');
}

const whenFmt = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
export const manilaWhen = (iso: string) => whenFmt.format(new Date(iso));
