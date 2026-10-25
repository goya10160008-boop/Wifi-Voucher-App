-- 0006 for pasting into the Supabase SQL editor (one run). Single transaction: all or nothing.
begin;

-- Stage 4: void a whole receipt with a fixed reason, and let ONE reason ("Owner Test") put the codes back on sale.
-- Needs 0003 and 0004 (audit log). Apply to the remote project only with the owner's approval.
--
-- This deliberately breaks the old rule "a voided code is never sold again" for exactly one case: the owner voids a
-- receipt they sold themselves, within 60 minutes, as a test. Every guard is inside the function, so the app cannot skip it.

-- 1) A code may be sold again after a restock, so "one sale per code, ever" becomes "one COMPLETED sale per code".
--    Old voided rows stay as history. sell_cart still catches a clash as KEY_REUSED (it handles unique_violation).
alter table public.sales drop constraint if exists sales_voucher_uq;
create unique index if not exists sales_voucher_completed_uq on public.sales (voucher_id) where status = 'completed';

-- 2) Why a sale was voided (a code from a fixed list) and which voids belong together (one receipt).
alter table public.sales add column if not exists void_reason_code text
  check (void_reason_code in ('wrong_plan','changed_mind','sold_twice','code_failed','owner_test','other'));
alter table public.sales add column if not exists void_batch uuid;

-- 3) One more log entry kind.
alter table public.audit_log drop constraint if exists audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'sale','void','import','plan_create','plan_update','plan_archive','plan_restore',
  'settings_update','staff_add','staff_deactivate','staff_reactivate','role_change',
  'login','logout','idle_signout','csv_export',
  'pin_set','pin_reset','pin_unlocked','pin_locked',
  'restock'));

-- The per-code log entry skips rows voided as part of a receipt: void_receipt writes ONE entry for the whole receipt.
create or replace function public.audit_void() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.void_batch is not null then return null; end if;
  perform public.audit_write('void', 'sale', new.id::text, jsonb_build_object(
    'code', '***' || right(new.voucher_code, 3), 'plan', new.plan_name, 'price_centavos', new.price_centavos,
    'reason', new.void_reason, 'group_id', new.group_id));
  return null;
end;
$$;

-- 4) void_receipt: all or nothing, one transaction.
--    p_ref = the receipt's group id, or the sale id of an old sale that has no group.
--    Only completed rows are touched; rows that are already voided stay as they are, and a second call changes nothing.
create or replace function public.void_receipt(p_ref uuid, p_reason_code text, p_note text default null)
returns setof public.sales
language plpgsql security definer set search_path = '' as $$
declare
  v_label   text;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_test    boolean := p_reason_code = 'owner_test';
  v_ids     uuid[];
  v_n       integer;
  v_batch   uuid := gen_random_uuid();
  v_masks   jsonb;
  v_plans   jsonb;
begin
  if not public.is_owner() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;

  v_label := case p_reason_code
    when 'wrong_plan'   then 'Wrong plan sold'
    when 'changed_mind' then 'Guest changed their mind'
    when 'sold_twice'   then 'Sold twice by mistake'
    when 'code_failed'  then 'Code did not work'
    when 'owner_test'   then 'Owner Test'
    when 'other'        then v_note
  end;
  if p_reason_code is null or p_reason_code not in ('wrong_plan','changed_mind','sold_twice','code_failed','owner_test','other') then
    raise exception 'BAD_REASON';
  end if;
  if p_reason_code = 'other' and (v_label is null or length(v_label) < 3 or length(v_label) > 200) then
    raise exception 'REASON_REQUIRED';
  end if;

  if not exists (select 1 from public.sales s where s.group_id = p_ref or (s.id = p_ref and s.group_id is null)) then
    raise exception 'SALE_NOT_FOUND';
  end if;

  -- Lock order (same first step as sell_cart, so a concurrent cart never sees half a restock): the plans, then the
  -- sales rows by voucher id, then the voucher rows by id. sell_cart never locks existing sales rows.
  if v_test then
    perform 1 from public.plans p
     where p.id in (select s.plan_id from public.sales s where s.group_id = p_ref or (s.id = p_ref and s.group_id is null))
     order by p.id for no key update;
  end if;
  select array_agg(x.id order by x.voucher_id) into v_ids from (
    select s.id, s.voucher_id from public.sales s
     where (s.group_id = p_ref or (s.id = p_ref and s.group_id is null)) and s.status = 'completed'
     order by s.voucher_id for update) x;
  v_n := coalesce(cardinality(v_ids), 0);
  if v_n = 0 then   -- everything is already voided: nothing to do
    return query select * from public.sales s where s.group_id = p_ref or (s.id = p_ref and s.group_id is null) order by s.seq nulls first, s.id;
    return;
  end if;
  perform 1 from public.vouchers v where v.id in (select s.voucher_id from public.sales s where s.id = any(v_ids)) order by v.id for update;

  if v_test then
    if exists (select 1 from public.sales s where s.id = any(v_ids) and s.sold_by is distinct from auth.uid()) then
      raise exception 'STAFF_SALE';
    end if;
    if exists (select 1 from public.sales s where s.id = any(v_ids) and s.created_at < now() - interval '60 minutes') then
      raise exception 'TOO_OLD';
    end if;
    if exists (select 1 from public.sales s join public.vouchers v on v.id = s.voucher_id
                where s.id = any(v_ids) and v.status <> 'sold') then
      raise exception 'NOT_SOLD';
    end if;
  end if;

  select jsonb_agg('***' || right(s.voucher_code, 3) order by s.seq nulls first, s.id) into v_masks from public.sales s where s.id = any(v_ids);
  select jsonb_agg(jsonb_build_object('plan', x.plan_name, 'qty', x.n) order by x.plan_name) into v_plans
    from (select s.plan_name, count(*) as n from public.sales s where s.id = any(v_ids) group by s.plan_name) x;

  update public.sales set status = 'voided', voided_at = now(), voided_by = auth.uid(),
         void_reason = v_label, void_reason_code = p_reason_code, void_batch = v_batch
   where id = any(v_ids);
  update public.vouchers set status = case when v_test then 'available' else 'burned' end, status_changed_at = now()
   where id in (select s.voucher_id from public.sales s where s.id = any(v_ids));
  update public.payments set status = 'voided' where sale_id = any(v_ids) and status = 'paid';

  perform public.audit_write('void', 'receipt', p_ref::text, jsonb_build_object(
    'count', v_n, 'codes', v_masks, 'reason', v_label, 'reason_code', p_reason_code, 'returned', v_test));
  if v_test then
    perform public.audit_write('restock', 'receipt', p_ref::text, jsonb_build_object('count', v_n, 'plans', v_plans));
  end if;

  return query select * from public.sales s where s.group_id = p_ref or (s.id = p_ref and s.group_id is null) order by s.seq nulls first, s.id;
end;
$$;

revoke execute on function public.void_receipt(uuid, text, text) from public, anon;
grant  execute on function public.void_receipt(uuid, text, text) to authenticated;

commit;
