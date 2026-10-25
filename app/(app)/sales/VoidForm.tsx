'use client';
import { useActionState } from 'react';
import { voidSale } from './actions';

export function VoidForm({ id }: { id: string }) {
  const [state, run, pending] = useActionState(voidSale, undefined);
  return (
    <form action={run} className="flex flex-col gap-3 rounded-xl border border-red-300 p-4">
      <input type="hidden" name="id" value={id} />
      <label className="font-semibold" htmlFor="reason">Void this sale</label>
      <p className="text-sm text-gray-700">The code is burned and will never be sold again.</p>
      <input id="reason" name="reason" required minLength={3} maxLength={200} placeholder="Reason"
        className="min-h-12 rounded-lg border border-gray-400 px-3 text-base" />
      {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
      <button disabled={pending} className="min-h-12 rounded-lg bg-red-700 px-4 font-semibold text-white disabled:opacity-50">
        {pending ? 'Voiding…' : 'Void sale'}
      </button>
    </form>
  );
}
