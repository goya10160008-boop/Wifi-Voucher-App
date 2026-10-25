import type { Role } from '@/lib/auth';

/** Staff only ever see their own sales, so their totals say so; the owner sees shop-wide numbers. */
export const totalsLabels = (role: Role) =>
  role === 'staff'
    ? { today: 'Your sales today', month: 'Your sales this month', total: 'Your total' }
    : { today: 'Today', month: 'This month', total: 'Total' };
