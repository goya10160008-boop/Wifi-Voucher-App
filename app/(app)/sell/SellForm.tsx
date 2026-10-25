'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { MAX_VOUCHERS, cartCount, cartTotal, cashChips, changeFor, setQty, type Cart } from '@/lib/cart';
import { formatPeso } from '@/lib/money';
import { sell } from './actions';

type Plan = { plan_id: string; plan_name: string; price_centavos: number; available: number };

export function SellForm({ plans, initialPlan }: { plans: Plan[]; initialPlan?: string }) {
  const stock = Object.fromEntries(plans.map((p) => [p.plan_id, p.available]));
  const prices = Object.fromEntries(plans.map((p) => [p.plan_id, p.price_centavos]));
  const [cart, setCart] = useState<Cart>(() => (initialPlan && stock[initialPlan] > 0 ? { [initialPlan]: 1 } : {}));
  const [tendered, setTendered] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [error, setError] = useState('');
  const [reused, setReused] = useState(false);
  // One key per sell attempt, kept across retries so a lost response cannot double-sell.
  const [key] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();

  const count = cartCount(cart);
  const total = cartTotal(cart, prices);
  const change = count > 0 && tendered !== null ? changeFor(total, tendered) : null;
  const ready = count > 0 && change !== null && change >= 0;

  const updateQty = (id: string, qty: number) => {
    setCart((c) => setQty(c, id, qty, stock));
    setTendered(null); // the total moved, so the cash received must be chosen again
  };

  const submit = () =>
    start(async () => {
      setError('');
      setReused(false);
      try {
        const items = Object.entries(cart).map(([planId, qty]) => ({ planId, qty }));
        const r = await sell({ key, items, tenderedCentavos: tendered ?? 0, buyerName: name, buyerRoom: room });
        if (r?.error) { setError(r.error); setReused(r.code === 'KEY_REUSED'); }
      } catch {
        setError('Network problem. Tap Confirm again to retry safely.');
      }
    });

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3" aria-label="Plans">
        {plans.map((p) => {
          const q = cart[p.plan_id] ?? 0;
          return (
            <li key={p.plan_id} data-on={q > 0} className="plan-row card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{p.plan_name}</p>
                <p className="text-sm text-mute">{formatPeso(p.price_centavos)} · {p.available} left</p>
              </div>
              <div className="stepper" role="group" aria-label={`Quantity for ${p.plan_name}`}>
                <button type="button" aria-label={`Remove one ${p.plan_name}`} disabled={q === 0} onClick={() => updateQty(p.plan_id, q - 1)}>−</button>
                <output aria-live="polite">{q}</output>
                <button type="button" aria-label={`Add one ${p.plan_name}`} disabled={count >= MAX_VOUCHERS || q >= p.available} onClick={() => updateQty(p.plan_id, q + 1)}>+</button>
              </div>
            </li>
          );
        })}
      </ul>

      <p role="status" className="text-lg font-semibold">
        {count === 0 ? 'Choose how many vouchers' : `${count} ${count === 1 ? 'voucher' : 'vouchers'} · ${formatPeso(total)}`}
      </p>
      {count >= MAX_VOUCHERS && <p className="alert alert-warn">You can sell at most {MAX_VOUCHERS} vouchers at a time.</p>}

      {count > 0 && (
        <div className="fade-in flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {cashChips(total).map((c) => (
              <button key={c} type="button" onClick={() => setTendered(c)} aria-pressed={tendered === c} className="chip">
                {formatPeso(c)}
              </button>
            ))}
          </div>
          <p className="text-lg font-semibold" role="status">
            {change === null ? 'Tap the cash received' : change >= 0 ? `Change: ${formatPeso(change)}` : 'Not enough cash'}
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Guest name (optional)" aria-label="Guest name" className="field" />
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={20} placeholder="Room (optional)" aria-label="Room" className="field" />
        </div>
      )}

      {error && (
        <p role="alert" className="alert alert-bad">
          {error}{reused && <> <Link href="/sales" className="font-semibold underline">Open Sales</Link></>}
        </p>
      )}
      <button disabled={!ready || pending} aria-busy={pending} onClick={submit} className="btn">
        {pending ? 'Selling…' : 'Confirm sale'}
      </button>
    </div>
  );
}
