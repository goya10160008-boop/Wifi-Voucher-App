// PIN lockout rules as a pure function. The SQL function user_pin_verify (0005) does the same under a row lock;
// these are the test vectors for it. Timestamps are epoch milliseconds.
export type PinState = { failed: number; lockouts: number; lastLockoutAt: number | null; lockedUntil: number | null; hard: boolean };

export const LIMITS = { staff: { tries: 5, minutes: 15 }, owner: { tries: 3, minutes: 30 } } as const;
const DAY = 24 * 60 * 60_000;

export const isLocked = (s: PinState, now: number) => s.hard || (s.lockedUntil !== null && now < s.lockedUntil);

export function afterFailure(s: PinState, role: 'staff' | 'owner', now: number): PinState {
  if (isLocked(s, now)) return s; // typing while locked neither counts nor extends
  const failed = s.failed + 1;
  const { tries, minutes } = LIMITS[role];
  if (failed < tries) return { ...s, failed };
  const again = s.lastLockoutAt !== null && now - s.lastLockoutAt < DAY; // second lockout within 24 hours
  return {
    failed: 0, lockouts: again ? s.lockouts + 1 : 1, lastLockoutAt: now,
    hard: again, lockedUntil: again ? null : now + minutes * 60_000,
  };
}

export const afterSuccess = (s: PinState): PinState => ({ ...s, failed: 0 });
