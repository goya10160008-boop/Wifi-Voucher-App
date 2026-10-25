import { describe, expect, it } from 'vitest';
import { isDate } from '@/lib/manila';

describe('isDate', () => {
  it('accepts real calendar dates', () => {
    expect(isDate('2026-10-25')).toBe(true);
    expect(isDate('2028-02-29')).toBe(true);
  });
  it('rejects shapes that pass a regex but are not dates', () => {
    for (const s of ['2026-13-45', '0000-00-00', '2026-02-30', '2027-02-29', '2026-1-5', 'abc', '']) expect(isDate(s)).toBe(false);
  });
});
