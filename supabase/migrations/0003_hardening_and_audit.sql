-- Stage 1: hardening + owner activity log. ADDITIVE: no existing row is changed or deleted.
-- Apply to the remote project only with the owner's approval (apply this BEFORE deploying the app's /logs page).

-- 1) payments: the owner, or the ACTIVE staff member who sold the sale. A deactivated staff user gets nothing
--    (before: they could read their own old cash amounts until their token expired).
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using ((select public.is_owner())
      or (exists (select 1 from public.sales s where s.id = sale_id and s.sold_by = (select auth.uid()))
          and (select public.has_role(array['staff']))));

-- 2) The app only sells through sell_cart. Take the older single-sale function away from signed-in users.
revoke execute on function public.sell_voucher(uuid, uuid, integer, text, text) from public, anon, authenticated;

-- 3) Activity log ---------------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,                       -- null = done from the Supabase dashboard / SQL editor
  actor_name  text,                       -- snapshot of the display name at the time
  action      text not null check (action in (
                'sale','void','import','plan_create','plan_update','plan_archive','plan_restore',
                'settings_update','staff_add','staff_deactivate','staff_reactivate','role_change')),
  target_type text,
  target_id   text,
  detail      jsonb not null default '{}'::jsonb check (length(detail::text) <= 4000)
);
create index if not exists audit_log_at_idx    on public.audit_log (at desc, id desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor, at desc);

alter table public.audit_log enable row level security;
-- New tables in Supabase get broad default grants: remove every one, then give back SELECT only.
revoke all on public.audit_log from public, anon, authenticated;
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.is_owner()));          -- staff and anon read nothing

-- Append-only: nobody (not even a definer function) can change or remove a row, or truncate the table.
-- Limit: the database admin can still drop this trigger.
create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;
drop trigger if exists audit_log_no_change   on public.audit_log;
create trigger audit_log_no_change   before update or delete on public.audit_log for each row       execute function public.audit_log_immutable();
drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate before truncate          on public.audit_log for each statement execute function public.audit_log_immutable();

-- The only writer. actor = auth.uid(); with no signed-in user (SQL editor) the actor is the database admin.
create or replace function public.audit_write(p_action text, p_target_type text, p_target_id text, p_detail jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_name  text;
begin
  if v_actor is null then
    v_name := 'database admin';
  else
    select p.display_name into v_name from public.profiles p where p.user_id = v_actor;
    v_name := coalesce(nullif(btrim(v_name), ''), 'Unknown user');
  end if;
  insert into public.audit_log (actor, actor_name, action, target_type, target_id, detail)
  values (v_actor, v_name, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
end;
$$;

-- Sales: ONE entry per sale. A cart (rows sharing group_id) is logged once, when the transaction commits
-- and every row of the group exists. Codes are masked (***275); guest names are never logged.
create or replace function public.audit_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
  v_total bigint;
  v_plans jsonb;
  v_codes jsonb;
begin
  select count(*), sum(s.price_centavos), jsonb_agg('***' || right(s.voucher_code, 3) order by s.seq nulls first, s.id)
    into v_count, v_total, v_codes
  from public.sales s
  where case when new.group_id is null then s.id = new.id else s.group_id = new.group_id end;

  select jsonb_agg(jsonb_build_object('plan', x.plan_name, 'qty', x.n) order by x.plan_name)
    into v_plans
  from (select s.plan_name, count(*) as n from public.sales s
        where case when new.group_id is null then s.id = new.id else s.group_id = new.group_id end
        group by s.plan_name) x;

  perform public.audit_write('sale', case when new.group_id is null then 'sale' else 'cart' end,
    coalesce(new.group_id::text, new.id::text),
    jsonb_build_object('count', v_count, 'total_centavos', v_total, 'plans', v_plans, 'codes', v_codes));
  return null;
end;
$$;
drop trigger if exists sales_audit_insert on public.sales;
create constraint trigger sales_audit_insert after insert on public.sales
  deferrable initially deferred for each row
  when (new.seq is null or new.seq = 1)
  execute function public.audit_sale();

create or replace function public.audit_void() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.audit_write('void', 'sale', new.id::text, jsonb_build_object(
    'code', '***' || right(new.voucher_code, 3), 'plan', new.plan_name, 'price_centavos', new.price_centavos,
    'reason', new.void_reason, 'group_id', new.group_id));
  return null;
end;
$$;
drop trigger if exists sales_audit_void on public.sales;
create trigger sales_audit_void after update of status on public.sales
  for each row when (old.status is distinct from new.status and new.status = 'voided')
  execute function public.audit_void();

-- Imports: one entry per import batch and plan, with the count. No codes are ever written.
create or replace function public.audit_import() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select n.plan_id, n.import_batch, count(*) as c, p.name
    from new_rows n join public.plans p on p.id = n.plan_id
    group by n.plan_id, n.import_batch, p.name
  loop
    perform public.audit_write('import', 'import_batch', r.import_batch::text,
      jsonb_build_object('count', r.c, 'plan', r.name, 'plan_id', r.plan_id));
  end loop;
  return null;
end;
$$;
drop trigger if exists vouchers_audit_import on public.vouchers;
create trigger vouchers_audit_import after insert on public.vouchers
  referencing new table as new_rows for each statement
  execute function public.audit_import();

-- Plans: create, edit (what changed), archive, restore.
create or replace function public.audit_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ch jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('plan_create', 'plan', new.id::text, jsonb_build_object(
      'name', new.name, 'minutes', new.duration_minutes, 'price_centavos', new.price_centavos));
    return null;
  end if;
  if new.name is distinct from old.name then
    ch := ch || jsonb_build_object('name', jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if new.duration_minutes is distinct from old.duration_minutes then
    ch := ch || jsonb_build_object('minutes', jsonb_build_object('from', old.duration_minutes, 'to', new.duration_minutes));
  end if;
  if new.price_centavos is distinct from old.price_centavos then
    ch := ch || jsonb_build_object('price_centavos', jsonb_build_object('from', old.price_centavos, 'to', new.price_centavos));
  end if;
  if ch <> '{}'::jsonb then
    perform public.audit_write('plan_update', 'plan', new.id::text, jsonb_build_object('name', new.name, 'changes', ch));
  end if;
  if new.active is distinct from old.active then
    perform public.audit_write(case when new.active then 'plan_restore' else 'plan_archive' end,
      'plan', new.id::text, jsonb_build_object('name', new.name));
  end if;
  return null;
end;
$$;
drop trigger if exists plans_audit on public.plans;
create trigger plans_audit after insert or update on public.plans for each row execute function public.audit_plan();

-- Settings: the low-stock threshold.
create or replace function public.audit_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.audit_write('settings_update', 'settings', 'low_stock_threshold',
    jsonb_build_object('from', old.low_stock_threshold, 'to', new.low_stock_threshold));
  return null;
end;
$$;
drop trigger if exists settings_audit on public.settings;
create trigger settings_audit after update of low_stock_threshold on public.settings
  for each row when (old.low_stock_threshold is distinct from new.low_stock_threshold)
  execute function public.audit_settings();

-- Staff: added, deactivated, reactivated, role changed (today only the SQL editor writes profiles).
create or replace function public.audit_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.audit_write('staff_add', 'profile', new.user_id::text,
      jsonb_build_object('name', new.display_name, 'role', new.role));
    return null;
  end if;
  if new.active is distinct from old.active then
    perform public.audit_write(case when new.active then 'staff_reactivate' else 'staff_deactivate' end,
      'profile', new.user_id::text, jsonb_build_object('name', new.display_name, 'role', new.role));
  end if;
  if new.role is distinct from old.role then
    perform public.audit_write('role_change', 'profile', new.user_id::text,
      jsonb_build_object('name', new.display_name, 'from', old.role, 'to', new.role));
  end if;
  return null;
end;
$$;
drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit after insert or update on public.profiles for each row execute function public.audit_profile();

-- Nobody calls these through the API: remove the default execute grants Supabase gives new functions.
revoke execute on function
  public.audit_log_immutable(), public.audit_write(text, text, text, jsonb), public.audit_sale(), public.audit_void(),
  public.audit_import(), public.audit_plan(), public.audit_settings(), public.audit_profile()
  from public, anon, authenticated;
