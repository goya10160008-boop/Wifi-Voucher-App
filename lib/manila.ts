// Asia/Manila is UTC+8 with no DST, so fixed +08:00 offsets are safe.
const OFFSET_MS = 8 * 3600_000;

/** YYYY-MM-DD of the Manila calendar day containing `d`. */
export const manilaDateOf = (d: Date = new Date()) =>
  new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);

export const manilaDayStart = (date: string) => `${date}T00:00:00+08:00`;

/** Exclusive end bound: midnight starting the next Manila day. */
export function manilaDayEnd(date: string) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return manilaDayStart(next.toISOString().slice(0, 10));
}

export const manilaMonthStart = (date: string) => `${date.slice(0, 7)}-01`;
