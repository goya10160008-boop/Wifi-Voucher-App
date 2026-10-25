'use client';
import { useActionState, useEffect, useState } from 'react';
import { login, pinLogin } from './actions';

const NAME_KEY = 'login:username';
const MAX = 8; // the box takes 6 to 8 digits; the server decides what is valid
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

function PinForm() {
  const [state, action, pending] = useActionState(pinLogin, undefined);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');

  useEffect(() => {
    try { setUsername(localStorage.getItem(NAME_KEY) ?? ''); } catch {} // the phone remembers the name, never the PIN
  }, []);
  // A failed try clears the dots, so the next one starts fresh.
  useEffect(() => { if (state?.error) setPin(''); }, [state]);

  const press = (k: string) => setPin((p) => (k === '⌫' ? p.slice(0, -1) : p.length < MAX ? p + k : p));
  // Physical keyboard too, but never while typing in the username box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  return (
    <form
      action={action}
      onSubmit={() => { try { localStorage.setItem(NAME_KEY, username.trim().toLowerCase()); } catch {} }}
      className="card flex flex-col gap-4 p-5"
    >
      <input
        name="username" value={username} onChange={(e) => setUsername(e.target.value)} required
        autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" placeholder="Username" aria-label="Username" className="field"
      />
      <input type="hidden" name="pin" value={pin} />
      <div role="img" aria-label={`${pin.length} digits entered`} className="flex min-h-6 justify-center gap-3">
        {Array.from({ length: Math.max(6, pin.length) }, (_, i) => (
          <span key={i} className={`h-4 w-4 rounded-full border border-current ${i < pin.length ? 'bg-current' : ''}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k, i) => k === '' ? <span key={i} /> : (
          <button key={i} type="button" onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete last digit' : k}
            className="btn btn-ghost" style={{ minHeight: 56, fontSize: 22 }}>{k}</button>
        ))}
      </div>
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      <button disabled={pending || pin.length < 6 || !username.trim()} aria-busy={pending} className="btn">{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function PasswordForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="card flex flex-col gap-4 p-5">
      <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className="field" />
      <input name="password" type="password" required autoComplete="current-password" placeholder="Password" aria-label="Password" className="field" />
      {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
      <button disabled={pending} aria-busy={pending} className="btn">{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

export function LoginForm({ idle }: { idle: boolean }) {
  const [usePassword, setUsePassword] = useState(false);
  return (
    <main className="fade-in mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-mute">Welcome back</p>
        <h1 className="h1">A&amp;B WiFi Vouchers</h1>
      </div>
      {idle && <p role="status" className="alert alert-warn">You were signed out because you were idle.</p>}
      {usePassword ? <PasswordForm /> : <PinForm />}
      <button type="button" onClick={() => setUsePassword((v) => !v)} className="btn btn-ghost">
        {usePassword ? 'Use my PIN instead' : 'Use email and password instead'}
      </button>
    </main>
  );
}
