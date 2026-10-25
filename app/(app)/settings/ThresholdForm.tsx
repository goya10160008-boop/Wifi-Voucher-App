'use client';
import { useActionState } from 'react';
import { saveThreshold } from './actions';

export function ThresholdForm({ value }: { value: number }) {
  const [state, run, pending] = useActionState(saveThreshold, undefined);
  return (
    <form action={run} className="flex flex-col gap-3">
      <label htmlFor="threshold" className="font-semibold">Warn me when a plan has this many codes or fewer</label>
      <input id="threshold" name="threshold" inputMode="numeric" defaultValue={value}
        className="min-h-12 rounded-lg border border-gray-400 px-3 text-base" />
      {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
      {state?.ok && <p role="status" className="text-green-700">Saved.</p>}
      <button disabled={pending} className="min-h-12 rounded-lg bg-blue-700 px-4 font-semibold text-white disabled:opacity-50">Save</button>
    </form>
  );
}
