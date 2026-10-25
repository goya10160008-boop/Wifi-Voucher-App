-- Minimal Supabase stand-in for a plain local Postgres (no Docker). Run BEFORE 0001_init.sql.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
-- Real Supabase lets signed-in and anonymous requests call auth.uid() (policies use it directly);
-- needed so RLS tests can run as the real `authenticated` / `anon` roles.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
