'use client';
import { useState, useTransition } from 'react';
import { formatPeso } from '@/lib/money';
import { sell } from './actions';

type Plan = { plan_id: string; plan_name: string; price_centavos: number; available: number };
const CHIPS = [2000, 5000, 10000, 20000, 50000, 100000];

export function SellForm({ plans, initialPlan }: { plans: Plan[]; initialPlan?: string }) {
  const [planId, setPlanId] = useState(plans.some((p) => p.plan_id === initialPlan) ? initialPlan! : '');
  const [tendered, setTendered] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const [error, setError] = useState('');
  // One key per sell attempt, kept across retries so a lost response cannot double-sell.
  const [key] = useState(() => crypto.randomUUID());
  const [pending, start] = useTransition();

  const plan = plans.find((p) => p.plan_id === planId);
  const chips = plan ? [plan.price_centavos, ...CHIPS.filter((c) => c > plan.price_centavos)].slice(0, 5) : [];
  const change = plan && tendered !== null ? tendered - plan.price_centavos : null;
  const ready = plan && plan.available > 0 && change !== null && change >= 0;

  const submit = () =>
    start(async () => {
      setError('');
      try {
        const r = await sell({ key, planId, tenderedCentavos: tendered ?? 0, buyerName: name, buyerRoom: room });
        if (r?.error) setError(r.error);
      } catch {
        setError('Network problem. Tap Confirm again to retry safely.');
      }
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <button key={p.plan_id} role="radio" aria-checked={p.plan_id === planId} disabled={p.available === 0}
            onClick={() => { setPlanId(p.plan_id); setTendered(null); }} className="pick">
            <span>{p.plan_name}</span>
            <span>{formatPeso(p.price_centavos)}</span>
            <span className="text-sm font-medium text-mute">{p.available} left</span>
          </button>
        ))}
      </div>

      {plan && (
        <div className="fade-in flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c} onClick={() => setTendered(c)} aria-pressed={tendered === c} className="chip">
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

      {error && <p role="alert" className="alert alert-bad">{error}</p>}
      <button disabled={!ready || pending} aria-busy={pending} onClick={submit} className="btn">
        {pending ? 'Selling…' : 'Confirm sale'}
      </button>
    </div>
  );
}
