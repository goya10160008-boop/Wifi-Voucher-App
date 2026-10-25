'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { MAX_VOUCHERS, cartCount, cartLines, cartTotal, cashChips, changeFor, setQty, type Cart } from '@/lib/cart';
import { formatPeso } from '@/lib/money';
import { sell } from './actions';

type Plan = { plan_id: string; plan_name: string; price_centavos: number; available: number; low_stock?: boolean };
type Tab = 'plans' | 'cart' | 'pay';

export function SellForm({ plans, initialPlan }: { plans: Plan[]; initialPlan?: string }) {
  const stock = Object.fromEntries(plans.map((p) => [p.plan_id, p.available]));
  const prices = Object.fromEntries(plans.map((p) => [p.plan_id, p.price_centavos]));
  const [cart, setCart] = useState<Cart>(() => (initialPlan && stock[initialPlan] > 0 ? { [initialPlan]: 1 } : {}));
  const [tab, setTab] = useState<Tab>(() => (initialPlan && stock[initialPlan] > 0 ? 'cart' : 'plans'));
  const [tendered, setTendered] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [error, setError] = useState('');
  const [reused, setReused] = useState(false);
  const [clearing, setClearing] = useState(false);
  // One key per sell attempt, kept across retries so a lost response cannot double-sell.
  const [key] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();

  const count = cartCount(cart);
  const total = cartTotal(cart, prices);
  const lines = cartLines(cart, plans);
  const change = count > 0 && tendered !== null ? changeFor(total, tendered) : null;
  const ready = count > 0 && change !== null && change >= 0;
  const shown: Tab = count === 0 && tab === 'pay' ? 'cart' : tab; // nothing to pay for

  const go = (t: Tab) => { setTab(t); setClearing(false); };
  const updateQty = (id: string, qty: number) => {
    setCart((c) => setQty(c, id, qty, stock));
    setTendered(null); // the total moved, so the cash received must be chosen again
    setClearing(false);
  };
  const clearCart = () => {
    if (!clearing) return setClearing(true);
    setCart({});
    setTendered(null);
    setClearing(false);
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
        setError('Network problem. Tap Confirm sale again to retry safely.');
      }
    });

  const stepper = (p: { plan_id: string; plan_name: string; available: number }) => {
    const q = cart[p.plan_id] ?? 0;
    return (
      <div className="stepper" role="group" aria-label={`Quantity for ${p.plan_name}`}>
        <button type="button" aria-label={`Remove one ${p.plan_name}`} disabled={q === 0} onClick={() => updateQty(p.plan_id, q - 1)}>−</button>
        <output aria-live="polite">{q}</output>
        <button type="button" aria-label={`Add one ${p.plan_name}`} disabled={count >= MAX_VOUCHERS || q >= p.available} onClick={() => updateQty(p.plan_id, q + 1)}>+</button>
      </div>
    );
  };

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'plans', label: 'Plans' },
    { id: 'cart', label: `My cart (${count})` },
    { id: 'pay', label: 'Pay', disabled: count === 0 },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Sale steps" className="tabs">
        {tabs.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={shown === t.id} aria-controls="sell-panel"
            disabled={t.disabled} onClick={() => go(t.id)} className="chip">
            {t.label}
          </button>
        ))}
      </div>

      <p role="status" className="text-lg font-semibold">
        {count === 0 ? 'Your cart is empty' : `${count} ${count === 1 ? 'voucher' : 'vouchers'} · ${formatPeso(total)}`}
      </p>
      {count >= MAX_VOUCHERS && <p className="alert alert-warn">You can sell at most {MAX_VOUCHERS} vouchers at a time.</p>}

      <div id="sell-panel" role="tabpanel" aria-labelledby={`tab-${shown}`} className="flex flex-col gap-5">
        {shown === 'plans' && (
          <>
            <ul className="flex flex-col gap-3" aria-label="Plans">
              {plans.map((p) => (
                <li key={p.plan_id} data-on={(cart[p.plan_id] ?? 0) > 0} className="plan-row card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.plan_name}</p>
                    <p className="text-sm text-mute">
                      {formatPeso(p.price_centavos)} · {p.available === 0 ? 'Sold out' : `${p.available} left${p.low_stock ? ' (running low)' : ''}`}
                    </p>
                  </div>
                  {stepper(p)}
                </li>
              ))}
            </ul>
            <button type="button" disabled={count === 0} onClick={() => go('cart')} className="btn">
              {count === 0 ? 'Add a plan to start' : `View cart (${count})`}
            </button>
          </>
        )}

        {shown === 'cart' && (count === 0 ? (
          <>
            <p className="text-mute">Nothing here yet. Choose a plan to add it to the cart.</p>
            <button type="button" onClick={() => go('plans')} className="btn">Choose plans</button>
          </>
        ) : (
          <>
            <ul className="flex flex-col gap-3" aria-label="Cart">
              {lines.map((l) => (
                <li key={l.id} className="card flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{l.name}</p>
                    <p className="text-sm text-mute">{l.qty} × {formatPeso(l.unit)} = {formatPeso(l.subtotal)}</p>
                  </div>
                  {stepper({ plan_id: l.id, plan_name: l.name, available: stock[l.id] ?? 0 })}
                </li>
              ))}
            </ul>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Guest name (optional)" aria-label="Guest name" className="field" />
            <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={20} placeholder="Room (optional)" aria-label="Room" className="field" />
            <button type="button" onClick={() => go('pay')} className="btn">Go to payment</button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => go('plans')} className="btn btn-ghost">More plans</button>
              <button type="button" onClick={clearCart} onBlur={() => setClearing(false)} className="btn btn-ghost">
                {clearing ? 'Tap again to clear' : 'Clear cart'}
              </button>
            </div>
          </>
        ))}

        {shown === 'pay' && (
          <>
            <ul className="card flex flex-col gap-1" aria-label="Order summary">
              {lines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3"><span>{l.qty} × {l.name}</span><span>{formatPeso(l.subtotal)}</span></li>
              ))}
              {(name || room) && <li className="text-sm text-mute">{[name, room && `Room ${room}`].filter(Boolean).join(' · ')}</li>}
            </ul>
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
            {error && (
              <p role="alert" className="alert alert-bad">
                {error}{reused && <> <Link href="/sales" className="font-semibold underline">Open Sales</Link></>}
              </p>
            )}
            <button disabled={!ready || pending} aria-busy={pending} onClick={submit} className="btn">
              {pending ? 'Selling…' : 'Confirm sale'}
            </button>
            <button type="button" onClick={() => go('cart')} className="btn btn-ghost">Back to cart</button>
          </>
        )}
      </div>
    </div>
  );
}
