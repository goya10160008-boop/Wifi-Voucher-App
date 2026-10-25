import { describe, expect, it } from 'vitest';
import { ACTION_GROUPS, actionsFor, describeEvent, eventSub, summarizeByPerson, type AuditRow } from '@/lib/audit';
import { nameMap } from '@/lib/seller';

const row = (action: string, detail: Record<string, unknown>, actor_name: string | null = 'Maria'): AuditRow => ({
  id: 1, at: '2026-10-25T07:42:00Z', actor: actor_name ? 'u1' : null, actor_name, action, target_type: null, target_id: null, detail: detail as AuditRow['detail'],
});

describe('describeEvent', () => {
  it('sale: count and total, singular and plural', () => {
    expect(describeEvent(row('sale', { count: 3, total_centavos: 6000 }))).toBe('Maria sold 3 vouchers · ₱60.00');
    expect(describeEvent(row('sale', { count: 1, total_centavos: 2000 }))).toBe('Maria sold 1 voucher · ₱20.00');
  });
  it('void: masked code and reason', () => {
    expect(describeEvent(row('void', { code: '***275', reason: 'wrong plan' }, 'Owner'))).toBe('Owner voided sale ***275: wrong plan');
  });
  it('import: count and plan', () => {
    expect(describeEvent(row('import', { count: 56, plan: '3HRS WIFI' }, 'Owner'))).toBe('Owner imported 56 codes into 3HRS WIFI');
    expect(describeEvent(row('import', { count: 1, plan: '3HRS WIFI' }, 'Owner'))).toBe('Owner imported 1 code into 3HRS WIFI');
  });
  it('plans: create, price change, several changes, archive, restore', () => {
    expect(describeEvent(row('plan_create', { name: '3HRS WIFI', minutes: 180, price_centavos: 1000 }, 'Owner'))).toBe('Owner created plan 3HRS WIFI (3h · ₱10.00)');
    expect(describeEvent(row('plan_update', { name: '3HRS WIFI', changes: { price_centavos: { from: 1000, to: 1200 } } }, 'Owner'))).toBe('Owner changed plan 3HRS WIFI price ₱10.00 → ₱12.00');
    expect(describeEvent(row('plan_update', { name: 'New', changes: { name: { from: 'Old', to: 'New' }, minutes: { from: 60, to: 120 } } }, 'Owner')))
      .toBe('Owner changed plan New name Old → New, length 1h → 2h');
    expect(describeEvent(row('plan_archive', { name: '1 Day' }, 'Owner'))).toBe('Owner archived plan 1 Day');
    expect(describeEvent(row('plan_restore', { name: '1 Day' }, 'Owner'))).toBe('Owner restored plan 1 Day');
  });
  it('settings', () => {
    expect(describeEvent(row('settings_update', { from: 10, to: 15 }, 'Owner'))).toBe('Owner changed the low-stock threshold 10 → 15');
  });
  it('staff and a change made in the database dashboard (no actor)', () => {
    const dash = null;
    expect(describeEvent(row('staff_add', { name: 'Maria', role: 'staff' }, dash))).toBe('Database admin added staff Maria');
    expect(describeEvent(row('staff_deactivate', { name: 'Maria', role: 'staff' }, 'Owner'))).toBe('Owner deactivated staff Maria');
    expect(describeEvent(row('staff_reactivate', { name: 'Maria', role: 'staff' }, 'Owner'))).toBe('Owner reactivated staff Maria');
    expect(describeEvent(row('role_change', { name: 'Maria', from: 'staff', to: 'owner' }, 'Owner'))).toBe('Owner changed Maria from staff to owner');
  });
  it('never throws on missing or odd detail, and falls back for unknown actions', () => {
    expect(describeEvent(row('sale', {}))).toBe('Maria sold some vouchers');
    expect(describeEvent(row('import', {}, 'Owner'))).toBe('Owner imported codes');
    expect(describeEvent(row('staff_add', {}, 'Owner'))).toBe('Owner added staff');
    expect(describeEvent(row('something_new', {}))).toBe('Maria: something_new');
    expect(describeEvent({ ...row('sale', {}), detail: null as never })).toBe('Maria sold some vouchers');
    expect(describeEvent({ ...row('sale', {}), actor_name: null, actor: 'u1' })).toBe('Someone sold some vouchers');
  });
});

describe('eventSub', () => {
  it('lists plans of a sale and the plan of a void', () => {
    expect(eventSub(row('sale', { count: 3, total_centavos: 6000, plans: [{ plan: '3HRS WIFI', qty: 2 }, { plan: '1HRS WIFI', qty: 1 }] }))).toBe('2 × 3HRS WIFI, 1 × 1HRS WIFI');
    expect(eventSub(row('void', { code: '***275', plan: '3HRS WIFI', price_centavos: 1000 }))).toBe('3HRS WIFI · ₱10.00');
    expect(eventSub(row('settings_update', { from: 1, to: 2 }))).toBeNull();
  });
});

describe('action groups', () => {
  it('maps a group key to its actions, and unknown or empty to everything', () => {
    expect(actionsFor('plans')).toEqual(['plan_create', 'plan_update', 'plan_archive', 'plan_restore']);
    expect(actionsFor('sale')).toEqual(['sale']);
    expect(actionsFor('staff')).toEqual(['staff_add', 'staff_deactivate', 'staff_reactivate', 'role_change']);
    expect(actionsFor(undefined)).toBeUndefined();
    expect(actionsFor('<script>')).toBeUndefined();
    expect(ACTION_GROUPS.map((g) => g.key)).toEqual(['sale', 'void', 'import', 'plans', 'settings', 'staff']);
  });
});

describe('summarizeByPerson', () => {
  const names = nameMap([{ user_id: 'u1', display_name: 'Maria' }, { user_id: 'u2', display_name: 'Ben' }]);
  it('counts completed vouchers and pesos per seller, biggest first, ignoring voids', () => {
    const out = summarizeByPerson([
      { sold_by: 'u1', price_centavos: 2000, status: 'completed' },
      { sold_by: 'u1', price_centavos: 1000, status: 'completed' },
      { sold_by: 'u1', price_centavos: 5000, status: 'voided' },
      { sold_by: 'u2', price_centavos: 5000, status: 'completed' },
      { sold_by: 'u3', price_centavos: 500, status: 'completed' },
    ], names);
    expect(out).toEqual([
      { id: 'u2', name: 'Ben', vouchers: 1, total: 5000 },
      { id: 'u1', name: 'Maria', vouchers: 2, total: 3000 },
      { id: 'u3', name: 'User u3', vouchers: 1, total: 500 },
    ]);
  });
  it('is empty with no sales', () => {
    expect(summarizeByPerson([], names)).toEqual([]);
  });
});
