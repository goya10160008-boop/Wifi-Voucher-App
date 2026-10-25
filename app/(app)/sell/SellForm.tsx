'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { MAX_VOUCHERS, cartCount, cartLines, cartTotal, cashChips, otherAmount, payStatus, setQty, type Cart } from '@/lib/cart';
import { formatPeso } from '@/lib/money';
import { sell } from './actions';

type Plan = { plan_id: string; plan_name: string; price_centavos: number; available: number; low_stock?: boolean };
type Tab = 'plans' | 'cart' | 'pay';
const STEPS: { id: Tab; label: string }[] = [{ id: 'plans', label: 'Plans' }, { id: 'cart', label: 'My cart' }, { id: 'pay', label: 'Pay' }];

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3" />
  </svg>
);

export function SellForm({ plans, initialPlan }: { plans: Plan[]; initialPlan?: string }) {
  const stock = Object.fromEntries(plans.map((p) => [p.plan_id, p.available]));
  const prices = Object.fromEntries(plans.map((p) => [p.plan_id, p.price_centavos]));
  const [cart, setCart] = useState<Cart>(() => (initialPlan && stock[initialPlan] > 0 ? { [initialPlan]: 1 } : {}));
  const [tab, setTab] = useState<Tab>(() => (initialPlan && stock[initialPlan] > 0 ? 'cart' : 'plans'));
  const [tendered, setTendered] = useState<number | null>(null);
  const [other, setOther] = useState('');
  const [otherError, setOtherError] = useState('');
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);
  const [error, setError] = useState('');
  const [reused, setReused] = useState(false);
  const [clearing, setClearing] = useState(false);
  // One key per sell attempt, kept across retries so a lost response cannot double-sell.
  const [key] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();

  const count = cartCount(cart);
  const total = cartTotal(cart, prices);
  const lines = cartLines(cart, plans);
  const pay = payStatus(total, tendered);
  const ready = count > 0 && (pay.state === 'exact' || pay.state === 'over');
  const shown: Tab = count === 0 && tab === 'pay' ? 'cart' : tab; // nothing to pay for
  const guest = [name.trim(), room.trim() && `Room ${room.trim()}`].filter(Boolean).join(' · ');

  const go = (t: Tab) => { setTab(t); setClearing(false); };
  const resetCash = () => { setTendered(null); setOther(''); setOtherError(''); };
  const updateQty = (id: string, qty: number) => {
    setCart((c) => setQty(c, id, qty, stock));
    resetCash(); // the total moved, so the cash received must be chosen again
    setClearing(false);
  };
  const clearCart = () => {
    if (!clearing) return setClearing(true);
    setCart({});
    resetCash();
    setClearing(false);
  };
  const pickCash = (c: number) => { setTendered(c); setOther(''); setOtherError(''); };
  const useOther = () => {
    const c = otherAmount(other);
    if (c === null) return setOtherError('Please type the amount in pesos, for example 250.');
    setOtherError('');
    setTendered(c);
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

  const at = STEPS.findIndex((s) => s.id === shown);
  const changeText = {
    none: ['Change', 'Tap the cash below'],
    short: ['Not enough cash', `Add ${formatPeso(pay.missing)} more`],
    exact: ['✓ Exact amount', 'No change'],
    over: ['✓ Change to give back', formatPeso(pay.change)],
  }[pay.state];

  return (
    <div className="flex flex-col gap-5">
      <ol role="tablist" aria-label="Sale steps" className="track">
        {STEPS.map((s, k) => {
          const locked = s.id === 'pay' && count === 0;
          const st = locked ? 'locked' : k < at ? 'done' : k === at ? 'now' : 'todo';
          const label = s.id === 'cart' ? `My cart (${count})` : s.label;
          return (
            <li key={s.id} role="presentation" className="tnode" data-s={st} data-line={k < at ? 'on' : 'off'}>
              <button role="tab" type="button" id={`tab-${s.id}`} aria-selected={shown === s.id} aria-controls="sell-panel" disabled={locked}
                aria-label={`${label}${locked ? ' (locked)' : st === 'done' ? ' (done)' : ''}`} onClick={() => go(s.id)}>
                {locked ? <LockIcon /> : st === 'done' ? '✓' : k + 1}
              </button>
              <span>{label}</span>
              {locked && <small>Locked</small>}
            </li>
          );
        })}
      </ol>

      <p role="status" className="text-lg font-semibold">
        {count === 0 ? 'Your cart is empty' : `${count} ${count === 1 ? 'voucher' : 'vouchers'} · ${formatPeso(total)}`}
      </p>
      {count >= MAX_VOUCHERS && <p className="alert alert-warn">You can sell at most {MAX_VOUCHERS} vouchers at a time.</p>}

      <div id="sell-panel" role="tabpanel" aria-labelledby={`tab-${shown}`} className="flex flex-col gap-5">
        {shown === 'plans' && (
          <>
            <ul className="flex flex-col gap-3" aria-label="Plans">
              {plans.map((p) => (
                <li key={p.plan_id} data-on={(cart[p.plan_id] ?? 0) > 0} className="plan-row card row1 flex items-center justify-between gap-3">
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
                <li key={l.id} className="card row1 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{l.name}</p>
                    <p className="text-sm text-mute">{l.qty} × {formatPeso(l.unit)} = {formatPeso(l.subtotal)}</p>
                  </div>
                  {stepper({ plan_id: l.id, plan_name: l.name, available: stock[l.id] ?? 0 })}
                </li>
              ))}
            </ul>
            {guestOpen ? (
              <div id="guest-box" className="card flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold">Guest name and room</p>
                  <button type="button" className="btn btn-ghost guest-close" aria-expanded="true" aria-controls="guest-box" onClick={() => setGuestOpen(false)}>Close</button>
                </div>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Guest name (optional)" aria-label="Guest name" autoComplete="off" autoFocus className="field" />
                <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={20} placeholder="Room (optional)" aria-label="Room" autoComplete="off" className="field" />
              </div>
            ) : (
              <button type="button" className="guest-toggle" aria-expanded="false" aria-controls="guest-box" onClick={() => setGuestOpen(true)}>
                {guest ? <><span>{guest}</span><span className="guest-edit">(edit)</span></> : <span>+ Add guest name or room (optional)</span>}
              </button>
            )}
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
              {guest && <li className="text-sm text-mute">{guest}</li>}
            </ul>
            <div className="sb">
              <div className="sbtile"><span>TOTAL</span><b>{formatPeso(total)}</b></div>
              <div className="sbtile" data-s={tendered === null ? 'none' : 'set'}>
                <span>CASH</span><b>{tendered === null ? 'Not chosen' : formatPeso(tendered)}</b>
              </div>
            </div>
            <div className="sbchange" data-s={pay.state} role="status">
              <span>{changeText[0]}</span><b>{changeText[1]}</b>
            </div>
            <p className="text-lg font-semibold">Tap the cash received</p>
            <div className="flex flex-wrap gap-2">
              {cashChips(total).map((c) => (
                <button key={c} type="button" onClick={() => pickCash(c)} aria-pressed={tendered === c} className="chip cash-chip">
                  {formatPeso(c)}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="other" className="mb-1.5 block text-lg font-semibold">Other amount (pesos)</label>
              <div className="flex gap-2">
                <input id="other" value={other} onChange={(e) => setOther(e.target.value)} inputMode="decimal" autoComplete="off"
                  placeholder="for example 250" className="field" style={{ minHeight: 56 }} />
                <button type="button" className="btn btn-ghost" style={{ minWidth: '7rem' }} onClick={useOther}>Use it</button>
              </div>
              {otherError && <p role="alert" className="alert alert-bad mt-2">{otherError}</p>}
            </div>
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
