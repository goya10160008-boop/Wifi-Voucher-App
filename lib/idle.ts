// Pure timing for the idle sign-out. Everything takes timestamps so it tests with fake clocks.
export const IDLE_MS = 15 * 60_000;
export const WARN_MS = 30_000;

// A clock that went backwards gives a negative elapsed time: not idle.
const elapsed = (last: number, now: number) => now - last;

export const isIdle = (last: number, now: number) => elapsed(last, now) >= IDLE_MS;
export const isWarning = (last: number, now: number) => {
  const e = elapsed(last, now);
  return e >= IDLE_MS - WARN_MS && e < IDLE_MS;
};
export const secondsLeft = (last: number, now: number) =>
  Math.max(0, Math.ceil((IDLE_MS - elapsed(last, now)) / 1000));
