'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordEvent } from '@/lib/record-event';

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password || email.length > 254 || password.length > 200) {
    return { error: 'Enter your email and password.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Wrong email or password.' };
  await recordEvent(supabase, 'login');
  redirect('/');
}

const PIN_FAIL = { error: 'Wrong username or PIN, or the account is locked. Ask the owner.' };

// Staff sign-in with a PIN. user_pin_verify (service role only) checks the PIN and counts failures under a row lock;
// only after it says yes do we ask Supabase for a one-time link for that user and redeem it at once (no email is sent).
// Every failure returns the same message. The PIN arrives in form data and is never logged.
export async function pinLogin(_prev: { error?: string } | undefined, form: FormData) {
  const username = String(form.get('username') ?? '').trim().toLowerCase();
  const pin = String(form.get('pin') ?? '');
  if (!/^[a-z0-9_]{3,20}$/.test(username) || !/^\d{6}$/.test(pin)) return PIN_FAIL;

  let tokenHash: string | undefined;
  try {
    const admin = createAdminClient();
    const { data } = await admin.rpc('user_pin_verify', { p_username: username, p_pin: pin });
    const hit = data?.[0];
    if (!hit?.ok || !hit.user_id) return PIN_FAIL;
    const email = (await admin.auth.admin.getUserById(hit.user_id)).data.user?.email;
    if (!email) return PIN_FAIL;
    tokenHash = (await admin.auth.admin.generateLink({ type: 'magiclink', email })).data.properties?.hashed_token;
  } catch (e) {
    console.error('pinLogin failed', e instanceof Error ? e.message : 'unknown'); // never the PIN
    return PIN_FAIL;
  }
  if (!tokenHash) return PIN_FAIL;
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
  if (error) return PIN_FAIL;
  await recordEvent(supabase, 'login', { via: 'pin' });
  redirect('/');
}

export async function logout() {
  const supabase = await createClient();
  await recordEvent(supabase, 'logout');
  await supabase.auth.signOut();
  redirect('/login');
}

// Same as logout, but the login page explains why (fixed notice, see LoginPage).
export async function idleLogout() {
  const supabase = await createClient();
  await recordEvent(supabase, 'idle_signout');
  await supabase.auth.signOut();
  redirect('/login?reason=idle');
}
