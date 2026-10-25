import { describe, expect, it } from 'vitest';
import { BUSINESS_NAME, buildReceipt, buildReceiptText, durationLabel, manilaWhen, receiptNumber, type ReceiptSale } from '@/lib/receipt';

const sale = (seq: number, code: string, plan = '3 Hours', minutes = 180, price = 2000, status = 'completed'): ReceiptSale => ({
  seq, voucher_code: code, plan_name: plan, duration_minutes: minutes, price_centavos: price, status,
});

describe('receiptNumber', () => {
  it('is the last 6 characters of the id, uppercase, without dashes', () => {
    expect(receiptNumber('0b1c2d3e-aaaa-bbbb-cccc-1234567890ab')).toBe('7890AB');
  });
});

describe('durationLabel', () => {
  it('reads naturally', () => {
    expect(durationLabel(30)).toBe('30 min');
    expect(durationLabel(60)).toBe('1 hour');
    expect(durationLabel(180)).toBe('3 hours');
    expect(durationLabel(1440)).toBe('24 hours');
    expect(durationLabel(90)).toBe('1.5 hours');
  });
});

describe('buildReceipt', () => {
  const sales = [sale(1, '111111'), sale(2, '222222'), sale(3, '333333', '1 Day', 1440, 5000)];

  it('groups lines by plan with qty and subtotal, keeps codes in seq order', () => {
    const r = buildReceipt(sales, 10000);
    expect(r.lines).toEqual([
      { plan: '3 Hours', minutes: 180, qty: 2, price: 2000, subtotal: 4000 },
      { plan: '1 Day', minutes: 1440, qty: 1, price: 5000, subtotal: 5000 },
    ]);
    expect(r.codes.map((c) => c.code)).toEqual(['111111', '222222', '333333']);
    expect(r.total).toBe(9000);
    expect(r.cash).toBe(10000);
    expect(r.change).toBe(1000);
  });

  it('sorts by seq even if rows arrive shuffled', () => {
    expect(buildReceipt([sales[2], sales[0], sales[1]], null).codes.map((c) => c.seq)).toEqual([1, 2, 3]);
  });

  it('has no cash or change when the cash is unknown', () => {
    const r = buildReceipt(sales, null);
    expect(r.cash).toBeNull();
    expect(r.change).toBeNull();
  });

  it('marks voided codes and hides their digits; the total stays what was paid', () => {
    const r = buildReceipt([sale(1, '111111'), sale(2, '222222', '3 Hours', 180, 2000, 'voided')], 5000);
    expect(r.codes[1]).toEqual({ seq: 2, code: null, voided: true });
    expect(r.voidedCount).toBe(1);
    expect(r.total).toBe(4000);
    expect(JSON.stringify(r)).not.toContain('222222');
  });
});

describe('buildReceiptText', () => {
  it('lists every code on its own line, and never prints a voided code', () => {
    const r = buildReceipt([sale(1, '111111'), sale(2, '222222', '3 Hours', 180, 2000, 'voided')], 5000);
    const t = buildReceiptText(r, { number: 'ABC123', when: '25 Oct 2026, 1:05 pm', guest: 'Ana', room: '4B' });
    expect(t).toContain(BUSINESS_NAME);
    expect(t).toContain('Receipt #ABC123');
    expect(t).toContain('25 Oct 2026, 1:05 pm');
    expect(t).toContain('1. 111111');
    expect(t).toContain('2. VOIDED');
    expect(t).not.toContain('222222');
    expect(t).toMatch(/Total:\s+₱40\.00/);
    expect(t).toMatch(/Cash:\s+₱50\.00/);
    expect(t).toMatch(/Change:\s+₱10\.00/);
    expect(t).toContain('Ana');
    expect(t).toContain('4B');
    expect(t).toContain('Enter your code on the WiFi login page');
  });

  it('omits cash, change, guest and room when absent', () => {
    const t = buildReceiptText(buildReceipt([sale(1, '111111')], null), { number: 'X', when: 'now', guest: null, room: null });
    expect(t).not.toMatch(/Cash:|Change:|Guest:|Room:/);
  });
});

describe('manilaWhen', () => {
  it('shows Manila time (UTC+8), not UTC', () => {
    const s = manilaWhen('2026-10-25T05:05:00Z');
    expect(s).toMatch(/Oct/);
    expect(s).toMatch(/1:05/);
  });
});
