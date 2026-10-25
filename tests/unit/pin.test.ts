import { describe, expect, it } from 'vitest';
import { PIN_LENGTH, pinProblem, randomPin } from '@/lib/pin';
import { LIMITS, afterFailure, afterSuccess, isLocked, type PinState } from '@/lib/lockout';

describe('pinProblem (staff, 6 digits)', () => {
  it.each(['739418', '280615', '905173', '461829'])('accepts %s', (p) => expect(pinProblem(p, 'staff')).toBeNull());
  it.each([
    ['', 'wrong length'], ['12345', 'too short'], ['1234567', 'too long'], ['73941a', 'letters'], ['73 418', 'space'],
    ['111111', 'one repeated digit'], ['000000', 'zeros'],
    ['123456', 'ascending run'], ['234567', 'ascending run'], ['012345', 'ascending from 0'], ['654321', 'descending run'], ['987654', 'descending run'],
    ['121212', 'repeated pair'], ['123123', 'repeated triple'], ['707070', 'repeated pair'],
  ])('rejects %s (%s)', (p) => expect(pinProblem(p, 'staff')).not.toBeNull());
  it('does not mistake a normal PIN with a short run for trivial', () => {
    expect(pinProblem('123490', 'staff')).toBeNull();
    expect(pinProblem('112233', 'staff')).toBeNull();
  });
});

describe('pinProblem (owner, 8 digits)', () => {
  it('needs exactly 8 digits', () => {
    expect(pinProblem('73941852', 'owner')).toBeNull();
    expect(pinProblem('739418', 'owner')).not.toBeNull();
  });
  it('rejects trivial 8-digit patterns', () => {
    for (const p of ['11111111', '12345678', '87654321', '12121212', '12341234']) expect(pinProblem(p, 'owner')).not.toBeNull();
  });
});

describe('randomPin', () => {
  it('always makes a valid PIN of the right length (1,000 samples per role)', () => {
    for (const role of ['staff', 'owner'] as const) {
      for (let i = 0; i < 1000; i++) {
        const p = randomPin(role);
        expect(p).toHaveLength(PIN_LENGTH[role]);
        expect(pinProblem(p, role)).toBeNull();
      }
    }
  });
  it('is not constant', () => {
    expect(new Set(Array.from({ length: 20 }, () => randomPin('staff'))).size).toBeGreaterThan(10);
  });
});

describe('lockout', () => {
  const t0 = Date.parse('2026-10-25T08:00:00Z');
  const min = 60_000;
  const fresh: PinState = { failed: 0, lockouts: 0, lastLockoutAt: null, lockedUntil: null, hard: false };
  const fail = (s: PinState, role: 'staff' | 'owner', now: number, n = 1) => {
    for (let i = 0; i < n; i++) s = afterFailure(s, role, now);
    return s;
  };

  it('staff: 4 wrong tries do not lock, the 5th locks for 15 minutes', () => {
    expect(isLocked(fail(fresh, 'staff', t0, 4), t0)).toBe(false);
    const s = fail(fresh, 'staff', t0, 5);
    expect(isLocked(s, t0)).toBe(true);
    expect(isLocked(s, t0 + 15 * min - 1)).toBe(true);
    expect(isLocked(s, t0 + 15 * min)).toBe(false);
    expect(s.failed).toBe(0);
  });
  it('owner: 3 tries, 30 minutes', () => {
    expect(LIMITS.owner).toMatchObject({ tries: 3, minutes: 30 });
    expect(isLocked(fail(fresh, 'owner', t0, 2), t0)).toBe(false);
    expect(isLocked(fail(fresh, 'owner', t0, 3), t0 + 30 * min - 1)).toBe(true);
    expect(isLocked(fail(fresh, 'owner', t0, 3), t0 + 30 * min)).toBe(false);
  });
  it('a wrong try while locked changes nothing', () => {
    const locked = fail(fresh, 'staff', t0, 5);
    expect(afterFailure(locked, 'staff', t0 + min)).toEqual(locked);
  });
  it('a second lockout within 24 hours is a hard lock until the owner unlocks', () => {
    const first = fail(fresh, 'staff', t0, 5);
    const later = t0 + 16 * min;
    const second = fail(first, 'staff', later, 5);
    expect(second.hard).toBe(true);
    expect(isLocked(second, later + 365 * 24 * 60 * min)).toBe(true);
  });
  it('a second lockout after 24 hours is only a normal lockout', () => {
    const first = fail(fresh, 'staff', t0, 5);
    const second = fail(first, 'staff', t0 + 25 * 60 * min, 5);
    expect(second.hard).toBe(false);
    expect(second.lockouts).toBe(1);
  });
  it('success resets the failed count but keeps the lockout history', () => {
    const s = afterSuccess(fail({ ...fresh, lockouts: 1, lastLockoutAt: t0 }, 'staff', t0 + min, 3));
    expect(s.failed).toBe(0);
    expect(s.lockouts).toBe(1);
  });
});
