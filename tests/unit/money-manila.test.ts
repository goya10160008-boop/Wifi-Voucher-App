import { describe, expect, it } from 'vitest';
import { formatPeso, pesosToCentavos } from '@/lib/money';
import { manilaDateOf, manilaDayStart, manilaDayEnd, manilaMonthStart } from '@/lib/manila';

describe('money', () => {
  it('converts pesos to centavos without float drift', () => {
    expect(pesosToCentavos('20')).toBe(2000);
    expect(pesosToCentavos('19.99')).toBe(1999);
    expect(pesosToCentavos('0.1')).toBe(10);
    expect(pesosToCentavos('1,250.50')).toBe(125050);
  });
  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3']) expect(pesosToCentavos(bad)).toBeNull();
  });
  it('formats centavos as pesos', () => {
    expect(formatPeso(2000)).toBe('₱20.00');
    expect(formatPeso(125050)).toBe('₱1,250.50');
  });
});

describe('manila', () => {
  it('buckets by Manila calendar date, not UTC', () => {
    expect(manilaDateOf(new Date('2026-10-24T16:30:00Z'))).toBe('2026-10-25'); // 00:30 Manila
    expect(manilaDateOf(new Date('2026-10-25T15:59:00Z'))).toBe('2026-10-25'); // 23:59 Manila
  });
  it('builds +08:00 day bounds', () => {
    expect(manilaDayStart('2026-10-25')).toBe('2026-10-25T00:00:00+08:00');
    expect(manilaDayEnd('2026-10-25')).toBe('2026-10-26T00:00:00+08:00');
    expect(manilaDayEnd('2026-12-31')).toBe('2027-01-01T00:00:00+08:00');
  });
  it('gives month start', () => {
    expect(manilaMonthStart('2026-10-25')).toBe('2026-10-01');
  });
});
