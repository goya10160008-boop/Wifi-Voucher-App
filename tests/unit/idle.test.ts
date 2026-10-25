import { describe, expect, it } from 'vitest';
import { IDLE_MS, STAFF_IDLE_MS, WARN_MS, idleMsFor, isIdle, isWarning, secondsLeft } from '@/lib/idle';

const last = 1_000_000;
const at = (ms: number) => last + ms;

describe('idle timing', () => {
  it('uses 15 min idle and a 30 s warning', () => {
    expect(IDLE_MS).toBe(15 * 60_000);
    expect(WARN_MS).toBe(30_000);
  });
  it('is quiet before the warning window', () => {
    const now = at(IDLE_MS - WARN_MS - 1);
    expect(isWarning(last, now)).toBe(false);
    expect(isIdle(last, now)).toBe(false);
  });
  it('warns exactly when 30 s remain, until the limit', () => {
    expect(isWarning(last, at(IDLE_MS - WARN_MS))).toBe(true);
    expect(isWarning(last, at(IDLE_MS - 1))).toBe(true);
    expect(isIdle(last, at(IDLE_MS - 1))).toBe(false);
  });
  it('is idle at the limit and no longer "warning"', () => {
    expect(isIdle(last, at(IDLE_MS))).toBe(true);
    expect(isWarning(last, at(IDLE_MS))).toBe(false);
  });
  it('counts seconds left, rounded up, never negative', () => {
    expect(secondsLeft(last, at(IDLE_MS - WARN_MS))).toBe(30);
    expect(secondsLeft(last, at(IDLE_MS - 1_500))).toBe(2);
    expect(secondsLeft(last, at(IDLE_MS))).toBe(0);
    expect(secondsLeft(last, at(IDLE_MS * 5))).toBe(0);
  });
  it('treats a clock jump after phone sleep as idle at once', () => {
    expect(isIdle(last, at(3 * 60 * 60_000))).toBe(true);
  });
  it('ignores a clock that went backwards (not idle)', () => {
    expect(isIdle(last, last - 5_000)).toBe(false);
    expect(isWarning(last, last - 5_000)).toBe(false);
  });
  it('staff get 5 minutes, the owner 15', () => {
    expect(idleMsFor('staff')).toBe(5 * 60_000);
    expect(idleMsFor('owner')).toBe(IDLE_MS);
    expect(idleMsFor(null)).toBe(IDLE_MS);
    expect(isIdle(last, at(STAFF_IDLE_MS), STAFF_IDLE_MS)).toBe(true);
    expect(isIdle(last, at(STAFF_IDLE_MS), IDLE_MS)).toBe(false);
    expect(isWarning(last, at(STAFF_IDLE_MS - 1), STAFF_IDLE_MS)).toBe(true);
    expect(secondsLeft(last, at(0), STAFF_IDLE_MS)).toBe(300);
  });
});
