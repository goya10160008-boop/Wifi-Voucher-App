// Staff PIN functions (0005) against a LOCAL Postgres, as the real roles (authenticated, anon, service_role).
// Setup as in audit.test.ts, plus 0004 and 0005. Skipped when SUPABASE_TEST_DB_URL is unset. Never point it at production.
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_DB_URL;
type Role = 'authenticated' | 'anon' | 'service_role';

describe.skipIf(!url)('staff PINs (0005)', () => {
  const pool = new Pool({ connectionString: url, max: 10 });
  const tag = randomUUID().slice(0, 8);
  const ids = { owner: randomUUID(), s1: randomUUID(), s2: randomUUID(), s3: randomUUID(), off: randomUUID(), other: randomUUID() };
  const people = Object.values(ids);
  const name = (k: string) => `u${k}${tag}`.slice(0, 20).toLowerCase();
  const PIN = '739418';

  async function as<T>(role: Role, sub: string | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
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
  const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { message: string } | null;
  const setPin = (who: string, target: string, username: string, pin: string) =>
    as('authenticated', who, (c) => c.query('select public.set_user_pin($1, $2, $3)', [target, username, pin]));
  const verify = async (username: string, pin: string) =>
    (await as('service_role', null, (c) => c.query('select * from public.user_pin_verify($1, $2)', [username, pin]))).rows[0] as { ok: boolean; user_id: string | null };
  const row = async (id: string) => (await pool.query('select * from public.user_pins where user_id = $1', [id])).rows[0];
  const wrong = async (u: string, n: number) => { for (let i = 0; i < n; i++) await verify(u, '246810'); };

  beforeAll(async () => {
    await pool.query('insert into auth.users (id, email) select x, x || $2 from unnest($1::uuid[]) x', [people, `@${tag}.invalid`]);
    await pool.query(
      `insert into public.profiles (user_id, role, display_name, active) values
        ($1,'owner','Owner Test',true), ($2,'staff','Staff One',true), ($3,'staff','Staff Two',true),
        ($4,'staff','Staff Three',true), ($5,'staff','Gone',false), ($6,'owner','Other Owner',true)`,
      [ids.owner, ids.s1, ids.s2, ids.s3, ids.off, ids.other]);
  });
  afterAll(async () => {
    await pool.query('delete from public.user_pins where user_id = any($1)', [people]);
    await pool.query('delete from public.profiles where user_id = any($1)', [people]);
    await pool.query('delete from auth.users where id = any($1)', [people]);
    await pool.end();
  });

  it('nobody but the functions can read or write user_pins, not even the owner', async () => {
    await setPin(ids.owner, ids.s1, name('a'), PIN);
    for (const [role, sub] of [['authenticated', ids.owner], ['authenticated', ids.s1], ['anon', null], ['service_role', null]] as const) {
      expect(await fail(as(role, sub, (c) => c.query('select * from public.user_pins')))).not.toBeNull();
      expect(await fail(as(role, sub, (c) => c.query(`update public.user_pins set failed = 0`)))).not.toBeNull();
    }
  });

  it('verify is for service_role only', async () => {
    expect(await fail(as('authenticated', ids.owner, (c) => c.query(`select * from public.user_pin_verify('x', '123')`)))).not.toBeNull();
    expect(await fail(as('anon', null, (c) => c.query(`select * from public.user_pin_verify('x', '123')`)))).not.toBeNull();
    expect((await verify(name('a'), PIN)).ok).toBe(true);
  });

  it('set_user_pin: owner only, active staff only, strong PIN, valid username', async () => {
    expect((await fail(setPin(ids.s1, ids.s2, name('b'), PIN)))?.message).toMatch(/not allowed/);
    expect((await fail(setPin(ids.owner, ids.other, name('b'), PIN)))?.message).toMatch(/not an active staff/); // no owner PIN yet
    expect((await fail(setPin(ids.owner, ids.off, name('b'), PIN)))?.message).toMatch(/not an active staff/);
    expect((await fail(setPin(ids.owner, randomUUID(), name('b'), PIN)))?.message).toMatch(/not an active staff/);
    for (const weak of ['123456', '111111', '654321', '121212', '123123', '12345', '1234567', '73941a', ''])
      expect((await fail(setPin(ids.owner, ids.s2, name('b'), weak)))?.message).toMatch(/weak pin/);
    for (const bad of ['ab', 'has space', 'a'.repeat(21), 'bad-name'])
      expect((await fail(setPin(ids.owner, ids.s2, bad, PIN)))?.message).toMatch(/bad username/);
    expect(await row(ids.s2)).toBeUndefined();
  });

  it('stores only a bcrypt hash, and the username is lower-cased and unique', async () => {
    await setPin(ids.owner, ids.s2, name('b').toUpperCase(), PIN);
    const r = await row(ids.s2);
    expect(r.username).toBe(name('b'));
    expect(r.pin_hash).toMatch(/^\$2[aby]\$10\$/);
    expect(r.pin_hash).not.toContain(PIN);
    expect(await fail(setPin(ids.owner, ids.s3, name('b'), PIN))).not.toBeNull(); // taken by s2
  });

  it('right PIN works (any letter case in the username), wrong PIN and unknown user do not', async () => {
    expect(await verify(name('b').toUpperCase(), PIN)).toEqual({ ok: true, user_id: ids.s2 });
    expect(await verify(name('b'), '246810')).toEqual({ ok: false, user_id: null });
    expect(await verify('nobody_' + tag, PIN)).toEqual({ ok: false, user_id: null });
    expect(await verify(name('b'), '')).toEqual({ ok: false, user_id: null });
  });

  it('5 wrong tries lock for 15 minutes; the right PIN fails while locked and works after; success resets the count', async () => {
    await setPin(ids.owner, ids.s3, name('c'), PIN);
    await wrong(name('c'), 4);
    expect((await row(ids.s3)).failed).toBe(4);
    expect((await verify(name('c'), PIN)).ok).toBe(true); // 4 wrong then right: not locked
    expect((await row(ids.s3)).failed).toBe(0);
    await wrong(name('c'), 5);
    const r = await row(ids.s3);
    expect(r.failed).toBe(0);
    expect(r.lockouts).toBe(1);
    const mins = (new Date(r.locked_until).getTime() - Date.now()) / 60_000;
    expect(mins).toBeGreaterThan(14);
    expect(mins).toBeLessThanOrEqual(15);
    expect((await verify(name('c'), PIN)).ok).toBe(false);
    await pool.query(`update public.user_pins set locked_until = now() - interval '1 second' where user_id = $1`, [ids.s3]);
    expect((await verify(name('c'), PIN)).ok).toBe(true);
  });

  it('a second lockout within 24 hours is a hard lock; only the owner unlocks it', async () => {
    await pool.query(`update public.user_pins set locked_until = null where user_id = $1`, [ids.s3]);
    await wrong(name('c'), 5);
    const r = await row(ids.s3);
    expect(r.hard_locked).toBe(true);
    expect(r.lockouts).toBe(2);
    await pool.query(`update public.user_pins set last_lockout_at = now() - interval '1 year' where user_id = $1`, [ids.s3]);
    expect((await verify(name('c'), PIN)).ok).toBe(false); // time does not clear a hard lock
    expect(await fail(as('authenticated', ids.s1, (c) => c.query('select public.unlock_user_pin($1)', [ids.s3])))).not.toBeNull();
    await as('authenticated', ids.owner, (c) => c.query('select public.unlock_user_pin($1)', [ids.s3]));
    expect((await verify(name('c'), PIN)).ok).toBe(true);
    expect(await row(ids.s3)).toMatchObject({ hard_locked: false, lockouts: 0, failed: 0 });
  });

  it('20 parallel wrong tries leave exactly one lockout and one log entry', async () => {
    await pool.query(`update public.user_pins set failed = 0, lockouts = 0, last_lockout_at = null, locked_until = null, hard_locked = false where user_id = $1`, [ids.s1]);
    const base = Number((await pool.query('select coalesce(max(id),0) m from public.audit_log')).rows[0].m);
    await Promise.all(Array.from({ length: 20 }, () => verify(name('a'), '246810')));
    const r = await row(ids.s1);
    expect(r.lockouts).toBe(1);
    expect(r.hard_locked).toBe(false);
    expect(r.failed).toBe(0);
    const log = (await pool.query(`select * from public.audit_log where id > $1 and action = 'pin_locked'`, [base])).rows;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ actor: ids.s1, actor_name: 'Staff One' });
  });

  it('a deactivated staff member cannot sign in, and reactivating restores it; owners cannot be switched off this way', async () => {
    await as('authenticated', ids.owner, (c) => c.query('select public.unlock_user_pin($1)', [ids.s1]));
    await as('authenticated', ids.owner, (c) => c.query('select public.set_staff_active($1, false)', [ids.s1]));
    expect((await verify(name('a'), PIN)).ok).toBe(false);
    await as('authenticated', ids.owner, (c) => c.query('select public.set_staff_active($1, true)', [ids.s1]));
    expect((await verify(name('a'), PIN)).ok).toBe(true);
    expect((await fail(as('authenticated', ids.owner, (c) => c.query('select public.set_staff_active($1, false)', [ids.other]))))?.message).toMatch(/not a staff/);
    expect((await fail(as('authenticated', ids.s1, (c) => c.query('select public.set_staff_active($1, false)', [ids.s2]))))?.message).toMatch(/not allowed/);
    const kinds = (await pool.query(`select action from public.audit_log where target_id = $1 and action like 'staff_%'`, [ids.s1])).rows.map((x) => x.action);
    expect(kinds).toEqual(expect.arrayContaining(['staff_deactivate', 'staff_reactivate']));
  });

  it('status is owner only and never returns a hash; the log never contains a PIN', async () => {
    const rows = (await as('authenticated', ids.owner, (c) => c.query('select * from public.user_pin_status()'))).rows;
    expect(rows.some((x) => x.user_id === ids.s2 && x.username === name('b'))).toBe(true);
    expect(rows.every((x) => !('pin_hash' in x))).toBe(true);
    expect(rows.some((x) => x.user_id === ids.other)).toBe(false); // staff only
    expect(await fail(as('authenticated', ids.s1, (c) => c.query('select * from public.user_pin_status()')))).not.toBeNull();
    const log = (await pool.query(`select detail::text d from public.audit_log where action like 'pin_%'`)).rows.map((x) => x.d).join('\n');
    expect(log).not.toContain(PIN);
    expect(log).not.toContain('246810');
    expect(log).toMatch(/pin_|username/);
  });

  it('setting a PIN again is logged as a reset and clears a lock', async () => {
    const base = Number((await pool.query('select coalesce(max(id),0) m from public.audit_log')).rows[0].m);
    await wrong(name('b'), 5);
    await setPin(ids.owner, ids.s2, name('b'), '905173');
    expect((await verify(name('b'), '905173')).ok).toBe(true);
    const acts = (await pool.query(`select action from public.audit_log where id > $1 and action in ('pin_set','pin_reset')`, [base])).rows.map((x) => x.action);
    expect(acts).toEqual(['pin_reset']);
  });
});
