// record_event (0004) against a LOCAL Postgres, as the real `authenticated` / `anon` roles. Same setup as audit.test.ts
// (also apply 0004). Skipped when SUPABASE_TEST_DB_URL is unset. Never point it at production: audit rows cannot be deleted.
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const url = process.env.SUPABASE_TEST_DB_URL;

describe.skipIf(!url)('record_event (0004)', () => {
  const pool = new Pool({ connectionString: url, max: 5 });
  const tag = randomUUID().slice(0, 8);
  const ids = { owner: randomUUID(), staff: randomUUID(), off: randomUUID(), stranger: randomUUID() };
  const people = Object.values(ids);

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
  const record = (sub: string, action: string, detail: unknown = {}) =>
    asRole('authenticated', sub, (c) => c.query('select public.record_event($1, $2::jsonb)', [action, JSON.stringify(detail)]));
  const fail = async (p: Promise<unknown>) => (await p.then(() => null, (e) => e)) as { message: string } | null;
  const count = async (actor: string, action?: string) =>
    Number((await pool.query(`select count(*) n from public.audit_log where actor = $1 and ($2::text is null or action = $2)`, [actor, action ?? null])).rows[0].n);

  beforeAll(async () => {
    await pool.query('insert into auth.users (id, email) select x, x || $2 from unnest($1::uuid[]) x', [people, `@${tag}.invalid`]);
    await pool.query(
      `insert into public.profiles (user_id, role, display_name, active) values
        ($1, 'owner', 'Owner Test', true), ($2, 'staff', 'Staff A', true), ($3, 'staff', 'Gone', false)`,
      [ids.owner, ids.staff, ids.off]);
  });
  afterAll(async () => {
    await pool.query('delete from public.profiles where user_id = any($1)', [people]);
    await pool.query('delete from auth.users where id = any($1)', [people]);
    await pool.end();
  });

  it('writes the event with the signed-in name, and only the allowed names', async () => {
    await record(ids.staff, 'login', { via: 'password' });
    await record(ids.staff, 'logout');
    await record(ids.owner, 'csv_export', { from: '2026-10-01', to: '2026-10-25' });
    const row = (await pool.query(`select * from public.audit_log where actor = $1 and action = 'login'`, [ids.staff])).rows[0];
    expect(row.actor_name).toBe('Staff A');
    expect(row.detail).toEqual({ via: 'password' });
    expect(await count(ids.owner, 'csv_export')).toBe(1);
    expect((await fail(record(ids.staff, 'sale')))?.message).toMatch(/unknown event/);
    expect((await fail(record(ids.staff, 'void')))?.message).toMatch(/unknown event/);
  });

  it('is denied to anon, to users with no profile and to deactivated users', async () => {
    expect(await fail(asRole('anon', null, (c) => c.query(`select public.record_event('login', '{}')`)))).not.toBeNull();
    expect((await fail(record(ids.stranger, 'login')))?.message).toMatch(/not allowed/);
    expect((await fail(record(ids.off, 'login')))?.message).toMatch(/not allowed/);
    expect(await count(ids.off)).toBe(0);
  });

  it('rejects oversized detail', async () => {
    expect((await fail(record(ids.staff, 'login', { x: 'a'.repeat(400) })))?.message).toMatch(/too large/);
  });

  it('keeps at most 60 events an hour per person and drops the rest quietly', async () => {
    const before = await count(ids.owner);
    for (let i = 0; i < 65; i++) await record(ids.owner, 'logout');
    const sessionEvents = Number((await pool.query(
      `select count(*) n from public.audit_log where actor = $1 and action in ('login','logout','idle_signout','csv_export')`, [ids.owner])).rows[0].n);
    expect(sessionEvents).toBe(60);
    expect(before).toBeLessThan(60);
  });
});
