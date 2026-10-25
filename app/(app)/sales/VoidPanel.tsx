'use client';
import { useActionState, useState } from 'react';
import { REASONS, type ReasonCode } from '@/lib/void-reasons';
import { rpcMessage } from '@/lib/rpc-errors';
import { voidReceipt, voidSale } from './actions';

const word = (n: number) => `${n} ${n === 1 ? 'code' : 'codes'}`;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Owner only. Voids the WHOLE receipt with one reason. "Owner Test" puts the codes back on sale, so it needs the
 * word TEST typed. The block message is display only: the database repeats every check and is the authority.
 */
export function VoidPanel({ refId, live, total, block }: {
  refId: string; live: { id: string; code: string }[]; total: number; block: 'STAFF_SALE' | 'TOO_OLD' | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReasonCode | ''>('');
  const [typed, setTyped] = useState('');
  const [state, run, pending] = useActionState(voidReceipt, undefined);
  const [oneState, runOne, onePending] = useActionState(voidSale, undefined);
  const [oneReason, setOneReason] = useState('');

  const n = live.length;
  const already = total - n;
  const test = reason === 'owner_test';
  const blocked = test && block ? rpcMessage({ message: block }) : '';
  const what = test
    ? `${cap(word(n))} will go back on sale.`
    : `${cap(word(n))} will be voided and stay burned. ${n === 1 ? 'It' : 'They'} will never be sold again.`;
  const rest = already ? ` ${word(already)} already voided ${already === 1 ? 'stays' : 'stay'} as ${already === 1 ? 'it is' : 'they are'}.` : '';
  const ready = reason !== '' && (reason !== 'owner_test' || typed.trim().toUpperCase() === 'TEST') && !blocked;

  if (!open) {
    return <button type="button" className="btn btn-ghost" aria-expanded="false" onClick={() => setOpen(true)}>Void this receipt</button>;
  }
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold">Void this receipt</p>
        <button type="button" className="btn btn-ghost guest-close" aria-expanded="true" onClick={() => setOpen(false)}>Close</button>
      </div>
      <p className="text-mute">{already ? `${n} of ${total} codes will be voided.` : n === 1 ? 'This code will be voided.' : `All ${n} codes of this receipt will be voided.`}</p>

      <form action={run} className="flex flex-col gap-3">
        <input type="hidden" name="ref" value={refId} />
        <label htmlFor="void-reason" className="font-semibold">Reason</label>
        <select id="void-reason" name="reason" required value={reason} onChange={(e) => { setReason(e.target.value as ReasonCode | ''); setTyped(''); }} className="field">
          <option value="">Choose a reason…</option>
          {REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
        {reason === 'other' && (
          <input name="note" required minLength={3} maxLength={200} placeholder="Type the reason" aria-label="Type the reason" className="field" autoComplete="off" />
        )}
        {reason !== '' && <p className="alert alert-warn">{what}{rest}</p>}
        {test && (
          <>
            <p className="alert alert-warn">Use this only for your own test, never for a real guest. If a guest already has a code, the next buyer gets the same code.</p>
            <label htmlFor="void-typed" className="font-semibold">Type TEST to confirm</label>
            <input id="void-typed" name="typed" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" className="field" />
          </>
        )}
        {blocked && <p role="alert" className="alert alert-bad">{blocked}</p>}
        {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
        <button disabled={!ready || pending} aria-busy={pending} className="btn btn-danger">
          {pending ? 'Voiding…' : test ? `Void and return ${word(n)} to stock` : `Void ${word(n)}`}
        </button>
      </form>

      {n > 1 && (
        <details className="mt-1">
          <summary className="flex min-h-12 cursor-pointer items-center font-semibold text-pri underline">Void just one code</summary>
          <form action={runOne} className="mt-2 flex flex-col gap-3">
            <p className="text-sm text-mute">For a code that did not work. The guest&apos;s other codes stay valid.</p>
            <select name="id" required aria-label="Which code" className="field" defaultValue="">
              <option value="">Which code?</option>
              {live.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select>
            <select name="reason" required aria-label="Reason for this code" value={oneReason} onChange={(e) => setOneReason(e.target.value)} className="field">
              <option value="">Choose a reason…</option>
              {REASONS.filter((r) => r.code !== 'owner_test').map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
            {oneReason === 'other' && <input name="note" required minLength={3} maxLength={200} placeholder="Type the reason" aria-label="Type the reason" className="field" autoComplete="off" />}
            {oneState?.error && <p role="alert" className="alert alert-bad">{oneState.error}</p>}
            <button disabled={onePending} aria-busy={onePending} className="btn btn-danger">{onePending ? 'Voiding…' : 'Void this code'}</button>
          </form>
        </details>
      )}
    </div>
  );
}
