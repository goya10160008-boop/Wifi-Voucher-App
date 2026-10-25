'use client';
import { useActionState } from 'react';

type Plan = { id: string; name: string; duration_minutes: number; price_centavos: number };
type Action = (p: { error?: string; ok?: boolean } | undefined, f: FormData) => Promise<{ error?: string; ok?: boolean } | undefined>;

export function PlanForm({ action, plan, submitLabel }: { action: Action; plan?: Plan; submitLabel: string }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} className="grid grid-cols-2 gap-3">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <input name="name" required maxLength={60} placeholder="Name (e.g. 3 Hours)" defaultValue={plan?.name}
        className="field col-span-2" aria-label="Plan name" />
      <input name="hours" required inputMode="decimal" placeholder="Hours" defaultValue={plan ? plan.duration_minutes / 60 : ''}
        className="field" aria-label="Hours" />
      <input name="price" required inputMode="decimal" placeholder="Price ₱" defaultValue={plan ? plan.price_centavos / 100 : ''}
        className="field" aria-label="Price in pesos" />
      <button disabled={pending} aria-busy={pending} className="btn col-span-2">{pending ? 'Saving…' : submitLabel}</button>
      {state?.error && <p role="alert" className="alert alert-bad col-span-2">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok col-span-2">Saved.</p>}
    </form>
  );
}
