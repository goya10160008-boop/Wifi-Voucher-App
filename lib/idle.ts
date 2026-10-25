// Pure timing for the idle sign-out. Everything takes timestamps so it tests with fake clocks.
export const IDLE_MS = 15 * 60_000;
export const STAFF_IDLE_MS = 5 * 60_000;
/** Idle limit for a role: the owner keeps 15 minutes, staff get 5. */
export const idleMsFor = (role: string | null) => (role === 'staff' ? STAFF_IDLE_MS : IDLE_MS);
export const WARN_MS = 30_000;

// A clock that went backwards gives a negative elapsed time: not idle.
const elapsed = (last: number, now: number) => now - last;

export const isIdle = (last: number, now: number, limit = IDLE_MS) => elapsed(last, now) >= limit;
export const isWarning = (last: number, now: number, limit = IDLE_MS) => {
  const e = elapsed(last, now);
  return e >= limit - WARN_MS && e < limit;
};
export const secondsLeft = (last: number, now: number, limit = IDLE_MS) =>
  Math.max(0, Math.ceil((limit - elapsed(last, now)) / 1000));
