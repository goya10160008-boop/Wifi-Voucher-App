'use client';
import { useActionState, useState } from 'react';
import { randomPin } from '@/lib/pin';
import { setStaffPin } from './actions';

export function PinForm({ user, username, hasPin }: { user: string; username: string | null; hasPin: boolean }) {
  const [state, run, pending] = useActionState(setStaffPin, undefined);
  const [pin, setPin] = useState('');
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="user" value={user} />
      <input name="username" defaultValue={username ?? ''} required autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="Username (they type this)" aria-label="Username" className="field" />
      <div className="flex gap-2">
        <input name="pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} required inputMode="numeric"
          autoComplete="off" placeholder="6-digit PIN" aria-label="PIN" className="field min-w-0 flex-1" />
        <button type="button" className="btn btn-ghost" onClick={() => setPin(randomPin('staff'))}>Random</button>
      </div>
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      {state?.ok && <p role="status" className="alert alert-ok">Saved. Tell them the PIN in person; it is not shown again.</p>}
      <button disabled={pending} aria-busy={pending} className="btn">{pending ? 'Saving…' : hasPin ? 'Change PIN' : 'Set PIN'}</button>
    </form>
  );
}
