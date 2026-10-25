-- Multi-voucher sales ("cart"): one sale can hold up to 10 vouchers across plans.
-- Each code stays its own sales row (void, totals, history unchanged). Rows of one cart share
-- group_id (= the client's idempotency key) and a 1-based seq. Old rows keep both NULL.
-- Additive only: no existing row or function is changed.

alter table public.sales
  add column group_id uuid,
  add column seq      integer,
  add constraint sales_group_consistent check ((group_id is null) = (seq is null)),
  add constraint sales_group_seq_uq unique (group_id, seq);   -- NULL group_id rows never collide

-- Cash for a cart: the whole cash handed over is stored on the seq=1 payment
-- (tendered >= amount holds, since tendered >= cart total >= that row's price).
-- Change shown to the guest = that tendered - sum of the group's prices.

create or replace function public.sell_cart(
  p_group_key         uuid,
  p_items             jsonb,      -- [{"plan_id": "<uuid>", "qty": 2}, ...]
  p_tendered_centavos integer,
  p_buyer_name        text default null,
  p_buyer_room        text default null
) returns setof public.sales
language plpgsql security definer set search_path = ''
as $$
declare
  v_plan_ids  uuid[];
  v_qtys      integer[];
  v_qty_sum   integer;
  v_found     integer;
  v_total     bigint;
  v_seq       integer := 0;
  r           record;
  v_vids      bigint[];
  v_vcodes    text[];
  v_sale_id   uuid;
  v_left      integer;
begin
  if not public.has_role(array['owner','staff']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_group_key is null then
    raise exception 'KEY_REUSED' using errcode = '22004';
  end if;

  -- Shape: a non-empty array of {plan_id uuid, qty 1..999 whole number}; at most 10 vouchers in all.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'CART_INVALID';
  end if;
  if jsonb_array_length(p_items) > 10 then
    raise exception 'CART_TOO_BIG';
  end if;
  -- coalesce: a missing plan_id or qty yields NULL, which must count as invalid (bool_or skips NULLs).
  if (select bool_or(not coalesce(
        jsonb_typeof(e) = 'object'
        and e->>'plan_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and jsonb_typeof(e->'qty') = 'number'
        and e->>'qty' ~ '^[1-9][0-9]{0,2}$', false))
      from jsonb_array_elements(p_items) e) then
    raise exception 'CART_INVALID';
  end if;

  -- Same plan listed twice is merged. Plans are always handled in id order (lock order = no deadlocks).
  select array_agg(m.plan_id order by m.plan_id), array_agg(m.qty order by m.plan_id)
    into v_plan_ids, v_qtys
  from (select (e->>'plan_id')::uuid as plan_id, sum((e->>'qty')::integer)::integer as qty
        from jsonb_array_elements(p_items) e group by 1) m;
  select sum(q) into v_qty_sum from unnest(v_qtys) q;
  if v_qty_sum > 10 then
    raise exception 'CART_TOO_BIG';
  end if;

  -- Serialise carts per plan so the all-or-nothing stock count is exact (SKIP LOCKED alone can
  -- make two carts each skip the other's rows and both fail). NO KEY UPDATE does not block the
  -- foreign-key checks of single sell_voucher calls.
  perform 1 from public.plans where id = any(v_plan_ids) order by id for no key update;

  -- Retry fast path, taken after the locks so a concurrent same-key call waits for the first
  -- to commit and then returns its sale instead of a false OUT_OF_STOCK.
  if exists (select 1 from public.sales where group_id = p_group_key) then
    if exists (select 1 from public.sales where group_id = p_group_key and sold_by <> auth.uid())
       or exists (
         (select s.plan_id, count(*)::integer from public.sales s where s.group_id = p_group_key group by s.plan_id
          except select u.p, u.q from unnest(v_plan_ids, v_qtys) as u(p, q))
         union all
         (select u.p, u.q from unnest(v_plan_ids, v_qtys) as u(p, q)
          except select s.plan_id, count(*)::integer from public.sales s where s.group_id = p_group_key group by s.plan_id)
       ) then
      raise exception 'KEY_REUSED';
    end if;
    return query select * from public.sales where group_id = p_group_key order by seq;
    return;
  end if;

  select count(*), sum(p.price_centavos::bigint * u.q)
    into v_found, v_total
  from public.plans p join unnest(v_plan_ids, v_qtys) as u(id, q) on u.id = p.id
  where p.active;
  if v_found <> cardinality(v_plan_ids) then
    raise exception 'PLAN_NOT_FOUND';
  end if;
  if p_tendered_centavos is null or p_tendered_centavos < v_total then
    raise exception 'INSUFFICIENT_CASH';
  end if;

  begin
    for r in
      select p.id, p.name, p.duration_minutes, p.price_centavos, u.q as qty
      from public.plans p join unnest(v_plan_ids, v_qtys) as u(id, q) on u.id = p.id
      order by p.id
    loop
      -- Oldest unused codes first; rows another seller is holding are skipped.
      select array_agg(x.id order by x.id), array_agg(x.code order by x.id)
        into v_vids, v_vcodes
      from (select v.id, v.code from public.vouchers v
            where v.plan_id = r.id and v.status = 'available'
            order by v.id
            limit r.qty
            for update skip locked) x;
      if coalesce(cardinality(v_vids), 0) < r.qty then
        select count(*)::integer into v_left from public.vouchers where plan_id = r.id and status = 'available';
        raise exception 'OUT_OF_STOCK' using detail = r.name || '|' || v_left;
      end if;

      for i in 1..r.qty loop
        v_seq := v_seq + 1;
        insert into public.sales (idempotency_key, voucher_id, voucher_code, plan_id, plan_name,
                                  duration_minutes, price_centavos, buyer_name, buyer_room, sold_by,
                                  group_id, seq)
        values (md5(p_group_key::text || ':' || v_seq)::uuid, v_vids[i], v_vcodes[i], r.id, r.name,
                r.duration_minutes, r.price_centavos,
                nullif(btrim(p_buyer_name), ''), nullif(btrim(p_buyer_room), ''), auth.uid(),
                p_group_key, v_seq)
        returning id into v_sale_id;

        update public.vouchers set status = 'sold', status_changed_at = now() where id = v_vids[i];

        insert into public.payments (sale_id, method, status, amount_centavos, tendered_centavos)
        values (v_sale_id, 'cash', 'paid', r.price_centavos,
                case when v_seq = 1 then p_tendered_centavos end);
      end loop;
    end loop;
  exception when unique_violation then
    -- Same key racing with different items (or a code already sold): never a silent double sale.
    raise exception 'KEY_REUSED';
  end;

  return query select * from public.sales where group_id = p_group_key order by seq;
end;
$$;

revoke execute on function public.sell_cart(uuid, jsonb, integer, text, text) from public, anon;
grant  execute on function public.sell_cart(uuid, jsonb, integer, text, text) to authenticated;
