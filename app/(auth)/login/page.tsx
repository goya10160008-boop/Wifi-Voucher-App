'use client';
import { useActionState } from 'react';
import { login } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">A&amp;B WiFi Vouchers</h1>
      <form action={action} className="flex flex-col gap-4">
        <input name="email" type="email" required autoComplete="email" placeholder="Email"
          className="min-h-12 rounded-lg border border-gray-400 px-3 text-base" />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Password"
          className="min-h-12 rounded-lg border border-gray-400 px-3 text-base" />
        {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
        <button disabled={pending}
          className="min-h-12 rounded-lg bg-blue-700 px-4 text-lg font-semibold text-white disabled:opacity-50">
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
