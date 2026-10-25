// PIN rules. The database function set_user_pin enforces the same rules (0005); this copy gives the form instant feedback
// and generates random PINs. Keep both in step.
export type PinRole = 'staff' | 'owner';
export const PIN_LENGTH: Record<PinRole, number> = { staff: 6, owner: 8 };

/** Why a PIN is not allowed, or null if it is fine. */
export function pinProblem(pin: string, role: PinRole): string | null {
  const n = PIN_LENGTH[role];
  if (!/^\d+$/.test(pin) || pin.length !== n) return `Use exactly ${n} digits.`;
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((x, i) => x - d[i]);
  if (steps.every((s) => s === 0)) return 'Do not repeat one digit.';
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'Do not use a straight run like 123456.';
  // repeated block: 121212, 123123 (a block length that divides the PIN)
  for (let p = 2; p <= n / 2; p++) {
    if (n % p === 0 && pin === pin.slice(0, p).repeat(n / p)) return 'Do not repeat a short block like 121212.';
  }
  return null;
}

/** A random valid PIN (crypto randomness; rejection sampling so every digit is equally likely). */
export function randomPin(role: PinRole): string {
  const n = PIN_LENGTH[role];
  for (;;) {
    let pin = '';
    while (pin.length < n) {
      const [b] = crypto.getRandomValues(new Uint8Array(1));
      if (b < 250) pin += b % 10;
    }
    if (!pinProblem(pin, role)) return pin;
  }
}
