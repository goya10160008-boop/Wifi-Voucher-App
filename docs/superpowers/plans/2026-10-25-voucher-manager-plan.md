# A&B WiFi Voucher Manager: Implementation Plan

Spec: `docs/superpowers/specs/2026-10-25-voucher-manager-design.md` (schema, RLS, RPCs, routes, folders).
Method: TDD per task, one git commit per task. Model per task: **O**pus / **S**onnet / **H**aiku.
Each task ends with a verification run (tests or a build). No "done" claim without output.

## Phase A: Foundation
| # | Task | Model | Done when |
|---|------|-------|-----------|
| A1 | `git init`, Next 16.4 + TS 5.9.3 (pinned) + Tailwind 4 scaffold, `.env.example`, `.gitignore`, vitest + Playwright config (projects `phone` Pixel 7, `desktop`) | H | `npm run build` and empty `npm test` pass |
| A2 | `lib/money.ts`, `lib/manila.ts` (unit tests first) | S | vitest green |
| A3 | `supabase/migrations/0001_init.sql` from spec sections 2-4; local Supabase (`supabase start`, needs Docker) | S | migration applies cleanly |
| A4 | SQL/concurrency tests: 20 parallel sells on 10 codes, same-key retry, void burns code, import counts, Manila day buckets | S | vitest green against local DB |
| A5 | **Opus review of migration** (RLS, grants, search_path, SECURITY DEFINER) before building on it | O | findings fixed |

## Phase B: Auth shell
| # | Task | Model |
|---|------|-------|
| B1 | `lib/supabase/server.ts`, `lib/auth.ts` (`requireUser`, `requireRole` via `getClaims` + profiles), `proxy.ts` session refresh | S |
| B2 | `/login` page + action, `(app)/layout.tsx` guard, bottom nav by role, "No access" state | S |
| B3 | PWA: `app/manifest.ts`, icons (192, 512, maskable, apple-icon), iOS meta, install hint | H |

## Phase C: Features (each: unit/E2E test first)
| # | Task | Model |
|---|------|-------|
| C1 | Plans: list/create/edit/archive | S |
| C2 | `lib/parse-codes.ts` against real Omada sample text (**blocked on `samples/` PDF**), `lib/pdf-text.ts` (client pdfjs-dist) | S |
| C3 | `/import`: PDF or paste, preview (count + samples, untick), plan picker, result counts, empty-text error | S |
| C4 | `/sell` + `sell` action + `VoucherCode` (big code, Copy with fallback, QR) | S |
| C5 | `/sales` history (date/plan filters, daily/monthly totals), `/sales/[id]`, void with reason | S |
| C6 | Dashboard `/`: sell buttons with stock, low-stock banner, today/month totals; `/settings` threshold | S |

## Phase D: Verification and deploy prep
| # | Task | Model |
|---|------|-------|
| D1 | Playwright E2E on phone + desktop: login, create plan, import PDF, sell, copy, void, totals, low-stock; two-simultaneous-sales test | S |
| D2 | OpenNext Cloudflare config; run `preview`; check proxy gate (`x-proxy` header) and fallbacks from spec section 7 | S |
| D3 | **Opus code review**: security, correctness, mobile usability. Fix findings | O |
| D4 | README (local setup, env vars, Supabase setup, Cloudflare deploy for a beginner), user guide, `docs/decisions.md`, final `CLAUDE.md` update | H |

Deploy itself is **never run without your explicit OK**.

## What I need from you, and when
- Before C2: sample Omada voucher PDF in `samples/`.
- Before A3 local DB tests: Docker Desktop installed (I'll give steps). Alternative: test against a free Supabase cloud project.
- Before D2/deploy: free Supabase project and Cloudflare account. I'll give exact click-by-click steps then.
