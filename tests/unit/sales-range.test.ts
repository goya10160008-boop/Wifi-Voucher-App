import { describe, expect, it } from 'vitest';
import { salesPresets } from '@/lib/sales-range';

describe('salesPresets', () => {
  it('computes Manila ranges from a given day', () => {
    const p = Object.fromEntries(salesPresets('2026-10-25').map((x) => [x.label, [x.from, x.to]]));
    expect(p['Today']).toEqual(['2026-10-25', '2026-10-25']);
    expect(p['7 days']).toEqual(['2026-10-19', '2026-10-25']);
    expect(p['This month']).toEqual(['2026-10-01', '2026-10-25']);
    expect(p['Last month']).toEqual(['2026-09-01', '2026-09-30']);
  });
  it('last month crosses the year and handles February', () => {
    expect(salesPresets('2026-01-10').find((x) => x.label === 'Last month')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' });
    expect(salesPresets('2028-03-05').find((x) => x.label === 'Last month')).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
  });
});
