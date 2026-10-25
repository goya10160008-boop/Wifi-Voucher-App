// Activity log + hardening (0003) against a LOCAL Postgres. See docs/decisions.md decision 16 for the no-Docker
// setup; apply local-shim.sql, 0001_init.sql, 0002_sell_cart.sql, 0003_hardening_and_audit.sql, then
// SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54329/voucher_test npx vitest run supabase/tests/audit.test.ts
// Skipped when the env var is unset. Never point it at the production project: it writes rows (the audit_log
// rows it creates cannot be deleted, by design, so use a throwaway database).
//
// Unlike the older suites, this one runs queries as the REAL `authenticated` / `anon` roles (SET LOCAL ROLE) with
// JWT claims, so row-level security and grants are actually exercised.
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_DB_URL;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe.skipIf(!url)('audit log and hardening (0003)', () => {
  const pool = new Pool({ connectionString: url, max: 10 });
  const tag = randomUUID().slice(0, 8);
  const ids = { owner: randomUUID(), a: randomUUID(), b: randomUUID(), c: randomUUID(), stranger: randomUUID() };
  const people = Object.values(ids);
  let n = 0;
  let thresholdBefore = 10;

  /** Run fn inside a transaction as a real database role with JWT claims. Rolls back (and rethrows) on error. */
  async function asRole<T>(role: 'authenticated' | 'anon', sub: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
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
  const asUser = <T>(sub: string, fn: (c: PoolClient) => Promise<T>) => asRole('authenticated', sub, fn);
  const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { message: string } | null;

  const maxId = async () => Number((await pool.query('select coalesce(max(id), 0) as m from public.audit_log')).rows[0].m);
  const logSince = async (base: number, where = 'true', params: unknown[] = []) =>
    (await pool.query(`select * from public.audit_log where id > $1 and ${where} order by id`, [base, ...params])).rows as Row[];

  /** A plan with `count` fresh codes, imported by the owner through the real function. */
  async function plan(price: number, count: number, name = `audit-${tag}-${++n}`) {
    const id = (await pool.query(
      `insert into public.plans (name, duration_minutes, price_centavos) values ($1, 60, $2) returning id`, [name, price])).rows[0].id as string;
    const prefix = randomUUID().replace(/-/g, '').slice(0, 10);
    const codes = Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(2, '0')}`);
    if (count) await asUser(ids.owner, (c) => c.query('select * from public.import_vouchers($1, $2)', [id, codes]));
    return { id, name, codes };
  }
  const sell = (user: string, items: { plan_id: string; qty: number }[], key = randomUUID(), tendered = 100000) =>
    asUser(user, async (c) => (await c.query('select * from public.sell_cart($1, $2, $3)', [key, JSON.stringify(items), tendered])).rows as Row[]);
  const mask = (code: string) => `***${code.slice(-3)}`;

  beforeAll(async () => {
    await pool.query('insert into auth.users (id, email) select x, x || $2 from unnest($1::uuid[]) x', [people, `@${tag}.invalid`]);
    await pool.query(
      `insert into public.profiles (user_id, role, display_name) values
        ($1, 'owner', 'Owner Test'), ($2, 'staff', 'Staff A'), ($3, 'staff', 'Staff B'), ($4, 'staff', 'Staff C')`,
      [ids.owner, ids.a, ids.b, ids.c]);
    thresholdBefore = (await pool.query('select low_stock_threshold t from public.settings')).rows[0].t;
  });

  afterAll(async () => {
    await pool.query('delete from public.payments where sale_id in (select id from public.sales where sold_by = any($1))', [people]);
    await pool.query('delete from public.sales where sold_by = any($1)', [people]);
    await pool.query('delete from public.vouchers where imported_by = any($1)', [people]);
    await pool.query('delete from public.plans where name like $1', [`audit-${tag}-%`]);
    await pool.query('update public.settings set low_stock_threshold = $1', [thresholdBefore]);
    await pool.query('delete from public.profiles where user_id = any($1)', [people]);
    await pool.query('delete from auth.users where id = any($1)', [people]);
    await pool.end();
  });

  // ---- sales ---------------------------------------------------------------------------------------------

  it('a staff sale writes ONE entry with the staff name, the total, plan counts and masked codes only', async () => {
    const p = await plan(2000, 5);
    const base = await maxId();
    const key = randomUUID();
    const rows = await sell(ids.a, [{ plan_id: p.id, qty: 3 }], key);
    const log = await logSince(base, `action = 'sale'`);
    expect(log).toHaveLength(1); // a cart of 3 is ONE entry, not 3
    const e = log[0];
    expect(e.actor).toBe(ids.a);
    expect(e.actor_name).toBe('Staff A');
    expect(e.target_id).toBe(key);
    expect(e.detail.count).toBe(3);
    expect(e.detail.total_centavos).toBe(6000);
    expect(e.detail.plans).toEqual([{ plan: p.name, qty: 3 }]);
    expect(e.detail.codes).toEqual(rows.map((r) => mask(r.voucher_code)));
    for (const code of p.codes) expect(JSON.stringify(e.detail)).not.toContain(code); // no full code, sold or unsold
  });

  it('a mixed cart is one entry with both plans; a retry with the same key and a failed sale write nothing', async () => {
    const a = await plan(2000, 3, `audit-${tag}-mixA`);
    const b = await plan(5000, 1, `audit-${tag}-mixB`);
    const base = await maxId();
    const key = randomUUID();
    await sell(ids.a, [{ plan_id: a.id, qty: 2 }, { plan_id: b.id, qty: 1 }], key);
    await sell(ids.a, [{ plan_id: a.id, qty: 2 }, { plan_id: b.id, qty: 1 }], key); // idempotent retry
    expect((await fail(sell(ids.a, [{ plan_id: b.id, qty: 1 }])))?.message).toBe('OUT_OF_STOCK'); // b is now empty
    const log = await logSince(base, `action = 'sale'`);
    expect(log).toHaveLength(1);
    expect(log[0].detail.count).toBe(3);
    expect(log[0].detail.total_centavos).toBe(9000);
    expect(log[0].detail.plans).toEqual([{ plan: a.name, qty: 2 }, { plan: b.name, qty: 1 }]);
  });

  it('a void writes one entry (masked code, reason); voiding again or a staff attempt writes nothing', async () => {
    const p = await plan(2000, 2);
    const [sale] = await sell(ids.a, [{ plan_id: p.id, qty: 1 }]);
    const base = await maxId();
    expect((await fail(asUser(ids.a, (c) => c.query('select * from public.void_sale($1, $2)', [sale.id, 'staff tries']))))?.message).toBe('FORBIDDEN');
    await asUser(ids.owner, (c) => c.query('select * from public.void_sale($1, $2)', [sale.id, 'wrong plan']));
    await asUser(ids.owner, (c) => c.query('select * from public.void_sale($1, $2)', [sale.id, 'again'])); // already voided
    const log = await logSince(base);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'void', actor: ids.owner, actor_name: 'Owner Test', target_id: sale.id });
    expect(log[0].detail).toMatchObject({ code: mask(sale.voucher_code), plan: p.name, price_centavos: 2000, reason: 'wrong plan' });
    expect(JSON.stringify(log[0].detail)).not.toContain(sale.voucher_code);
  });

  // ---- imports -------------------------------------------------------------------------------------------

  it('an import writes ONE entry with the count and plan and no codes; an all-duplicate import writes none', async () => {
    const id = (await pool.query(`insert into public.plans (name, duration_minutes, price_centavos) values ($1, 60, 1000) returning id`, [`audit-${tag}-imp`])).rows[0].id;
    const prefix = randomUUID().replace(/-/g, '').slice(0, 10);
    const codes = Array.from({ length: 5 }, (_, i) => `${prefix}${i}`);
    const base = await maxId();
    const r = (await asUser(ids.owner, (c) => c.query('select * from public.import_vouchers($1, $2)', [id, [...codes, codes[0], 'bad!']]))).rows[0];
    expect(r.inserted).toBe(5);
    const dup = (await asUser(ids.owner, (c) => c.query('select * from public.import_vouchers($1, $2)', [id, codes]))).rows[0];
    expect(dup.inserted).toBe(0);
    const log = await logSince(base, `action = 'import'`);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: ids.owner, target_id: r.batch_id });
    expect(log[0].detail).toMatchObject({ count: 5, plan: `audit-${tag}-imp` });
    for (const code of codes) expect(JSON.stringify(log[0].detail)).not.toContain(code);
  });

  it('no unsold or full code appears anywhere in the log', async () => {
    const p = await plan(2000, 6);
    const rows = await sell(ids.b, [{ plan_id: p.id, qty: 2 }]);
    const sold = rows.map((r) => r.voucher_code);
    for (const code of p.codes) {
      const hit = await pool.query(`select count(*)::int c from public.audit_log where detail::text like $1 or target_id like $1`, [`%${code}%`]);
      expect(hit.rows[0].c, `${code} (${sold.includes(code) ? 'sold' : 'unsold'}) leaked`).toBe(0);
    }
  });

  // ---- plans, settings, staff ------------------------------------------------------------------------------

  it('plan create, edit, archive and restore are logged with what changed; non-changes and staff attempts are not', async () => {
    const name = `audit-${tag}-chg`;
    const base = await maxId();
    const id = (await asUser(ids.owner, (c) => c.query(
      `insert into public.plans (name, duration_minutes, price_centavos) values ($1, 180, 1000) returning id`, [name]))).rows[0].id as string;
    const upd = (set: string, ...v: unknown[]) => asUser(ids.owner, (c) => c.query(`update public.plans set ${set} where id = $1`, [id, ...v]));
    await upd('price_centavos = $2', 1200);
    await upd('sort_order = $2', 5);          // not logged
    await upd('price_centavos = $2', 1200);   // same value, not logged
    await upd('name = $2, duration_minutes = $3', `${name}x`, 240);
    await upd('active = false');
    await upd('active = true');
    const staffTry = await asUser(ids.a, (c) => c.query('update public.plans set price_centavos = 1 where id = $1', [id]));
    expect(staffTry.rowCount).toBe(0); // RLS: staff cannot edit plans
    const log = await logSince(base, `target_id = $2`, [id]);
    expect(log.map((e) => e.action)).toEqual(['plan_create', 'plan_update', 'plan_update', 'plan_archive', 'plan_restore']);
    expect(log.every((e) => e.actor === ids.owner)).toBe(true);
    expect(log[0].detail).toEqual({ name, minutes: 180, price_centavos: 1000 });
    expect(log[1].detail.changes).toEqual({ price_centavos: { from: 1000, to: 1200 } });
    expect(log[2].detail.changes).toEqual({ name: { from: name, to: `${name}x` }, minutes: { from: 180, to: 240 } });
    await pool.query('delete from public.plans where id = $1', [id]);
  });

  it('a threshold change is logged once with from and to; the same value and a staff attempt are not', async () => {
    const base = await maxId();
    const to = thresholdBefore + 7;
    await asUser(ids.owner, (c) => c.query('update public.settings set low_stock_threshold = $1', [to]));
    await asUser(ids.owner, (c) => c.query('update public.settings set low_stock_threshold = $1', [to]));
    const staffTry = await asUser(ids.a, (c) => c.query('update public.settings set low_stock_threshold = 99'));
    expect(staffTry.rowCount).toBe(0);
    const log = await logSince(base);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'settings_update', actor: ids.owner, detail: { from: thresholdBefore, to } });
  });

  it('staff changes are logged; changes made in the SQL editor (no signed-in user) show as the database admin', async () => {
    const uid = randomUUID();
    await pool.query('insert into auth.users (id, email) values ($1, $2)', [uid, `new@${tag}.invalid`]);
    const base = await maxId();
    await pool.query(`insert into public.profiles (user_id, role, display_name) values ($1, 'staff', 'Maria')`, [uid]);
    await pool.query('update public.profiles set display_name = $2 where user_id = $1', [uid, 'Maria R']); // not logged
    await pool.query('update public.profiles set active = false where user_id = $1', [uid]);
    await pool.query('update public.profiles set active = true where user_id = $1', [uid]);
    await pool.query(`update public.profiles set role = 'owner' where user_id = $1`, [uid]);
    const log = await logSince(base);
    expect(log.map((e) => e.action)).toEqual(['staff_add', 'staff_deactivate', 'staff_reactivate', 'role_change']);
    expect(log.every((e) => e.actor === null && e.actor_name === 'database admin' && e.target_id === uid)).toBe(true);
    expect(log[0].detail).toEqual({ name: 'Maria', role: 'staff' });
    expect(log[3].detail).toEqual({ name: 'Maria R', from: 'staff', to: 'owner' });
    await pool.query('delete from public.profiles where user_id = $1', [uid]);
    await pool.query('delete from auth.users where id = $1', [uid]);
  });

  // ---- append-only and access ------------------------------------------------------------------------------

  it('is append-only: nobody can update, delete or truncate a row, not even the database owner', async () => {
    for (const sql of ['update public.audit_log set action = action', 'delete from public.audit_log', 'truncate public.audit_log']) {
      expect((await fail(pool.query(sql)))?.message, sql).toMatch(/append-only/);
    }
    expect((await pool.query('select count(*)::int c from public.audit_log')).rows[0].c).toBeGreaterThan(0);
  });

  it('only the owner can read the log; staff, a user with no profile and anon get nothing; nobody can write it', async () => {
    const seen = (user: string) => asUser(user, async (c) => (await c.query('select count(*)::int c from public.audit_log')).rows[0].c as number);
    expect(await seen(ids.owner)).toBeGreaterThan(0);
    expect(await seen(ids.a)).toBe(0);
    expect(await seen(ids.c)).toBe(0);
    expect(await seen(ids.stranger)).toBe(0);
    expect((await fail(asRole('anon', null, (c) => c.query('select * from public.audit_log'))))?.message).toMatch(/permission denied/);
    for (const user of [ids.owner, ids.a]) {
      for (const sql of [
        `insert into public.audit_log (action) values ('sale')`,
        `update public.audit_log set action = 'void'`,
        `delete from public.audit_log`,
        `truncate public.audit_log`,
        `select public.audit_write('sale', 'x', 'y', '{}')`,
      ]) {
        expect((await fail(asUser(user, (c) => c.query(sql))))?.message, sql).toMatch(/permission denied/);
      }
    }
  });

  it('the old single-sale function is no longer callable by signed-in users', async () => {
    const p = await plan(2000, 1);
    const err = await fail(asUser(ids.a, (c) => c.query('select * from public.sell_voucher($1, $2, $3)', [randomUUID(), p.id, 2000])));
    expect(err?.message).toMatch(/permission denied/);
  });

  // ---- RLS as the real authenticated role ---------------------------------------------------------------------

  it('staff only see their own sales and payments; a deactivated staff member sees nothing', async () => {
    const p = await plan(2000, 10);
    await sell(ids.a, [{ plan_id: p.id, qty: 2 }]);
    await sell(ids.b, [{ plan_id: p.id, qty: 1 }]);
    await sell(ids.c, [{ plan_id: p.id, qty: 1 }]);
    const count = (user: string, sql: string) => asUser(user, async (c) => (await c.query(sql, [p.id])).rows[0].c as number);
    const sales = (user: string) => count(user, 'select count(*)::int c from public.sales where plan_id = $1');
    const pays = (user: string) =>
      count(user, 'select count(*)::int c from public.payments where sale_id in (select id from public.sales where plan_id = $1)');

    expect(await sales(ids.owner)).toBe(4);
    expect(await sales(ids.a)).toBe(2);
    expect(await sales(ids.b)).toBe(1);
    expect(await pays(ids.owner)).toBe(4);
    expect(await pays(ids.a)).toBe(2);
    expect(await pays(ids.c)).toBe(1);

    await pool.query(`update public.profiles set active = false where user_id = $1`, [ids.c]); // deactivate C
    expect(await sales(ids.c)).toBe(0);
    // Reads payments directly (no join through sales), which is what the policy fix is about.
    expect(await asUser(ids.c, async (c) => (await c.query('select count(*)::int c from public.payments')).rows[0].c)).toBe(0);
    expect((await fail(sell(ids.c, [{ plan_id: p.id, qty: 1 }])))?.message).toBe('FORBIDDEN');
    expect(await asUser(ids.c, async (c) => (await c.query('select count(*)::int c from public.plan_stock()')).rows[0].c)).toBe(0);
    await pool.query(`update public.profiles set active = true where user_id = $1`, [ids.c]);
  });

  it('staff cannot read unsold codes, other profiles, or use owner-only functions', async () => {
    const p = await plan(2000, 3);
    const read = (user: string, sql: string, ...v: unknown[]) => asUser(user, async (c) => (await c.query(sql, v)).rows as Row[]);
    expect((await read(ids.owner, 'select id from public.vouchers where plan_id = $1', p.id))).toHaveLength(3);
    expect(await read(ids.a, 'select id from public.vouchers where plan_id = $1', p.id)).toHaveLength(0);
    expect((await read(ids.a, 'select user_id from public.profiles')).map((r) => r.user_id)).toEqual([ids.a]);
    expect((await read(ids.owner, 'select user_id from public.profiles where user_id = any($1)', people)).length).toBeGreaterThanOrEqual(4);
    expect((await fail(read(ids.a, 'select * from public.import_vouchers($1, $2)', p.id, ['123456789'])))?.message).toBe('FORBIDDEN');
    expect((await read(ids.a, 'select * from public.plan_stock()')).length).toBeGreaterThan(0); // counts only
    await asRole('anon', null, async (c) => {
      for (const t of ['sales', 'vouchers', 'payments', 'plans', 'profiles', 'settings']) {
        await c.query('savepoint s');
        expect((await fail(c.query(`select * from public.${t}`)))?.message, t).toMatch(/permission denied/);
        await c.query('rollback to savepoint s');
      }
    });
  });
});
