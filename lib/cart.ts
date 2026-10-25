// Pure cart maths for /sell. A cart is planId -> qty; money is integer centavos.
import { pesosToCentavos } from '@/lib/money';

export const MAX_VOUCHERS = 10;
const BILLS = [2000, 5000, 10000, 20000, 50000, 100000];

export type Cart = Record<string, number>;

export const cartCount = (cart: Cart) => Object.values(cart).reduce((a, q) => a + q, 0);

export const cartTotal = (cart: Cart, prices: Record<string, number>) =>
  Object.entries(cart).reduce((a, [id, q]) => a + q * (prices[id] ?? 0), 0);

/** Set one plan's qty, clamped to whole numbers, the stock, and the 10-voucher total. Zero removes it. */
export function setQty(cart: Cart, planId: string, qty: number, stock: Record<string, number> = {}): Cart {
  const others = cartCount(cart) - (cart[planId] ?? 0);
  const max = Math.max(0, Math.min(MAX_VOUCHERS - others, stock[planId] ?? MAX_VOUCHERS));
  const q = Math.max(0, Math.min(Math.floor(qty) || 0, max));
  const { [planId]: _old, ...rest } = cart;
  return q > 0 ? { ...rest, [planId]: q } : rest;
}

/** Quick "cash received" buttons: the exact total, then common bills above it. */
export function cashChips(total: number): number[] {
  if (total <= 0) return [];
  const next1000 = Math.ceil((total + 1) / 100000) * 100000;
  return [total, ...BILLS.filter((b) => b > total), next1000].filter((v, i, all) => all.indexOf(v) === i).slice(0, 5);
}

export const changeFor = (total: number, tendered: number) => tendered - total;

/** The cart as display lines, in plan order. Plans no longer in the list are dropped. */
export function cartLines(cart: Cart, plans: { plan_id: string; plan_name: string; price_centavos: number }[]) {
  return plans
    .filter((p) => (cart[p.plan_id] ?? 0) > 0)
    .map((p) => ({ id: p.plan_id, name: p.plan_name, qty: cart[p.plan_id], unit: p.price_centavos, subtotal: cart[p.plan_id] * p.price_centavos }));
}

const MAX_TENDERED = 100_000_000; // the server rejects more than this (sell action)

/** What the Pay tab shows: nothing chosen yet, short (and by how much), exact, or over (and the change). */
export function payStatus(total: number, tendered: number | null) {
  if (total <= 0 || tendered === null) return { state: 'none' as const, change: 0, missing: 0 };
  const diff = tendered - total;
  if (diff < 0) return { state: 'short' as const, change: 0, missing: -diff };
  return { state: diff === 0 ? ('exact' as const) : ('over' as const), change: diff, missing: 0 };
}

/** "Other amount" text in pesos to centavos; null for junk, zero, or more than the server accepts. */
export function otherAmount(input: string): number | null {
  const c = pesosToCentavos(input);
  return c === null || c <= 0 || c > MAX_TENDERED ? null : c;
}
