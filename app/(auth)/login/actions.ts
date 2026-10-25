'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  if (!email || !password || email.length > 254 || password.length > 200) {
    return { error: 'Enter your email and password.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'Wrong email or password.' };
  redirect('/');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

// Same as logout, but the login page explains why (fixed notice, see LoginPage).
export async function idleLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login?reason=idle');
}
