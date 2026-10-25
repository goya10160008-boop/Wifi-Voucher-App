import { describe, expect, it } from 'vitest';
import { OWNER_TEST_MINUTES, REASONS, isReasonCode, voidInput } from '@/lib/void-reasons';

describe('void reasons', () => {
  it('has the fixed list, Owner Test last of the normal ones and marked risky', () => {
    expect(REASONS.map((r) => r.code)).toEqual(['wrong_plan', 'changed_mind', 'sold_twice', 'code_failed', 'other', 'owner_test']);
    expect(REASONS.find((r) => r.code === 'owner_test')).toMatchObject({ label: 'Owner Test', risky: true });
    expect(OWNER_TEST_MINUTES).toBe(60);
  });
  it('recognises only codes from the list', () => {
    expect(isReasonCode('owner_test')).toBe(true);
    expect(isReasonCode('because')).toBe(false);
    expect(isReasonCode(undefined)).toBe(false);
  });
  it('validates a whole receipt void: Other needs a note, Owner Test needs the typed word', () => {
    expect(voidInput('wrong_plan', '', '')).toEqual({ ok: true, code: 'wrong_plan', note: null });
    expect(voidInput('other', '  Guest left  ', '')).toEqual({ ok: true, code: 'other', note: 'Guest left' });
    expect(voidInput('other', 'ab', '')).toMatchObject({ ok: false });
    expect(voidInput('other', 'x'.repeat(201), '')).toMatchObject({ ok: false });
    expect(voidInput('owner_test', '', 'TEST')).toEqual({ ok: true, code: 'owner_test', note: null });
    expect(voidInput('owner_test', '', 'test')).toEqual({ ok: true, code: 'owner_test', note: null }); // not case sensitive
    expect(voidInput('owner_test', '', '')).toMatchObject({ ok: false });
    expect(voidInput('owner_test', '', 'tset')).toMatchObject({ ok: false });
    expect(voidInput('nope', '', '')).toMatchObject({ ok: false });
  });
  it('one-code void never allows Owner Test', () => {
    expect(voidInput('owner_test', '', 'TEST', { single: true })).toMatchObject({ ok: false });
    expect(voidInput('code_failed', '', '', { single: true })).toEqual({ ok: true, code: 'code_failed', note: null });
  });
});
