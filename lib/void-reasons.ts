// The fixed list of reasons for voiding. The database checks the same list (void_receipt, 0006); this copy drives the form.
export const REASONS = [
  { code: 'wrong_plan', label: 'Wrong plan sold' },
  { code: 'changed_mind', label: 'Guest changed their mind' },
  { code: 'sold_twice', label: 'Sold twice by mistake' },
  { code: 'code_failed', label: 'Code did not work' },
  { code: 'other', label: 'Other (type the reason)' },
  { code: 'owner_test', label: 'Owner Test', risky: true },
] as const;

export type ReasonCode = (typeof REASONS)[number]['code'];
/** Owner Test only works this long after the sale (the database enforces it too). */
export const OWNER_TEST_MINUTES = 60;

export const isReasonCode = (v: unknown): v is ReasonCode => REASONS.some((r) => r.code === v);

type Result = { ok: true; code: ReasonCode; note: string | null } | { ok: false; error: string };

/** Validates what the void form sent. `typed` is the word the owner types to confirm Owner Test. */
export function voidInput(code: unknown, note: string, typed: string, opts: { single?: boolean } = {}): Result {
  if (!isReasonCode(code)) return { ok: false, error: 'Choose a reason.' };
  if (code === 'owner_test') {
    if (opts.single) return { ok: false, error: 'Owner Test is for a whole receipt only.' };
    if (typed.trim().toUpperCase() !== 'TEST') return { ok: false, error: 'Type TEST to confirm.' };
    return { ok: true, code, note: null };
  }
  if (code === 'other') {
    const n = note.trim();
    if (n.length < 3 || n.length > 200) return { ok: false, error: 'Type the reason, 3 to 200 characters.' };
    return { ok: true, code, note: n };
  }
  return { ok: true, code, note: null };
}
