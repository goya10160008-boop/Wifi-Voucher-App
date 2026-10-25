'use client';
import { useEffect, useRef, useState } from 'react';
import { idleLogout } from '@/app/(auth)/login/actions';
import { IDLE_MS, isIdle, isWarning, secondsLeft } from '@/lib/idle';

const KEY = 'idle:lastActive';
const ACTIVITY = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const;

const stored = () => {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } // storage may be blocked
};

// Browser-side convenience, not a security boundary (see docs/decisions.md).
export function IdleGuard({ limit = IDLE_MS }: { limit?: number }) {
  const last = useRef(Date.now());
  const out = useRef(false);
  const warn = useRef(false);
  const api = useRef({ check: () => {}, stay: () => {} });
  const btn = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState<number | null>(null); // null = no warning showing

  useEffect(() => {
    const signOut = () => {
      if (out.current) return;
      out.current = true;
      void idleLogout();
    };
    // Compare against the real clock every time: timers freeze when a phone sleeps.
    const check = () => {
      const now = Date.now();
      last.current = Math.max(last.current, stored()); // another tab may have been active
      if (isIdle(last.current, now, limit)) return signOut();
      warn.current = isWarning(last.current, now, limit);
      setLeft(warn.current ? secondsLeft(last.current, now, limit) : null);
    };
    const stay = () => {
      const now = Date.now();
      if (isIdle(last.current, now, limit)) return signOut(); // too late to rescue the session
      last.current = now;
      warn.current = false;
      try { localStorage.setItem(KEY, String(now)); } catch {}
      setLeft(null);
    };
    // While the warning shows, only its button counts, so a tap cannot fall through to the page below.
    const onActivity = () => {
      if (warn.current) return;
      if (Date.now() - last.current >= 1000) stay(); // throttle scroll noise
      else check();
    };
    const onStorage = (e: StorageEvent) => e.key === KEY && check();
    const onVisible = () => document.visibilityState === 'visible' && check();

    api.current = { check, stay };
    try { localStorage.setItem(KEY, String(last.current)); } catch {}
    ACTIVITY.forEach((t) => addEventListener(t, onActivity, { passive: true, capture: true }));
    addEventListener('storage', onStorage);
    addEventListener('focus', check);
    addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => {
      ACTIVITY.forEach((t) => removeEventListener(t, onActivity, { capture: true }));
      removeEventListener('storage', onStorage);
      removeEventListener('focus', check);
      removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [limit]);

  // Tick every second while the warning shows, rarely otherwise.
  const warning = left !== null;
  useEffect(() => {
    const t = setInterval(() => api.current.check(), warning ? 1000 : 15000);
    return () => clearInterval(t);
  }, [warning]);
  useEffect(() => { if (warning) btn.current?.focus(); }, [warning]);

  if (left === null) return null;
  // Spoken in 10 s steps so screen readers are not read a number every second.
  const spoken = Math.max(10, Math.ceil(left / 10) * 10);
  return (
    <div className="idle-scrim">
      <div role="alertdialog" aria-modal="true" aria-labelledby="idle-t" aria-describedby="idle-d" className="idle-dialog card p-6">
        <h2 id="idle-t" className="h1">Still there?</h2>
        <p id="idle-d" aria-live="polite" className="text-mute">Signing out in about {spoken} seconds because the app was idle.</p>
        <p aria-hidden="true" className="idle-count">{left}s</p>
        <button ref={btn} className="btn" onClick={() => api.current.stay()}>Stay signed in</button>
      </div>
    </div>
  );
}
