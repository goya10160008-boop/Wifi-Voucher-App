'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="fade-in mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-mute">Welcome back</p>
        <h1 className="h1">A&amp;B WiFi Vouchers</h1>
      </div>
      <form action={action} className="card flex flex-col gap-4 p-5">
        <input name="email" type="email" required autoComplete="email" placeholder="Email" aria-label="Email" className="field" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password" aria-label="Password" className="field" />
        {state?.error && <p role="alert" className="alert alert-bad">{state.error}</p>}
        <button disabled={pending} aria-busy={pending} className="btn">{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
