# A&B WiFi Voucher Manager

Mobile-first PWA for A&B Boarding House (Bogo City, Cebu, PH). The owner sells WiFi vouchers for cash.
Codes are generated in TP-Link Omada and exported as PDF. The app imports the codes, hands out the next
unused code per plan atomically, and records sales. Guests never log in. Cash only for now; GCash/Maya later
(separate `payments` table already in the schema). Roles: `owner`, `staff` (limited, later).

**Status:** live on Cloudflare (https://ab-wifi-vouchers.mobile-voucher-app.workers.dev), `main` = deployed code. Built: auth, plans, import (OCR), cart sales, receipt, Mint design, idle sign-out, Home menu grid, Sales date fixes. Migrations 0001+0002 applied to the remote Supabase project. **Stage 1 (who sold, staff wording, audit log + `/logs`) is on branch `feat/stage1-log`; `supabase/migrations/0003_hardening_and_audit.sql` is NOT applied remotely yet (apply it first, then merge and deploy; `/logs` says the log is not switched on until then).** Next stages (see `docs/superpowers/plans/2026-10-25-staff-accounts-plan.md`): login/idle events, then staff PIN login, then owner PIN. Build notes: `docs/decisions.md`.
Full design: `docs/superpowers/specs/2026-10-25-voucher-manager-design.md`. Plan: `docs/superpowers/plans/2026-10-25-voucher-manager-plan.md`.

## Stack
- Next.js 16.4 (App Router) + TypeScript **5.9.3 pinned** (not TS 7) + Tailwind 4 (CSS-first, no tailwind.config)
- Supabase: Postgres + Auth + RLS (`@supabase/ssr`, publishable key, `getClaims()`)
- Hosting: Cloudflare Workers via `@opennextjs/cloudflare` (Node runtime; NOT Pages / next-on-pages)
- PDF text: `pdfjs-dist`, browser only; Omada PDFs have no text layer, so fallback is `tesseract.js` OCR (digits only, assets self-hosted via `scripts/copy-ocr.mjs`). QR: `qrcode.react`
- Tests: vitest (unit + DB concurrency), Playwright (E2E)
- Pin all dependency versions exactly; commit the lockfile.

## Folder structure (target)
```
app/(auth)/login        app/(app)/{page,sell,sales,plans,import,settings}
app/manifest.ts         components/VoucherCode.tsx   app/(app)/logs (owner)
lib/{supabase,auth,money,manila,parse-codes,pdf-text,rpc-errors}
proxy.ts                supabase/migrations/   supabase/tests/
tests/unit/             e2e/                   samples/   docs/
```

## Commands (fill in exact scripts at scaffold; keep this list current)
- Dev: `npm run dev`
- Unit tests: `npm test`
- E2E (both viewports): `npx playwright test`
- E2E phone only: `npx playwright test --project=phone`; desktop only: `--project=desktop`
- Build: `npm run build`
- Cloudflare preview: `npm run preview`
- Deploy: `npm run deploy` (**ask the owner first, always**)
- Local DB: `supabase start` (needs Docker), `supabase db reset`

## Conventions
- Money is integer centavos everywhere. Format only at the UI edge, `en-PH`, currency PHP (₱).
- Timestamps are `timestamptz` (UTC). Day/month boundaries are Asia/Manila (`+08:00`, no DST), computed in SQL or `lib/manila.ts`.
- All writes to vouchers/sales/payments go through `SECURITY DEFINER` RPCs (`search_path=''`, role check inside). No direct write grants.
- Every Server Action: `requireRole()`, validate inputs, call one RPC/query. `proxy.ts` only refreshes the session; it is not the security gate.
- Void = status change, never delete. Voided codes are `burned`, never resold.
- Parsing PDFs happens in the browser; the server only receives `string[]`.
- TDD: failing test first. Small commits, one per task. English UI. Big touch targets (min 48px), usable one-handed.
- Agent status reports may be caveman style. Code, docs, UI text and messages to the owner are normal prose.

## Design conventions
- Mint tokens and shared classes live only in `app/globals.css`; no per-page colors. Animations are pure CSS and must respect `prefers-reduced-motion`. Submit buttons set `aria-busy={pending}`. New (app) pages get a `loading.tsx` if they fetch slowly.

## Rules
- Never commit secrets. Use `.env.local` (and `.dev.vars` for Workers); keep `.env.example` current. The Supabase secret key is server-only, never `NEXT_PUBLIC_*`.
- Do not deploy or create paid resources without asking the owner. For accounts/clicks (Supabase, Cloudflare), give exact step-by-step instructions.
- Sample Omada PDF lives in `samples/`. Do not hardcode the code regex before reading it. If missing, ask the owner.
- Never claim something works without running it (verification-before-completion).
- Log non-obvious decisions in `docs/decisions.md`. Ask the owner only when truly blocked.
- Update this file when stack, structure, commands or rules change. Keep it under 150 lines.
