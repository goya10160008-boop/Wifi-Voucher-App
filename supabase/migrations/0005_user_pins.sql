-- Stage 3 (v1a): staff PIN sign-in. ADDITIVE; needs 0003 and 0004 first. Staff only: no owner PIN exists until 0006.
-- Apply to the remote project only with the owner's approval. The app's PIN login also needs the SUPABASE_SECRET_KEY Worker secret.

create extension if not exists pgcrypto with schema extensions;

alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'sale','void','import','plan_create','plan_update','plan_archive','plan_restore',
  'settings_update','staff_add','staff_deactivate','staff_reactivate','role_change',
  'login','logout','idle_signout','csv_export',
  'pin_set','pin_reset','pin_unlocked','pin_locked'));

-- Only functions touch this table: no policy and no grant for anyone, not even the owner.
create table if not exists public.user_pins (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  username        text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  pin_hash        text not null,                      -- bcrypt; the PIN itself is never stored or logged
  failed          integer not null default 0,
  lockouts        integer not null default 0,
  last_lockout_at timestamptz,
  locked_until    timestamptz,
  hard_locked     boolean not null default false,     -- second lockout within 24 hours: only the owner can unlock
  set_at          timestamptz not null default now(),
  set_by          uuid
);
alter table public.user_pins enable row level security;
revoke all on public.user_pins from public, anon, authenticated, service_role;

-- Same rules as lib/pin.ts (6 digits): not one repeated digit, not a straight run, not a repeated block.
create or replace function public.pin_is_weak(p text) returns boolean
language sql immutable set search_path = '' as $$
  select p !~ '^[0-9]{6}$'
      or p ~ '^(.)\1{5}$'
      or p in ('012345','123456','234567','345678','456789','987654','876543','765432','654321','543210')
      or p ~ '^(..)\1\1$'
      or p ~ '^(...)\1$';
$$;

create or replace function public.set_user_pin(p_user uuid, p_username text, p_pin text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name   text;
  v_user   text := lower(btrim(coalesce(p_username, '')));
  v_exists boolean;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  select p.display_name into v_name from public.profiles p where p.user_id = p_user and p.role = 'staff' and p.active;
  if not found then raise exception 'not an active staff member' using errcode = '22023'; end if;
  if v_user !~ '^[a-z0-9_]{3,20}$' then raise exception 'bad username' using errcode = '22023'; end if;
  if public.pin_is_weak(p_pin) then raise exception 'weak pin' using errcode = '22023'; end if;
  select exists (select 1 from public.user_pins where user_id = p_user) into v_exists;
  insert into public.user_pins (user_id, username, pin_hash, set_by)
  values (p_user, v_user, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), auth.uid())
  on conflict (user_id) do update set
    username = excluded.username, pin_hash = excluded.pin_hash, set_by = excluded.set_by, set_at = now(),
    failed = 0, lockouts = 0, last_lockout_at = null, locked_until = null, hard_locked = false;
  perform public.audit_write(case when v_exists then 'pin_reset' else 'pin_set' end, 'profile', p_user::text,
    jsonb_build_object('name', v_name, 'username', v_user));
end;
$$;

create or replace function public.unlock_user_pin(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.user_pins set failed = 0, lockouts = 0, last_lockout_at = null, locked_until = null, hard_locked = false
   where user_id = p_user;
  if not found then raise exception 'no pin' using errcode = '22023'; end if;
  select p.display_name into v_name from public.profiles p where p.user_id = p_user;
  perform public.audit_write('pin_unlocked', 'profile', p_user::text, jsonb_build_object('name', v_name));
end;
$$;

-- Checks a PIN and applies the lockout in one locked step (staff: 5 tries, then 15 minutes; a second lockout within
-- 24 hours is a hard lock). Same rules as lib/lockout.ts. Only the server's service_role key can call it.
-- It never raises for a wrong PIN, so the failure count is always saved.
create or replace function public.user_pin_verify(p_username text, p_pin text)
returns table (ok boolean, user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  r        public.user_pins%rowtype;
  v_role   text;
  v_active boolean;
  v_name   text;
  v_again  boolean;
begin
  select * into r from public.user_pins u where u.username = lower(coalesce(p_username, '')) for update;
  if not found then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10)); -- same cost as a real check
    return query select false, null::uuid; return;
  end if;
  select p.role, p.active, p.display_name into v_role, v_active, v_name from public.profiles p where p.user_id = r.user_id;
  if v_role is distinct from 'staff' or not coalesce(v_active, false)
     or r.hard_locked or (r.locked_until is not null and r.locked_until > now()) then
    perform extensions.crypt(coalesce(p_pin, ''), extensions.gen_salt('bf', 10));
    return query select false, null::uuid; return;
  end if;

  if extensions.crypt(coalesce(p_pin, ''), r.pin_hash) = r.pin_hash then
    update public.user_pins u set failed = 0 where u.user_id = r.user_id;
    return query select true, r.user_id; return;
  end if;

  if r.failed + 1 < 5 then
    update public.user_pins u set failed = r.failed + 1 where u.user_id = r.user_id;
  else
    v_again := r.last_lockout_at is not null and now() - r.last_lockout_at < interval '24 hours';
    update public.user_pins u set failed = 0,
      lockouts = case when v_again then r.lockouts + 1 else 1 end, last_lockout_at = now(),
      hard_locked = v_again, locked_until = case when v_again then null else now() + interval '15 minutes' end
     where u.user_id = r.user_id;
    insert into public.audit_log (actor, actor_name, action, target_type, target_id, detail)
    values (r.user_id, coalesce(nullif(btrim(v_name), ''), 'Unknown user'), 'pin_locked', 'profile', r.user_id::text,
            jsonb_build_object('hard', v_again));
  end if;
  return query select false, null::uuid;
end;
$$;

-- For the owner's Staff page. Never returns a hash.
create or replace function public.user_pin_status()
returns table (user_id uuid, display_name text, active boolean, username text, set_at timestamptz, locked boolean, hard_locked boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  return query
    select p.user_id, p.display_name, p.active, u.username, u.set_at,
           coalesce(u.hard_locked or u.locked_until > now(), false), coalesce(u.hard_locked, false)
      from public.profiles p left join public.user_pins u on u.user_id = p.user_id
     where p.role = 'staff'
     order by p.active desc, p.display_name;
end;
$$;

-- Deactivate or reactivate a staff member (the 0003 profiles trigger writes the log entry). Owners cannot be targeted.
create or replace function public.set_staff_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.profiles p set active = p_active where p.user_id = p_user and p.role = 'staff';
  if not found then raise exception 'not a staff member' using errcode = '22023'; end if;
end;
$$;

revoke execute on function public.pin_is_weak(text), public.set_user_pin(uuid, text, text), public.unlock_user_pin(uuid),
  public.user_pin_verify(text, text), public.user_pin_status(), public.set_staff_active(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_user_pin(uuid, text, text), public.unlock_user_pin(uuid),
  public.user_pin_status(), public.set_staff_active(uuid, boolean) to authenticated;
grant execute on function public.user_pin_verify(text, text) to service_role;
