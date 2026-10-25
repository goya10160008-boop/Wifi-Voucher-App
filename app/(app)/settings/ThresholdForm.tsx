'use client';
import { useActionState } from 'react';
import { saveThreshold } from './actions';

export function ThresholdForm({ value }: { value: number }) {
  const [state, run, pending] = useActionState(saveThreshold, undefined);
  return (
    <form action={run} className="card flex flex-col gap-3">
      <label htmlFor="threshold" className="font-semibold">Warn me when a plan has this many codes or fewer</label>
      <input id="threshold" name="threshold" inputMode="numeric" defaultValue={value} className="field" />
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok">Saved.</p>}
      <button disabled={pending} aria-busy={pending} className="btn">{pending ? 'Saving…' : 'Save'}</button>
    </form>
  );
}
