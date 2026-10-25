import { describe, expect, it } from 'vitest';
import { MAX_VOUCHERS, cartCount, cartLines, cartTotal, cashChips, changeFor, setQty } from '@/lib/cart';

const prices = { a: 2000, b: 5000 };

describe('cart (planId -> qty)', () => {
  it('counts and totals in centavos', () => {
    expect(cartCount({ a: 2, b: 1 })).toBe(3);
    expect(cartTotal({ a: 2, b: 1 }, prices)).toBe(9000);
    expect(cartTotal({}, prices)).toBe(0);
  });

  it('setQty replaces a qty, drops zero, never exceeds the 10 total or the stock', () => {
    expect(setQty({ a: 2 }, 'b', 1)).toEqual({ a: 2, b: 1 });
    expect(setQty({ a: 2, b: 1 }, 'a', 0)).toEqual({ b: 1 });
    expect(setQty({ a: 2 }, 'a', 99, { a: 50 })).toEqual({ a: MAX_VOUCHERS });
    expect(setQty({ a: 2, b: 7 }, 'a', 5)).toEqual({ a: 3, b: 7 }); // 7 already in the cart leaves room for 3
    expect(setQty({ a: 2 }, 'a', 5, { a: 3 })).toEqual({ a: 3 });
    expect(setQty({ a: 2 }, 'a', -4)).toEqual({});
    expect(setQty({ a: 2 }, 'a', 1.7)).toEqual({ a: 1 });
  });

  it('cash chips: exact total first, then bigger bills, max 5, none for an empty cart', () => {
    expect(cashChips(0)).toEqual([]);
    expect(cashChips(2000)).toEqual([2000, 5000, 10000, 20000, 50000]);
    expect(cashChips(6000)).toEqual([6000, 10000, 20000, 50000, 100000]);
    expect(cashChips(120000)).toEqual([120000, 200000]); // next ₱1,000 multiple
  });

  it('change is tendered minus total, negative when short', () => {
    expect(changeFor(6000, 10000)).toBe(4000);
    expect(changeFor(6000, 5000)).toBe(-1000);
  });

  it('cart lines: one per plan in plan order, with unit price and subtotal; unknown plans are dropped', () => {
    const plans = [
      { plan_id: 'a', plan_name: '1HRS', price_centavos: 500 },
      { plan_id: 'b', plan_name: '3HRS', price_centavos: 1000 },
    ];
    expect(cartLines({ b: 2, a: 1, gone: 3 }, plans)).toEqual([
      { id: 'a', name: '1HRS', qty: 1, unit: 500, subtotal: 500 },
      { id: 'b', name: '3HRS', qty: 2, unit: 1000, subtotal: 2000 },
    ]);
    expect(cartLines({}, plans)).toEqual([]);
  });
});
