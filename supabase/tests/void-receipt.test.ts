// void_receipt (0006) against a LOCAL Postgres, as the real `authenticated` / `anon` roles. Same setup as audit.test.ts,
// plus 0004, 0005 and 0006. Skipped when SUPABASE_TEST_DB_URL is unset. Never point it at production: audit rows cannot be deleted.
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_DB_URL;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!url)('void_receipt and the Owner Test restock (0006)', () => {
  const pool = new Pool({ connectionString: url, max: 30 });
  const tag = randomUUID().slice(0, 8);
  const ids = { owner: randomUUID(), staff: randomUUID(), owner2: randomUUID() };
  const people = Object.values(ids);
  let n = 0;

  async function as<T>(role: 'authenticated' | 'anon', sub: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${role}`);
      if (sub) await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role })]);
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
  const asUser = <T>(sub: string, fn: (c: PoolClient) => Promise<T>) => as('authenticated', sub, fn);
  const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { message: string } | null;
  const maxId = async () => Number((await pool.query('select coalesce(max(id), 0) as m from public.audit_log')).rows[0].m);
  const logSince = async (base: number, where = 'true') =>
    (await pool.query(`select * from public.audit_log where id > $1 and ${where} order by id`, [base])).rows as Row[];

  /** A plan with `count` fresh codes, imported by the owner. */
  async function plan(count: number, price = 1000) {
    const name = `void-${tag}-${++n}`;
    const id = (await pool.query(`insert into public.plans (name, duration_minutes, price_centavos) values ($1, 60, $2) returning id`, [name, price])).rows[0].id as string;
    const prefix = randomUUID().replace(/-/g, '').slice(0, 10);
    const codes = Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
    await asUser(ids.owner, (c) => c.query('select * from public.import_vouchers($1, $2)', [id, codes]));
    return { id, name, codes };
  }
  /** Sell a cart of `qty` of one plan; returns the group key and the rows. */
  async function sell(user: string, planId: string, qty: number) {
    const key = randomUUID();
    const rows = await asUser(user, async (c) => (await c.query('select * from public.sell_cart($1, $2, $3)', [key, JSON.stringify([{ plan_id: planId, qty }]), 1_000_000])).rows as Row[]);
    return { key, rows };
  }
  const voidReceipt = (user: string, ref: string, reason: string, note: string | null = null) =>
    asUser(user, async (c) => (await c.query('select * from public.void_receipt($1, $2, $3)', [ref, reason, note])).rows as Row[]);
  const voucher = async (code: string) => (await pool.query('select status from public.vouchers where code = $1', [code])).rows[0].status as string;
  const stock = async (planId: string) => Number((await pool.query(`select count(*) c from public.vouchers where plan_id = $1 and status = 'available'`, [planId])).rows[0].c);
  const sales = async (key: string) => (await pool.query('select * from public.sales where group_id = $1 order by seq', [key])).rows as Row[];
  const mask = (code: string) => `***${code.slice(-3)}`;

  beforeAll(async () => {
    await pool.query('insert into auth.users (id, email) select x, x || $2 from unnest($1::uuid[]) x', [people, `@${tag}.invalid`]);
    await pool.query(`insert into public.profiles (user_id, role, display_name) values ($1,'owner','Owner Test'), ($2,'staff','Staff A'), ($3,'owner','Other Owner')`, [ids.owner, ids.staff, ids.owner2]);
  });
  afterAll(async () => {
    await pool.query('delete from public.payments where sale_id in (select id from public.sales where sold_by = any($1))', [people]);
    await pool.query('delete from public.sales where sold_by = any($1)', [people]);
    await pool.query('delete from public.vouchers where imported_by = any($1)', [people]);
    await pool.query('delete from public.plans where name like $1', [`void-${tag}-%`]);
    await pool.query('delete from public.profiles where user_id = any($1)', [people]);
    await pool.query('delete from auth.users where id = any($1)', [people]);
    await pool.end();
  });

  it('a normal reason voids every code, burns them, voids the payments and writes ONE log entry with masked codes', async () => {
    const p = await plan(5);
    const { key, rows } = await sell(ids.staff, p.id, 3);
    const base = await maxId();
    const out = await voidReceipt(ids.owner, key, 'wrong_plan');
    expect(out).toHaveLength(3);
    for (const r of await sales(key)) {
      expect(r).toMatchObject({ status: 'voided', void_reason: 'Wrong plan sold', void_reason_code: 'wrong_plan', voided_by: ids.owner });
      expect(r.void_batch).not.toBeNull();
    }
    for (const r of rows) expect(await voucher(r.voucher_code)).toBe('burned');
    expect((await pool.query(`select status from public.payments where sale_id = any($1)`, [rows.map((r) => r.id)])).rows.every((x) => x.status === 'voided')).toBe(true);
    const log = await logSince(base);
    expect(log.map((e) => e.action)).toEqual(['void']); // one entry, not three, and no restock
    expect(log[0].actor_name).toBe('Owner Test');
    expect(log[0].detail).toMatchObject({ count: 3, reason: 'Wrong plan sold', reason_code: 'wrong_plan', returned: false });
    expect(log[0].detail.codes).toEqual(rows.map((r) => mask(r.voucher_code)));
    expect(await stock(p.id)).toBe(2); // burned codes do not come back
  });

  it('with a code already voided the others are voided, the voided one is untouched, and a second call changes nothing', async () => {
    const p = await plan(4);
    const { key, rows } = await sell(ids.owner, p.id, 3);
    await asUser(ids.owner, (c) => c.query('select * from public.void_sale($1, $2)', [rows[0].id, 'earlier mistake']));
    const base = await maxId();
    await voidReceipt(ids.owner, key, 'changed_mind');
    const after = await sales(key);
    expect(after[0]).toMatchObject({ void_reason: 'earlier mistake', void_batch: null }); // unchanged
    expect(after[1]).toMatchObject({ void_reason: 'Guest changed their mind' });
    expect(after[2]).toMatchObject({ void_reason: 'Guest changed their mind' });
    const log = await logSince(base);
    expect(log).toHaveLength(1);
    expect(log[0].detail.count).toBe(2);
    await voidReceipt(ids.owner, key, 'changed_mind'); // again: no-op
    expect(await logSince(base)).toHaveLength(1);
  });

  it('"Other" needs a 3 to 200 character note, stored as the reason; unknown reasons are refused', async () => {
    const p = await plan(3);
    const { key } = await sell(ids.owner, p.id, 1);
    expect((await fail(voidReceipt(ids.owner, key, 'other', 'ab')))?.message).toBe('REASON_REQUIRED');
    expect((await fail(voidReceipt(ids.owner, key, 'other')))?.message).toBe('REASON_REQUIRED');
    expect((await fail(voidReceipt(ids.owner, key, 'other', 'x'.repeat(201))))?.message).toBe('REASON_REQUIRED');
    expect((await fail(voidReceipt(ids.owner, key, 'because I said so')))?.message).toBe('BAD_REASON');
    expect((await fail(voidReceipt(ids.owner, randomUUID(), 'wrong_plan')))?.message).toBe('SALE_NOT_FOUND');
    await voidReceipt(ids.owner, key, 'other', '  Guest left early  ');
    expect((await sales(key))[0]).toMatchObject({ void_reason: 'Guest left early', void_reason_code: 'other' });
  });

  it('Owner Test on the owner\'s own fresh receipt returns EVERY code to stock, logs a restock, and the codes sell again first', async () => {
    const p = await plan(6);
    const { key, rows } = await sell(ids.owner, p.id, 3);
    expect(await stock(p.id)).toBe(3);
    const base = await maxId();
    await voidReceipt(ids.owner, key, 'owner_test');
    for (const r of rows) expect(await voucher(r.voucher_code)).toBe('available');
    expect(await stock(p.id)).toBe(6);
    for (const r of await sales(key)) expect(r).toMatchObject({ status: 'voided', void_reason: 'Owner Test', void_reason_code: 'owner_test' });
    const log = await logSince(base);
    expect(log.map((e) => e.action)).toEqual(['void', 'restock']);
    expect(log[0].detail).toMatchObject({ count: 3, returned: true });
    expect(log[1].detail).toMatchObject({ count: 3, plans: [{ plan: p.name, qty: 3 }] });
    // The restocked codes keep their place in the queue: they are the next ones sold.
    const next = await sell(ids.staff, p.id, 3);
    expect(next.rows.map((r) => r.voucher_code).sort()).toEqual(rows.map((r) => r.voucher_code).sort());
    // History is kept: each code now has a voided sale AND a completed sale; the old rows are untouched.
    const per = (await pool.query(`select status, count(*)::int n from public.sales where voucher_code = $1 group by status order by status`, [rows[0].voucher_code])).rows;
    expect(per).toEqual([{ status: 'completed', n: 1 }, { status: 'voided', n: 1 }]);
    expect((await sales(key)).every((r) => r.status === 'voided')).toBe(true);
  });

  it('Owner Test guards: a staff sale, a sale older than 60 minutes, or a code no longer sold refuses and changes NOTHING', async () => {
    const p = await plan(9);
    const staffSale = await sell(ids.staff, p.id, 2);
    const oldSale = await sell(ids.owner, p.id, 2);
    await pool.query(`update public.sales set created_at = now() - interval '2 hours' where group_id = $1`, [oldSale.key]);
    const oddSale = await sell(ids.owner, p.id, 2);
    await pool.query(`update public.vouchers set status = 'burned' where code = $1`, [oddSale.rows[1].voucher_code]);
    const otherOwner = await sell(ids.owner2, p.id, 1);

    for (const [sale, err] of [[staffSale, 'STAFF_SALE'], [oldSale, 'TOO_OLD'], [oddSale, 'NOT_SOLD'], [otherOwner, 'STAFF_SALE']] as const) {
      const before = JSON.stringify((await sales(sale.key)).map((r) => [r.status, r.void_batch]));
      const vBefore = await Promise.all(sale.rows.map((r) => voucher(r.voucher_code)));
      const base = await maxId();
      expect((await fail(voidReceipt(ids.owner, sale.key, 'owner_test')))?.message).toBe(err);
      expect(JSON.stringify((await sales(sale.key)).map((r) => [r.status, r.void_batch]))).toBe(before);
      expect(await Promise.all(sale.rows.map((r) => voucher(r.voucher_code)))).toEqual(vBefore);
      expect(await logSince(base)).toEqual([]);
    }
    // The same receipts can still be voided with an ordinary reason (burned).
    await voidReceipt(ids.owner, staffSale.key, 'wrong_plan');
    for (const r of staffSale.rows) expect(await voucher(r.voucher_code)).toBe('burned');
  });

  it('staff and anon cannot void a receipt', async () => {
    const p = await plan(3);
    const { key } = await sell(ids.staff, p.id, 1);
    expect(await fail(voidReceipt(ids.staff, key, 'wrong_plan'))).not.toBeNull();
    expect(await fail(as('anon', null, (c) => c.query(`select * from public.void_receipt($1, 'wrong_plan', null)`, [key])))).not.toBeNull();
    expect((await sales(key))[0].status).toBe('completed');
  });

  it('void_sale (one code) still burns the code; it never restocks', async () => {
    const p = await plan(3);
    const { rows } = await sell(ids.owner, p.id, 1);
    await asUser(ids.owner, (c) => c.query('select * from public.void_sale($1, $2)', [rows[0].id, 'Owner Test']));
    expect(await voucher(rows[0].voucher_code)).toBe('burned');
  });

  it('an old sale without a group is voided by its own id', async () => {
    const p = await plan(2);
    const { rows } = await sell(ids.owner, p.id, 1);
    await pool.query(`update public.sales set group_id = null, seq = null where id = $1`, [rows[0].id]);
    await voidReceipt(ids.owner, rows[0].id, 'sold_twice');
    expect((await pool.query('select status from public.sales where id = $1', [rows[0].id])).rows[0].status).toBe('voided');
  });

  it('race: a restock while 20 carts are being sold never sells a code twice, loses a code, or deadlocks', async () => {
    const p = await plan(12);
    const mine = await sell(ids.owner, p.id, 3);
    const results = await Promise.allSettled([
      voidReceipt(ids.owner, mine.key, 'owner_test'),
      ...Array.from({ length: 20 }, () => sell(ids.staff, p.id, 1)),
    ]);
    const errs = results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason.message as string);
    expect(errs.every((m) => m === 'OUT_OF_STOCK' || m === 'KEY_REUSED')).toBe(true); // never a deadlock or other error
    const completed = (await pool.query(`select voucher_id, count(*)::int n from public.sales s where s.voucher_code = any($1) and s.status = 'completed' group by voucher_id`, [p.codes])).rows;
    expect(completed.every((r) => r.n === 1)).toBe(true);
    const states = (await pool.query(`select status, count(*)::int n from public.vouchers where plan_id = $1 group by status`, [p.id])).rows;
    const total = states.reduce((a, r) => a + r.n, 0);
    expect(total).toBe(12);
    const sold = completed.length;
    const avail = states.find((r) => r.status === 'available')?.n ?? 0;
    const soldStatus = states.find((r) => r.status === 'sold')?.n ?? 0;
    expect(soldStatus).toBe(sold); // every 'sold' voucher has exactly one completed sale, and vice versa
    expect(avail + soldStatus).toBe(12);
  });

  it('two parallel Owner Test voids of the same receipt restock it once', async () => {
    const p = await plan(4);
    const { key, rows } = await sell(ids.owner, p.id, 2);
    const base = await maxId();
    const r = await Promise.allSettled([voidReceipt(ids.owner, key, 'owner_test'), voidReceipt(ids.owner, key, 'owner_test')]);
    expect(r.every((x) => x.status === 'fulfilled')).toBe(true);
    expect((await logSince(base, `action = 'restock'`))).toHaveLength(1);
    for (const x of rows) expect(await voucher(x.voucher_code)).toBe('available');
    expect(await stock(p.id)).toBe(4);
  });

  it('no log entry ever holds a full code', async () => {
    const all = (await pool.query(`select detail::text d from public.audit_log where action in ('void','restock')`)).rows.map((r) => r.d).join('\n');
    expect(all).not.toMatch(/"[0-9a-f]{12}"/);
    expect(all).toContain('***');
  });
});
