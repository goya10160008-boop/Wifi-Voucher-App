// Real parallel connections against a LOCAL Supabase DB (`supabase start`, then
// SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test).
// Skipped when the env var is unset. Never point it at the production project:
// it inserts and then deletes rows with a throwaway owner.
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_DB_URL;

describe.skipIf(!url)('sell_voucher under real concurrency', () => {
  const pool = new Pool({ connectionString: url, max: 25 });
  const owner = randomUUID();
  const tag = randomUUID().slice(0, 8);
  let planId = '';
  // 11 codes: the same-key test uses 1, leaving 10 for the 20-parallel test.
  const rand = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
  const codes = Array.from({ length: 11 }, (_, i) => `${String(i).padStart(2, '0')}${rand}`);

  // One transaction per call, as a signed-in owner, like PostgREST does.
  async function sell(key: string, plan = planId, tendered = 2000) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
      const r = await c.query('select * from public.sell_voucher($1, $2, $3)', [key, plan, tendered]);
      await c.query('commit');
      return r.rows[0] as { id: string; voucher_code: string };
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }

  // Extra plan with n fresh codes (imported by stock() as the owner).
  async function newPlan(n: number) {
    const id = (await pool.query(
      `insert into public.plans (name, duration_minutes, price_centavos) values ($1, 60, 2000) returning id`, [`conc-${tag}-${randomUUID().slice(0, 6)}`],
    )).rows[0].id as string;
    const r = String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
    return { id, list: Array.from({ length: n }, (_, i) => `x${String(i).padStart(2, '0')}${r}`) };
  }

  beforeAll(async () => {
    await pool.query(`insert into auth.users (id, email) values ($1, $2)`, [owner, `${tag}@concurrency.invalid`]);
    await pool.query(`insert into public.profiles (user_id, role) values ($1, 'owner')`, [owner]);
    planId = (await pool.query(
      `insert into public.plans (name, duration_minutes, price_centavos) values ($1, 60, 2000) returning id`, [`conc-${tag}`],
    )).rows[0].id;
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
      await c.query('select * from public.import_vouchers($1, $2)', [planId, codes]);
      await c.query('commit');
    } finally {
      c.release();
    }
  });

  afterAll(async () => {
    await pool.query('delete from public.payments where sale_id in (select id from public.sales where sold_by = $1)', [owner]);
    await pool.query('delete from public.sales where sold_by = $1', [owner]);
    await pool.query('delete from public.vouchers where imported_by = $1', [owner]);
    await pool.query(`delete from public.plans where name like $1`, [`conc-${tag}%`]);
    await pool.query('delete from public.profiles where user_id = $1', [owner]);
    await pool.query('delete from auth.users where id = $1', [owner]);
    await pool.end();
  });

  it('5 parallel calls with the same key make exactly one sale', async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => sell(key)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    const { rows } = await pool.query(`select count(*)::int as n from public.vouchers where plan_id = $1 and status = 'sold'`, [planId]);
    expect(rows[0].n).toBe(1);
  });

  it('20 parallel sells on the 10 remaining codes give 10 distinct codes and 10 OUT_OF_STOCK', async () => {
    const settled = await Promise.allSettled(Array.from({ length: 20 }, () => sell(randomUUID())));
    const ok = settled.filter((s): s is PromiseFulfilledResult<{ id: string; voucher_code: string }> => s.status === 'fulfilled');
    const failed = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(10);
    expect(new Set(ok.map((s) => s.value.voucher_code)).size).toBe(10);
    expect(failed).toHaveLength(10);
    expect(failed.every((f) => String(f.reason?.message).includes('OUT_OF_STOCK'))).toBe(true);
  });

  async function stock(n: number) {
    const { id, list } = await newPlan(n);
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
      await c.query('select * from public.import_vouchers($1, $2)', [id, list]);
      await c.query('commit');
    } finally {
      c.release();
    }
    return id;
  }

  it('a voided code is burned: 20 parallel sells never return it', async () => {
    const plan = await stock(5);
    const first = await sell(randomUUID(), plan);
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
      await c.query('select * from public.void_sale($1, $2)', [first.id, 'test void']);
      await c.query('commit');
    } finally {
      c.release();
    }
    const settled = await Promise.allSettled(Array.from({ length: 20 }, () => sell(randomUUID(), plan)));
    const ok = settled.filter((s): s is PromiseFulfilledResult<{ id: string; voucher_code: string }> => s.status === 'fulfilled');
    expect(ok).toHaveLength(4);
    expect(ok.map((s) => s.value.voucher_code)).not.toContain(first.voucher_code);
    expect(new Set(ok.map((s) => s.value.voucher_code)).size).toBe(4);
    const failed = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[];
    expect(failed.every((f) => String(f.reason?.message).includes('OUT_OF_STOCK'))).toBe(true);
    const { rows } = await pool.query(`select status from public.vouchers where code = $1`, [first.voucher_code]);
    expect(rows[0].status).toBe('burned');
  });

  it('parallel sells on two plans do not block or deadlock each other', async () => {
    const [a, b] = [await stock(10), await stock(10)];
    // Hold an uncommitted sale (row lock) on plan A while plan B sells.
    const held = await pool.connect();
    try {
      await held.query('begin');
      await held.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: owner, role: 'authenticated' })]);
      await held.query('select * from public.sell_voucher($1, $2, 2000)', [randomUUID(), a]);
      const t0 = Date.now();
      await sell(randomUUID(), b);
      expect(Date.now() - t0).toBeLessThan(1500);
      await held.query('commit');
    } finally {
      held.release();
    }
    // Interleaved storm: 9 codes left per plan, 12 calls each.
    const settled = await Promise.allSettled(Array.from({ length: 24 }, (_, i) => sell(randomUUID(), i % 2 ? a : b)));
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(18);
    const failed = settled.filter((s) => s.status === 'rejected') as PromiseRejectedResult[];
    expect(failed.every((f) => String(f.reason?.message).includes('OUT_OF_STOCK'))).toBe(true);
  });
});
