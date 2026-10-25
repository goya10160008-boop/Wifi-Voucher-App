// sell_cart against a LOCAL Postgres (see docs/decisions.md decision 16 for the no-Docker setup;
// apply local-shim.sql, 0001_init.sql, 0002_sell_cart.sql, then
// SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54329/voucher_test npx vitest run supabase/tests/cart.test.ts).
// Skipped when the env var is unset. Never point it at the production project: it writes and deletes rows.
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_DB_URL;

type Sale = { id: string; voucher_code: string; plan_id: string; plan_name: string; price_centavos: number; group_id: string; seq: number };
type Item = { plan_id: string; qty: number };

describe.skipIf(!url)('sell_cart', () => {
  const pool = new Pool({ connectionString: url, max: 30 });
  const owner = randomUUID();
  const stranger = randomUUID(); // signed in but has no profile row
  const tag = randomUUID().slice(0, 8);
  let n = 0;

  async function as<T>(user: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: user, role: 'authenticated' })]);
      const out = await fn(c);
      await c.query('commit');
      return out;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }

  const cart = (key: string, items: unknown, tendered = 100000, user = owner, name: string | null = null, room: string | null = null) =>
    as(user, async (c) => (await c.query('select * from public.sell_cart($1, $2, $3, $4, $5)', [key, JSON.stringify(items), tendered, name, room])).rows as Sale[]);

  // A plan with `stockCount` fresh codes, in import (FIFO) order.
  async function plan(price: number, stockCount: number) {
    n += 1;
    const id = (await pool.query(
      `insert into public.plans (name, duration_minutes, price_centavos) values ($1, 60, $2) returning id, name`,
      [`cart-${tag}-${n}`, price],
    )).rows[0] as { id: string; name: string };
    const prefix = randomUUID().replace(/-/g, '').slice(0, 10);
    const codes = Array.from({ length: stockCount }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
    if (stockCount) await as(owner, (c) => c.query('select * from public.import_vouchers($1, $2)', [id.id, codes]));
    return { id: id.id, name: id.name, codes };
  }

  const status = async (code: string) => (await pool.query('select status from public.vouchers where code = $1', [code])).rows[0].status as string;
  const salesFor = async (key: string) => (await pool.query('select * from public.sales where group_id = $1 order by seq', [key])).rows as Sale[];
  const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { message: string; detail?: string } | null;

  beforeAll(async () => {
    await pool.query(`insert into auth.users (id, email) values ($1, $2), ($3, $4)`, [owner, `${tag}@cart.invalid`, stranger, `${tag}-s@cart.invalid`]);
    await pool.query(`insert into public.profiles (user_id, role) values ($1, 'owner')`, [owner]);
  });

  afterAll(async () => {
    await pool.query('delete from public.payments where sale_id in (select id from public.sales where sold_by = $1)', [owner]);
    await pool.query('delete from public.sales where sold_by = $1', [owner]);
    await pool.query('delete from public.vouchers where imported_by = $1', [owner]);
    await pool.query(`delete from public.plans where name like $1`, [`cart-${tag}-%`]);
    await pool.query('delete from public.profiles where user_id = $1', [owner]);
    await pool.query('delete from auth.users where id = any($1)', [[owner, stranger]]);
    await pool.end();
  });

  it('a cart of 3 of one plan gives 3 distinct FIFO codes in one group, cash kept on the first payment', async () => {
    const p = await plan(2000, 5);
    const key = randomUUID();
    const rows = await cart(key, [{ plan_id: p.id, qty: 3 }], 10000, owner, '  Ana  ', ' 4B ');
    expect(rows.map((r) => r.voucher_code)).toEqual(p.codes.slice(0, 3));
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(new Set(rows.map((r) => r.group_id))).toEqual(new Set([key]));
    expect(await status(p.codes[2])).toBe('sold');
    expect(await status(p.codes[3])).toBe('available');
    const pay = (await pool.query(
      `select s.seq, pm.tendered_centavos, pm.amount_centavos, pm.status from public.payments pm join public.sales s on s.id = pm.sale_id where s.group_id = $1 order by s.seq`, [key],
    )).rows;
    expect(pay.map((r) => r.tendered_centavos)).toEqual([10000, null, null]);
    expect(pay.every((r) => r.amount_centavos === 2000 && r.status === 'paid')).toBe(true);
    const meta = (await pool.query('select buyer_name, buyer_room from public.sales where group_id = $1', [key])).rows;
    expect(meta.every((m) => m.buyer_name === 'Ana' && m.buyer_room === '4B')).toBe(true);
  });

  it('a mixed cart (2 of one plan + 1 of another) sells each plan FIFO and totals the prices', async () => {
    const a = await plan(2000, 3);
    const b = await plan(5000, 3);
    const rows = await cart(randomUUID(), [{ plan_id: b.id, qty: 1 }, { plan_id: a.id, qty: 2 }], 9000);
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.plan_id === a.id).map((r) => r.voucher_code)).toEqual(a.codes.slice(0, 2));
    expect(rows.filter((r) => r.plan_id === b.id).map((r) => r.voucher_code)).toEqual(b.codes.slice(0, 1));
    expect(rows.reduce((s, r) => s + r.price_centavos, 0)).toBe(9000);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
  });

  it('the same plan listed twice is merged', async () => {
    const a = await plan(2000, 5);
    const rows = await cart(randomUUID(), [{ plan_id: a.id, qty: 1 }, { plan_id: a.id, qty: 2 }]);
    expect(rows.map((r) => r.voucher_code)).toEqual(a.codes.slice(0, 3));
  });

  it('is all-or-nothing: one short plan consumes nothing and names the plan and how many are left', async () => {
    const a = await plan(2000, 5);
    const b = await plan(5000, 1);
    const key = randomUUID();
    const err = await fail(cart(key, [{ plan_id: a.id, qty: 2 }, { plan_id: b.id, qty: 2 }]));
    expect(err?.message).toBe('OUT_OF_STOCK');
    expect(err?.detail).toBe(`${b.name}|1`);
    expect(await salesFor(key)).toHaveLength(0);
    for (const c of [...a.codes, ...b.codes]) expect(await status(c)).toBe('available');
  });

  it('insufficient cash, unknown plan, archived plan and a user without a profile are rejected without side effects', async () => {
    const a = await plan(2000, 3);
    const key = randomUUID();
    expect((await fail(cart(key, [{ plan_id: a.id, qty: 2 }], 3999)))?.message).toBe('INSUFFICIENT_CASH');
    expect((await fail(cart(key, [{ plan_id: a.id, qty: 2 }], 4000))) ).toBeNull(); // exact cash is fine
    expect((await fail(cart(randomUUID(), [{ plan_id: randomUUID(), qty: 1 }])))?.message).toBe('PLAN_NOT_FOUND');
    const arch = await plan(2000, 2);
    await pool.query('update public.plans set active = false where id = $1', [arch.id]);
    expect((await fail(cart(randomUUID(), [{ plan_id: arch.id, qty: 1 }])))?.message).toBe('PLAN_NOT_FOUND');
    expect(await status(arch.codes[0])).toBe('available');
    expect((await fail(cart(randomUUID(), [{ plan_id: a.id, qty: 1 }], 100000, stranger)))?.message).toBe('FORBIDDEN');
  });

  it('enforces 1..10 vouchers and a sane shape', async () => {
    const a = await plan(2000, 12);
    const one = (qty: unknown) => [{ plan_id: a.id, qty }];
    expect((await fail(cart(randomUUID(), one(11))))?.message).toBe('CART_TOO_BIG');
    expect((await fail(cart(randomUUID(), [{ plan_id: a.id, qty: 6 }, { plan_id: a.id, qty: 5 }])))?.message).toBe('CART_TOO_BIG');
    expect((await fail(cart(randomUUID(), Array.from({ length: 11 }, () => ({ plan_id: a.id, qty: 1 })))))?.message).toBe('CART_TOO_BIG');
    for (const bad of [[], {}, 'x', one(0), one(-1), one(1.5), one('2'), one(null), [{ qty: 1 }], [{ plan_id: 'nope', qty: 1 }], [1]]) {
      expect((await fail(cart(randomUUID(), bad)))?.message, JSON.stringify(bad)).toBe('CART_INVALID');
    }
    expect(await status(a.codes[0])).toBe('available');
    const ten = await cart(randomUUID(), one(10));
    expect(ten).toHaveLength(10);
    expect(new Set(ten.map((r) => r.voucher_code)).size).toBe(10);
  });

  it('same key + same items returns the same sales (even after stock ran out); same key + different items is KEY_REUSED', async () => {
    const a = await plan(2000, 3);
    const key = randomUUID();
    const first = await cart(key, [{ plan_id: a.id, qty: 3 }]);
    const again = await cart(key, [{ plan_id: a.id, qty: 3 }]); // stock is 0 now
    expect(again.map((r) => r.id)).toEqual(first.map((r) => r.id));
    expect((await fail(cart(key, [{ plan_id: a.id, qty: 2 }])))?.message).toBe('KEY_REUSED');
    const b = await plan(2000, 1);
    expect((await fail(cart(key, [{ plan_id: a.id, qty: 3 }, { plan_id: b.id, qty: 1 }])))?.message).toBe('KEY_REUSED');
    expect(await salesFor(key)).toHaveLength(3);
    expect(await status(b.codes[0])).toBe('available');
  });

  it('5 parallel calls with one group key on exactly the last 3 codes make one group and never a false OUT_OF_STOCK', async () => {
    const a = await plan(2000, 3);
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => cart(key, [{ plan_id: a.id, qty: 3 }])));
    for (const r of results) expect(r.map((x) => x.id)).toEqual(results[0].map((x) => x.id));
    expect(await salesFor(key)).toHaveLength(3);
    expect((await pool.query(`select count(*)::int n from public.vouchers where plan_id = $1 and status = 'sold'`, [a.id])).rows[0].n).toBe(3);
  });

  it('8 parallel carts of 2 on 10 codes: exactly 5 succeed, no code is shared, none is left idle', async () => {
    const a = await plan(2000, 10);
    const settled = await Promise.allSettled(Array.from({ length: 8 }, () => cart(randomUUID(), [{ plan_id: a.id, qty: 2 }])));
    const ok = settled.filter((s): s is PromiseFulfilledResult<Sale[]> => s.status === 'fulfilled');
    const bad = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    expect(ok).toHaveLength(5);
    expect(bad).toHaveLength(3);
    expect(bad.every((b) => b.reason.message === 'OUT_OF_STOCK')).toBe(true);
    const codes = ok.flatMap((s) => s.value.map((r) => r.voucher_code));
    expect(new Set(codes).size).toBe(10);
    expect((await pool.query(`select count(*)::int n from public.vouchers where plan_id = $1 and status = 'available'`, [a.id])).rows[0].n).toBe(0);
  });

  it('20 parallel mixed carts over two plans (opposite item order) never deadlock or oversell', async () => {
    const a = await plan(2000, 6);
    const b = await plan(5000, 6);
    const settled = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => cart(randomUUID(),
      i % 2 ? [{ plan_id: a.id, qty: 1 }, { plan_id: b.id, qty: 1 }] : [{ plan_id: b.id, qty: 1 }, { plan_id: a.id, qty: 1 }])));
    const ok = settled.filter((s): s is PromiseFulfilledResult<Sale[]> => s.status === 'fulfilled');
    const bad = settled.filter((s): s is PromiseRejectedResult => s.status === 'rejected');
    expect(bad.map((x) => x.reason.message).filter((m) => m !== 'OUT_OF_STOCK')).toEqual([]); // no deadlock detected, nothing else
    expect(ok).toHaveLength(6);
    const codes = ok.flatMap((s) => s.value.map((r) => r.voucher_code));
    expect(new Set(codes).size).toBe(12);
  });

  it('a cart waiting behind another cart that rolls back still succeeds (no false OUT_OF_STOCK)', async () => {
    const a = await plan(2000, 2);
    const holder = await pool.connect();
    try {
      await holder.query('begin');
      await holder.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
      await holder.query('select * from public.sell_cart($1, $2, 100000)', [randomUUID(), JSON.stringify([{ plan_id: a.id, qty: 2 }])]);
      // The holder has both codes locked but not committed. The second cart must queue, not fail.
      let done = false;
      const waiter = cart(randomUUID(), [{ plan_id: a.id, qty: 2 }]).finally(() => { done = true; });
      await new Promise((r) => setTimeout(r, 400));
      expect(done).toBe(false);
      await holder.query('rollback');
      const rows = await waiter;
      expect(rows.map((r) => r.voucher_code)).toEqual(a.codes);
    } finally {
      holder.release();
    }
  });

  it('voiding one code of a group burns only that code; totals drop it; it is never resold', async () => {
    const a = await plan(2000, 5);
    const key = randomUUID();
    const rows = await cart(key, [{ plan_id: a.id, qty: 3 }]);
    await as(owner, (c) => c.query('select * from public.void_sale($1, $2)', [rows[1].id, 'wrong guest']));
    expect(await status(rows[0].voucher_code)).toBe('sold');
    expect(await status(rows[1].voucher_code)).toBe('burned');
    expect(await status(rows[2].voucher_code)).toBe('sold');
    const totals = (await as(owner, (c) => c.query(`select sum(sale_count)::int n, sum(total_centavos)::int t from public.sales_totals(current_date - 1, current_date + 1, 'day', $1)`, [a.id]))).rows[0];
    expect(totals).toEqual({ n: 2, t: 4000 });
    const rest = await cart(randomUUID(), [{ plan_id: a.id, qty: 2 }]);
    expect(rest.map((r) => r.voucher_code)).toEqual(a.codes.slice(3, 5));
    expect((await fail(cart(randomUUID(), [{ plan_id: a.id, qty: 1 }])))?.message).toBe('OUT_OF_STOCK');
    expect(await status(rows[1].voucher_code)).toBe('burned');
  });

  it('the old single sell_voucher still works and leaves group columns empty', async () => {
    const a = await plan(2000, 2);
    const s = (await as(owner, (c) => c.query('select * from public.sell_voucher($1, $2, 2000)', [randomUUID(), a.id]))).rows[0];
    expect(s.voucher_code).toBe(a.codes[0]);
    expect(s.group_id).toBeNull();
    expect(s.seq).toBeNull();
  });
});
