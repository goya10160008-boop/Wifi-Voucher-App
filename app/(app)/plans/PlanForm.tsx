'use client';
import { useActionState } from 'react';

type Plan = { id: string; name: string; duration_minutes: number; price_centavos: number; sort_order: number };
type Action = (p: { error?: string; ok?: boolean } | undefined, f: FormData) => Promise<{ error?: string; ok?: boolean } | undefined>;

const input = 'min-h-12 w-full rounded-lg border border-gray-400 px-3 text-base';

export function PlanForm({ action, plan, submitLabel }: { action: Action; plan?: Plan; submitLabel: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="grid grid-cols-2 gap-3">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <input name="name" required maxLength={60} placeholder="Name (e.g. 3 Hours)" defaultValue={plan?.name}
        className={`${input} col-span-2`} aria-label="Plan name" />
      <input name="hours" required inputMode="decimal" placeholder="Hours" defaultValue={plan ? plan.duration_minutes / 60 : ''}
        className={input} aria-label="Hours" />
      <input name="price" required inputMode="decimal" placeholder="Price ₱" defaultValue={plan ? plan.price_centavos / 100 : ''}
        className={input} aria-label="Price in pesos" />
      <input name="sort_order" inputMode="numeric" placeholder="Sort order" defaultValue={plan?.sort_order ?? 0}
        className={input} aria-label="Sort order" />
      <button disabled={pending} className="min-h-12 rounded-lg bg-blue-700 px-4 font-semibold text-white disabled:opacity-50">
        {pending ? 'Saving…' : submitLabel}
      </button>
      {state?.error && <p role="alert" className="col-span-2 text-red-700">{state.error}</p>}
      {state?.ok && <p className="col-span-2 text-green-700">Saved.</p>}
    </form>
  );
}
