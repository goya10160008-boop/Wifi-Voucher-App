-- Supabase grants EXECUTE on new public functions to anon by default. Stop that.
alter default privileges in schema public revoke execute on functions from public, anon;

-- profiles ---------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('owner','staff')),
  display_name text check (length(display_name) <= 60),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
-- Bootstrap (SQL editor, once):
-- insert into public.profiles (user_id, role)
--   select id, 'owner' from auth.users where email = '<owner email>';

-- plans ------------------------------------------------------------------
create table public.plans (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 1 and 60),
  duration_minutes integer not null check (duration_minutes > 0),
  price_centavos   integer not null check (price_centavos >= 0),
  active           boolean not null default true,   -- archive, never delete
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);
create unique index plans_name_active_uq on public.plans (lower(name)) where active;

-- vouchers ---------------------------------------------------------------
create table public.vouchers (
  id                bigint generated always as identity primary key,  -- FIFO order
  plan_id           uuid not null references public.plans(id) on delete restrict,
  code              text not null check (code ~ '^[A-Za-z0-9-]{4,32}$'),
  status            text not null default 'available'
                    check (status in ('available','sold','burned')),  -- 'reserved' added with online pay
  import_batch      uuid not null,
  imported_by       uuid not null references auth.users(id),
  imported_at       timestamptz not null default now(),
  status_changed_at timestamptz,
  constraint vouchers_code_uq unique (code)   -- global: a code is never imported twice
);
create index vouchers_pick_idx on public.vouchers (plan_id, id) where status = 'available';

-- sales (snapshots plan + code so history never changes) ----------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  idempotency_key  uuid not null,
  voucher_id       bigint not null references public.vouchers(id),
  voucher_code     text not null,
  plan_id          uuid not null references public.plans(id),
  plan_name        text not null,
  duration_minutes integer not null,
  price_centavos   integer not null check (price_centavos >= 0),
  buyer_name       text check (length(buyer_name) <= 80),
  buyer_room       text check (length(buyer_room) <= 20),
  status           text not null default 'completed'
                   check (status in ('completed','voided')),        -- 'pending' added with online pay
  sold_by          uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  voided_at        timestamptz,
  voided_by        uuid references auth.users(id),
  void_reason      text check (length(void_reason) <= 200),
  constraint sales_idempotency_key_uq unique (idempotency_key),
  constraint sales_voucher_uq unique (voucher_id),                -- one sale per code, ever
  constraint sales_void_consistent check ((status = 'voided') = (voided_at is not null))
);
create index sales_created_idx      on public.sales (created_at desc);
create index sales_plan_created_idx on public.sales (plan_id, created_at desc);
create index sales_seller_idx       on public.sales (sold_by, created_at desc);

-- payments (1 row per payment attempt; cash = 1 row 'paid') -------------
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  sale_id           uuid not null references public.sales(id),
  method            text not null check (method in ('cash','gcash','maya')),
  status            text not null check (status in ('pending','paid','failed','voided')),
  amount_centavos   integer not null check (amount_centavos >= 0),   -- applied to sale
  tendered_centavos integer check (tendered_centavos >= amount_centavos), -- cash handed over
  provider          text,            -- e.g. 'paymongo' (later)
  provider_ref      text,            -- checkout / intent id (later)
  provider_payload  jsonb,           -- last webhook body (later)
  created_at        timestamptz not null default now()
);
create index payments_sale_idx on public.payments (sale_id);
create unique index payments_provider_ref_uq on public.payments (provider, provider_ref)
  where provider_ref is not null;    -- webhook dedupe

-- settings (singleton) ---------------------------------------------------
create table public.settings (
  id                  boolean primary key default true check (id),
  low_stock_threshold integer not null default 10 check (low_stock_threshold between 0 and 10000)
);
insert into public.settings default values;

-- role helpers ------------------------------------------------------------
create or replace function public.has_role(roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.active and p.role = any(roles)
  );
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.has_role(array['owner']); $$;

revoke execute on function public.has_role(text[]), public.is_owner() from public, anon;
grant  execute on function public.has_role(text[]), public.is_owner() to authenticated;

-- enable RLS everywhere ---------------------------------------------------
alter table public.profiles enable row level security;
alter table public.plans    enable row level security;
alter table public.vouchers enable row level security;
alter table public.sales    enable row level security;
alter table public.payments enable row level security;
alter table public.settings enable row level security;

-- table grants: anon gets nothing; authenticated reads; writes are column-limited
revoke all on all tables in schema public from public, anon, authenticated;
grant select on public.profiles, public.plans, public.vouchers,
                public.sales, public.payments, public.settings to authenticated;
grant insert (name, duration_minutes, price_centavos, sort_order),
      update (name, duration_minutes, price_centavos, sort_order, active)
      on public.plans to authenticated;
grant update (low_stock_threshold) on public.settings to authenticated;
-- NO insert/update/delete on vouchers, sales, payments: RPC only. NO delete anywhere.

-- profiles: see self; owner sees all. Writes via SQL editor only (for now).
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_owner()));

-- plans: staff+owner read; owner writes.
create policy plans_select on public.plans for select to authenticated
  using ((select public.has_role(array['owner','staff'])));
create policy plans_insert on public.plans for insert to authenticated
  with check ((select public.is_owner()));
create policy plans_update on public.plans for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- vouchers: unsold codes are cash. Owner only. Staff see stock via plan_stock()
-- and see codes only on their own sales rows (sales.voucher_code).
create policy vouchers_select on public.vouchers for select to authenticated
  using ((select public.is_owner()));

-- sales: owner all; staff own rows.
create policy sales_select on public.sales for select to authenticated
  using ((select public.is_owner())
      or (sold_by = (select auth.uid()) and (select public.has_role(array['staff']))));

-- payments: follow the sale.
create policy payments_select on public.payments for select to authenticated
  using ((select public.is_owner())
      or exists (select 1 from public.sales s
                 where s.id = sale_id and s.sold_by = (select auth.uid())));

-- settings: staff+owner read; owner updates.
create policy settings_select on public.settings for select to authenticated
  using ((select public.has_role(array['owner','staff'])));
create policy settings_update on public.settings for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create or replace function public.sell_voucher(
  p_idempotency_key   uuid,
  p_plan_id           uuid,
  p_tendered_centavos integer,
  p_buyer_name        text default null,
  p_buyer_room        text default null
) returns public.sales
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale       public.sales;
  v_plan       public.plans;
  v_voucher_id bigint;
  v_code       text;
  v_constraint text;
begin
  if not public.has_role(array['owner','staff']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'KEY_REUSED' using errcode = '22004';
  end if;

  -- Retry fast path: same key -> same sale.
  select * into v_sale from public.sales where idempotency_key = p_idempotency_key;
  if found then
    if v_sale.plan_id <> p_plan_id then raise exception 'KEY_REUSED'; end if;
    return v_sale;
  end if;

  select * into v_plan from public.plans where id = p_plan_id and active;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  if p_tendered_centavos is null or p_tendered_centavos < v_plan.price_centavos then
    raise exception 'INSUFFICIENT_CASH';
  end if;

  -- Oldest unused code; a parallel seller skips this row and takes the next.
  select v.id, v.code into v_voucher_id, v_code
  from public.vouchers v
  where v.plan_id = p_plan_id and v.status = 'available'
  order by v.id
  limit 1
  for update skip locked;
  if not found then raise exception 'OUT_OF_STOCK'; end if;

  begin
    insert into public.sales (idempotency_key, voucher_id, voucher_code, plan_id, plan_name,
                              duration_minutes, price_centavos, buyer_name, buyer_room, sold_by)
    values (p_idempotency_key, v_voucher_id, v_code, v_plan.id, v_plan.name,
            v_plan.duration_minutes, v_plan.price_centavos,
            nullif(btrim(p_buyer_name), ''), nullif(btrim(p_buyer_room), ''), auth.uid())
    returning * into v_sale;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'sales_idempotency_key_uq' then raise; end if;
    -- A concurrent call with the same key committed first. Our locked voucher is
    -- untouched and becomes available again at commit.
    select * into v_sale from public.sales where idempotency_key = p_idempotency_key;
    return v_sale;
  end;

  update public.vouchers set status = 'sold', status_changed_at = now() where id = v_voucher_id;

  insert into public.payments (sale_id, method, status, amount_centavos, tendered_centavos)
  values (v_sale.id, 'cash', 'paid', v_plan.price_centavos, p_tendered_centavos);

  return v_sale;
end;
$$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns public.sales
language plpgsql security definer set search_path = ''
as $$
declare v_sale public.sales;
begin
  if not public.is_owner() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if coalesce(length(btrim(p_reason)), 0) < 3 then raise exception 'REASON_REQUIRED'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'SALE_NOT_FOUND'; end if;
  if v_sale.status = 'voided' then return v_sale; end if;   -- idempotent

  update public.sales
     set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
   where id = p_sale_id
  returning * into v_sale;

  -- Burned: the code may already be on a guest's phone. Never resell.
  update public.vouchers set status = 'burned', status_changed_at = now() where id = v_sale.voucher_id;
  update public.payments set status = 'voided' where sale_id = p_sale_id and status = 'paid';
  return v_sale;
end;
$$;

create or replace function public.import_vouchers(p_plan_id uuid, p_codes text[])
returns table (inserted integer, skipped_duplicate integer, skipped_invalid integer, batch_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_total integer := coalesce(cardinality(p_codes), 0);
  v_valid integer;   -- valid rows incl. in-file repeats
  v_ins   integer;
begin
  if not public.is_owner() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans where id = p_plan_id and active) then
    raise exception 'PLAN_NOT_FOUND';
  end if;
  if v_total > 5000 then raise exception 'TOO_MANY_CODES'; end if;

  with raw as (
    select btrim(c) as code, ord
    from unnest(p_codes) with ordinality as t(c, ord)
    where btrim(c) ~ '^[A-Za-z0-9-]{4,32}$'
  ),
  firsts as (                                  -- dedupe within file, keep file order
    select distinct on (code) code, ord from raw order by code, ord
  ),
  ins as (
    insert into public.vouchers (plan_id, code, import_batch, imported_by)
    select p_plan_id, f.code, v_batch, auth.uid() from firsts f order by f.ord
    on conflict (code) do nothing             -- already imported (any plan) -> skip
    returning 1
  )
  select (select count(*) from raw), (select count(*) from ins) into v_valid, v_ins;

  return query select v_ins, v_valid - v_ins, v_total - v_valid, v_batch;
end;
$$;

-- Counts only; safe for staff (no codes exposed).
create or replace function public.plan_stock()
returns table (plan_id uuid, plan_name text, duration_minutes integer, price_centavos integer,
               available bigint, low_stock boolean, threshold integer)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.duration_minutes, p.price_centavos,
         count(v.id), count(v.id) <= s.low_stock_threshold, s.low_stock_threshold
  from public.plans p
  cross join public.settings s
  left join public.vouchers v on v.plan_id = p.id and v.status = 'available'
  where p.active and public.has_role(array['owner','staff'])
  group by p.id, s.low_stock_threshold
  order by p.sort_order, p.price_centavos;
$$;

-- Manila-day or Manila-month buckets, completed sales only (voids excluded).
-- SECURITY INVOKER on purpose: RLS makes staff see only their own totals.
-- p_from / p_to are inclusive Manila calendar dates.
create or replace function public.sales_totals(
  p_from date, p_to date, p_grain text default 'day', p_plan_id uuid default null
) returns table (period date, plan_id uuid, plan_name text, sale_count bigint, total_centavos bigint)
language sql stable security invoker set search_path = ''
as $$
  select date_trunc(p_grain, s.created_at at time zone 'Asia/Manila')::date,
         s.plan_id, p.name, count(*), sum(s.price_centavos)
  from public.sales s
  join public.plans p on p.id = s.plan_id
  where s.status = 'completed'
    and p_grain in ('day','month')
    and s.created_at >= (p_from::timestamp at time zone 'Asia/Manila')
    and s.created_at <  ((p_to + 1)::timestamp at time zone 'Asia/Manila')
    and (p_plan_id is null or s.plan_id = p_plan_id)
  group by 1, s.plan_id, p.name
  order by 1 desc, p.name;
$$;

revoke execute on function
  public.sell_voucher(uuid, uuid, integer, text, text), public.void_sale(uuid, text),
  public.import_vouchers(uuid, text[]), public.plan_stock(),
  public.sales_totals(date, date, text, uuid)
  from public, anon;
grant execute on function
  public.sell_voucher(uuid, uuid, integer, text, text), public.void_sale(uuid, text),
  public.import_vouchers(uuid, text[]), public.plan_stock(),
  public.sales_totals(date, date, text, uuid)
  to authenticated;

