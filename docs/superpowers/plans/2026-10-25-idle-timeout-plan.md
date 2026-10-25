# Idle auto sign-out plan

Goal: signed-in users are signed out after 15 minutes without activity (owner and staff alike), with a 30-second warning.

Tasks
1. `lib/idle.ts` (pure: `IDLE_MS`, `WARN_MS`, `isIdle`, `isWarning`, `secondsLeft`) with unit tests first (`tests/unit/idle.test.ts`).
2. `components/IdleGuard.tsx` (client): activity listeners, shared `localStorage` timestamp, interval compare against `Date.now()`, warning dialog (`role=alertdialog`, focus on the button, `aria-live` countdown), calls `idleLogout`. Mounted in `app/(app)/layout.tsx` for users with a role only. Dialog styles are tokens/classes in `app/globals.css`.
3. `idleLogout` server action (redirects to `/login?reason=idle`); login page becomes a server component that shows a fixed notice only when `reason === 'idle'` exactly (form moved to `LoginForm.tsx`).
4. e2e: logged-out `/login?reason=idle` notice and junk-param test (runs without creds); `page.clock` fast-forward test (skipped without creds).
5. decisions.md entries, README line; verify with tsc, npm test, build, playwright, OpenNext size.

Out of scope: server-side enforcement (needs Supabase Pro inactivity timeout), per-role timeouts.
