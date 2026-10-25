'use client';
import { useActionState } from 'react';
import { voidSale } from './actions';

export function VoidForm({ id }: { id: string }) {
  const [state, run, pending] = useActionState(voidSale, undefined);
  return (
    <form action={run} className="card flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="font-semibold" htmlFor="reason">Void this sale</label>
      <p className="text-sm text-mute">The code is burned and will never be sold again.</p>
      <input id="reason" name="reason" required minLength={3} maxLength={200} placeholder="Reason" className="field" />
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      <button disabled={pending} aria-busy={pending} className="btn btn-danger">{pending ? 'Voiding…' : 'Void sale'}</button>
    </form>
  );
}
