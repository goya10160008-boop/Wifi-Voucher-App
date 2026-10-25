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

  const field = 'min-h-12 w-full rounded-lg border border-gray-400 px-3 text-base';
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Plan">
        {plans.map((p) => (
          <button key={p.plan_id} role="radio" aria-checked={p.plan_id === planId} disabled={p.available === 0}
            onClick={() => { setPlanId(p.plan_id); setTendered(null); }}
            className={`min-h-16 rounded-xl border-2 p-3 text-left disabled:opacity-40 ${p.plan_id === planId ? 'border-blue-700 bg-blue-50' : 'border-gray-300'}`}>
            <div className="font-semibold">{p.plan_name}</div>
            <div>{formatPeso(p.price_centavos)}</div>
            <div className="text-sm text-gray-600">{p.available} left</div>
          </button>
        ))}
      </div>

      {plan && (
        <>
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button key={c} onClick={() => setTendered(c)} aria-pressed={tendered === c}
                className={`min-h-12 rounded-lg border px-4 ${tendered === c ? 'border-blue-700 bg-blue-50' : 'border-gray-400'}`}>
                {formatPeso(c)}
              </button>
            ))}
          </div>
          <p className="text-lg" role="status">
            {change === null ? 'Tap the cash received' : change >= 0 ? `Change: ${formatPeso(change)}` : 'Not enough cash'}
          </p>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Guest name (optional)" className={field} />
          <input value={room} onChange={(e) => setRoom(e.target.value)} maxLength={20} placeholder="Room (optional)" className={field} />
        </>
      )}

      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={!ready || pending} onClick={submit}
        className="min-h-14 rounded-lg bg-blue-700 px-4 text-lg font-semibold text-white disabled:opacity-50">
        {pending ? 'Selling…' : 'Confirm sale'}
      </button>
    </div>
  );
}
