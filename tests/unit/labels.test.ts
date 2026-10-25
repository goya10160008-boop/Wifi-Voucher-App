import { describe, expect, it } from 'vitest';
import { totalsLabels } from '@/lib/labels';

describe('totalsLabels', () => {
  it('owner sees shop-wide wording', () => {
    expect(totalsLabels('owner')).toEqual({ today: 'Today', month: 'This month', total: 'Total' });
  });
  it('staff are told the numbers are their own', () => {
    expect(totalsLabels('staff')).toEqual({ today: 'Your sales today', month: 'Your sales this month', total: 'Your total' });
  });
});
