# A&B WiFi Voucher Manager: Design Spec

Date: 2026-10-25. Status: approved for implementation planning.
Scope: one owner, staff-ready. Cash only now. GCash/Maya can be added later without a rewrite. Locale: English, ₱ (PHP), Asia/Manila (UTC+8, no DST).

---

## 1. Architecture and data flow

```
Phone (PWA, installable)                Cloudflare Worker (OpenNext, Node runtime)        Supabase
-----------------------                 ------------------------------------------        --------
PDF -> pdfjs-dist (browser) -> codes[]
     preview / untick / choose plan --> Server Action importCodes()  -- rpc --> import_vouchers()
Sell form (key = crypto.randomUUID()) -> Server Action sell()        -- rpc --> sell_voucher()  (FOR UPDATE SKIP LOCKED)
Code screen: big code + copy + QR  <--  sale row (voucher_code)
History / dashboard (RSC)          <--  select / rpc (RLS as user)   -------->  sales, plan_stock(), sales_totals()
```

Rules:
- **All money is integer centavos** (`₱20.00` = `2000`). Formatting only at the edge: `Intl.NumberFormat('en-PH', {style:'currency', currency:'PHP'})`.
- **All timestamps are `timestamptz` (UTC).** Manila day and month boundaries are computed in SQL (`at time zone 'Asia/Manila'`). In TS, Manila midnight is `${yyyy-mm-dd}T00:00:00+08:00`. This is safe because PH has no DST.
- **The DB is the security wall.** Every Supabase call runs as the logged-in user (publishable key + session cookie), so RLS applies. All writes to `vouchers`, `sales` and `payments` go only through `SECURITY DEFINER` RPCs that check the caller's role inside. Clients get no direct INSERT/UPDATE grants on those tables.
- **Defense in depth on routes:** `proxy.ts` only refreshes the session cookie. The `(app)/layout.tsx` calls `getClaims()` and redirects. Every Server Action calls `requireRole()`. RLS and RPC role checks catch anything that slips past.
- **PDF parsing never touches the Worker** (CPU limit). The browser extracts text, then a pure function `parseCodes(text)` pulls the codes, and only the `string[]` is sent to the server.
- **No offline selling.** A sale must hit the DB to get a code atomically. If the network fails, the UI shows "Retry", and a retry with the same idempotency key is safe.
- **Atomic sale:** the client makes one UUID per sell attempt and keeps it until success. The button is disabled while pending. The RPC returns the existing sale if the key was already used. `SKIP LOCKED` hands two devices two different codes.

---

## 2. SQL schema

File: `supabase/migrations/0001_init.sql` (sections 2 to 4 together, in order).

```sql
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
```

Change shown to the guest is `tendered - amount`. The UI computes it and the DB stores both values. Discounts are out of scope (`amount = plan price`).

---

## 3. RLS policies and grants

```sql
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
```

| Table    | anon | staff                         | owner                         |
|----------|------|-------------------------------|-------------------------------|
| profiles | -    | read self                     | read all                      |
| plans    | -    | read                          | read, insert, update (archive)|
| vouchers | -    | - (counts via `plan_stock()`) | read                          |
| sales    | -    | read own; sell via RPC        | read all; sell, void via RPC  |
| payments | -    | read own sales'               | read all                      |
| settings | -    | read                          | read, update threshold        |

A deactivated user (`profiles.active = false`) loses all access at the DB at once, even while their JWT is still valid.

---

## 4. RPC functions

Error contract: an RPC raises `exception '<CODE>'`, and the Server Action maps `error.message` to friendly text. Codes: `FORBIDDEN`, `PLAN_NOT_FOUND`, `INSUFFICIENT_CASH`, `OUT_OF_STOCK`, `KEY_REUSED`, `SALE_NOT_FOUND`, `REASON_REQUIRED`, `TOO_MANY_CODES`.

### 4.1 sell_voucher

```sql
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
```

### 4.2 void_sale

```sql
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
```

### 4.3 import_vouchers

```sql
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
```

### 4.4 Stock and totals

```sql
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
```

The sales history list is a plain RLS `select` on `sales` with `created_at` bounds built as `+08:00` ISO strings, ordered `created_at desc`, 50 rows per page (range pagination). The UI sums the period totals from `sales_totals` rows.

### 4.5 Online payments later (no rewrite)

1. Add `'pending'` to `sales.status`, add `'reserved'` to `vouchers.status`, and allow `status='pending'` in the void check.
2. New `start_online_sale(key, plan, method)`: same lock path as `sell_voucher`, but the voucher becomes `reserved`, the sale `pending`, and the payment `pending` with `provider_ref`.
3. New route `app/api/webhooks/[provider]/route.ts`: verify the signature, then call `confirm_payment(provider, ref)` with the server-only secret key. That sets payment `paid`, sale `completed` and voucher `sold`. `payments_provider_ref_uq` dedupes webhook retries.
4. A pg_cron job releases reservations older than 15 minutes (`reserved` back to `available`, sale `voided` with reason `expired`).

Totals, history, void and stock keep working unchanged, because they already filter on `status='completed'` / `'available'`.

---

## 5. Pages and routes

| Route          | Who         | Purpose |
|----------------|-------------|---------|
| `/login`       | public      | Email + password (Server Action `signInWithPassword`). No signup link. |
| `/`            | staff+owner | Dashboard: big Sell button per plan with stock count, low-stock banner, today's and this month's totals. |
| `/sell?plan=`  | staff+owner | Plan picker, optional buyer name/room, cash received (quick ₱ chips), change shown, Confirm. On success it redirects to `/sales/[id]?new=1`. |
| `/sales`       | staff+owner | History, filters (date range in Manila time, plan), daily/monthly toggle with totals. Staff see only their own rows. |
| `/sales/[id]`  | staff+owner | Code in large monospace, Copy button, QR (`qrcode.react`, value = code only), receipt details. Owner sees a Void button (reason required). |
| `/plans`       | owner       | List, create, edit, archive. |
| `/import`      | owner       | Pick PDF (or paste CSV/text), extracted preview with untick, choose plan, Import, result counts. |
| `/settings`    | owner       | Low-stock threshold, sign out. |
| `/manifest.webmanifest` | public | From `app/manifest.ts` (name, icons, `display: standalone`, theme). |

Owner-only pages call `requireRole('owner')` in the page and in their actions. Non-owners get `notFound()`.

---

## 6. Folder structure

```
app/
  layout.tsx                 # html, fonts, <body>, Manila/en-PH only via lib
  manifest.ts
  globals.css                # Tailwind 4 (@import "tailwindcss")
  (auth)/login/page.tsx, actions.ts
  (app)/layout.tsx           # requireUser() -> redirect('/login'); bottom nav by role
  (app)/page.tsx             # dashboard
  (app)/sell/page.tsx, SellForm.tsx (client), actions.ts
  (app)/sales/page.tsx, [id]/page.tsx, actions.ts (voidSale)
  (app)/plans/page.tsx, actions.ts
  (app)/import/page.tsx, ImportClient.tsx (client), actions.ts
  (app)/settings/page.tsx, actions.ts
components/
  VoucherCode.tsx            # big code + copy + QR (client)
lib/
  supabase/server.ts         # createServerClient (@supabase/ssr), publishable key
  supabase/browser.ts        # only if session-refresh fallback is needed (see 7)
  auth.ts                    # requireUser(), requireRole() via getClaims + profiles
  money.ts                   # peso <-> centavos, format
  manila.ts                  # date -> +08:00 bounds, today/month in Manila
  parse-codes.ts             # pure: text -> unique codes[] (unit-tested)
  pdf-text.ts                # client-only dynamic import of pdfjs-dist
  rpc-errors.ts              # RPC error code -> message
proxy.ts                     # session refresh only (see 7)
supabase/migrations/0001_init.sql
supabase/tests/concurrency.test.ts   # vitest vs `supabase start`
tests/unit/*.test.ts         # money, manila, parse-codes
e2e/*.spec.ts                # Playwright: projects 'phone' (Pixel 7) + 'desktop'
docs/decisions.md
open-next.config.ts, wrangler.jsonc, next.config.ts, vitest.config.ts, playwright.config.ts
```

Tests that must exist:
- 20 parallel `sell_voucher` calls on 10 codes give exactly 10 sales with distinct codes and 10 `OUT_OF_STOCK`.
- 5 parallel calls with the same key give 1 sale.
- After a void: the code is `burned`, the sale is excluded from totals, and a new sale never gets that code.
- An import with repeats and existing codes returns the correct counts.
- A sale at 23:59 Manila vs 00:01 lands in the correct day bucket.
- `parseCodes` runs against a real Omada PDF text fixture.
- E2E: login, sell, copy, void, on phone and desktop.

---

## 7. Security notes and risks

- **Keys:** the publishable key is used everywhere, with the user session, so RLS applies. The secret key is **unused in v1**. When the webhooks arrive, it lives only in `lib/supabase/admin.ts` with `import 'server-only'`, set as a Worker secret (`wrangler secret put`), never `NEXT_PUBLIC_*`.
- **Signups:** disable them in Supabase Auth settings. Create users by invite from the dashboard. Add a `profiles` row by SQL. A user without a profile row can log in but can read and do nothing (the layout shows "No access").
- **getClaims:** turn on **asymmetric JWT signing keys** in Supabase, so `getClaims()` verifies the token locally against cached JWKS. With the legacy symmetric secret it falls back to a network call. A JWT stays valid until it expires (about 1 hour), so revocation goes through `profiles.active`, checked inside every policy and RPC.
- **Server Actions are public POST endpoints.** Each one re-checks its role, validates inputs (lengths, integers, UUIDs) and calls exactly one RPC or query. Next's Origin check covers CSRF.
- **Voucher codes are cash.** Unsold codes are readable by the owner only. Staff never see the pool.
- **proxy.ts vs middleware.ts:** Next 16 renamed `middleware.ts` to `proxy.ts` (Node runtime). OpenNext Cloudflare 1.20 may not wire up `proxy.ts`. The design does not depend on it: protection comes from the layout `getClaims` check, per-action checks and RLS. The only job of `proxy.ts` is refreshing the session cookie (Server Components cannot set cookies). **Gate at scaffold:** deploy a preview and check that a `x-proxy: 1` response header appears. If it does not, rename the file to `middleware.ts` (deprecated but supported). If that also fails, mount a tiny client component that calls `createBrowserClient().auth.getSession()` on focus/interval, which refreshes the token and rewrites the cookies.
- **Workers free plan 10 ms CPU per request:** I/O wait does not count. PDF parsing is client-side. JWT verification uses cached JWKS. Pages render at most 50 rows. Risks are the cold-start module init and a large RSC render. If error 1102 (CPU exceeded) shows up in `wrangler tail`, move to Workers Paid ($5/mo, 30 s CPU). Also watch the free **3 MiB compressed bundle** limit: keep `pdfjs-dist` and `qrcode.react` client-only (dynamic import) and serve the pdf.js worker as a static asset (`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`).
- **TypeScript 7 (native Go `tsgo`) vs 5.x:** Next 16's build-time type check, typescript-eslint and other tools rely on the TS JS API, which TS 7 does not yet offer in a stable form. **Pin `"typescript": "5.9.3"` exactly**, pin all other deps exactly, and commit the lockfile. Revisit when Next officially supports TS 7.
- **Supabase free tier:** the project **pauses after about 7 days of inactivity**, and there is no PITR. Daily use prevents the pause. Add a CSV export of sales on `/sales` (owner) as a manual backup. Consider Pro once revenue justifies it.
- **PDF parsing accuracy:** the code regex is a guess (Omada default: numeric, length 6 to 10). The preview with untick is the safety net. Codes are never trimmed or uppercased beyond `btrim`, because Omada codes may be case-sensitive.
- **Clipboard API needs HTTPS** (fine on Workers). Provide a select-all fallback.
- **Double sale risk is closed by three layers:** a disabled button, the idempotency key and `SKIP LOCKED`. A residual risk: the owner gives the guest a code from a sale that later gets voided. That is accepted, and is why voided codes are burned.
- **Clock:** all times come from DB `now()`. Device clocks are never trusted.

---

## 8. Decisions (seed for docs/decisions.md)

1. Money is stored as integer centavos. No floats, no `numeric` in app code.
2. Timestamps are stored UTC (`timestamptz`). Manila boundaries are computed in SQL and as `+08:00` strings. No date library.
3. All writes to vouchers, sales and payments go through `SECURITY DEFINER` RPCs with `search_path=''` and internal role checks. Clients have no direct write grants.
4. Atomic sell uses `FOR UPDATE SKIP LOCKED` plus a client UUID idempotency key, unique and returning the existing sale on retry.
5. Codes are handed out FIFO by identity `id` (file order kept on import).
6. Voucher codes are globally unique. Import skips duplicates silently and reports counts.
7. A void is a status change, never a delete. A voided code is `burned` forever. Void is owner-only and needs a reason.
8. Sales snapshot code, plan name, duration and price. Plans are archived, never deleted.
9. Payments are a separate table (one row per attempt). Cash writes one `paid` row. Online pay adds statuses, a webhook route and a confirm RPC; no rewrite.
10. Roles are `profiles(user_id, role, active)` with `has_role()` / `is_owner()`. Execute is revoked from anon and public. Deactivation is instant at the DB.
11. Staff cannot read unsold codes, and see only their own sales and totals (`sales_totals` is SECURITY INVOKER).
12. Route protection is: layout `getClaims` check, then per-action `requireRole`, then RLS. `proxy.ts` only refreshes the session; fallbacks are documented.
13. PDFs are parsed in the browser with pdfjs-dist. The server receives only `string[]`, capped at 5000 per import.
14. There is no offline selling and no service worker in v1. The manifest alone makes the app installable.
15. The QR encodes the code only, because the Omada portal has no prefill URL to rely on.
16. A single global low-stock threshold lives in the `settings` singleton. Per-plan thresholds are deferred.
17. The publishable key is used everywhere. The secret key is unused until webhooks.
18. TypeScript is pinned to 5.9.3, with exact dependency versions and a committed lockfile.
19. Hosting starts on Workers free. Upgrade to Paid on the first CPU-limit (1102) errors.
20. Deferred: discounts, per-plan thresholds, staff management UI, refunds, offline mode, Omada API sync.
