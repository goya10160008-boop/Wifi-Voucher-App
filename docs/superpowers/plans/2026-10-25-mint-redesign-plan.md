# Mint redesign: plan

Spec: user chose style 5 "Mint" from the sample canvas (DM Sans + DM Mono, green #166534, soft cards, pill buttons, floating nav, 2-col plan tiles). Branch `feat/app`. One commit per task. Each task ends with `npx tsc --noEmit` (+ `npm test` / `npm run build` where noted).

| # | Task | Files | Verification |
|---|------|-------|--------------|
| M1 | Tokens + shared classes + fonts: `@theme` colors/radii, `.btn`, `.btn-ghost`, `.btn-danger`, `.field`, `.card`, `.alert`, `.tile`, keyframes, `prefers-reduced-motion` kill-switch; `next/font` DM Sans/DM Mono | `app/globals.css`, `app/layout.tsx` | tsc, build |
| M2 | Nav with inline SVG icons + sliding active pill (client, `usePathname`), floating style | `components/Nav.tsx` | tsc, build |
| M3 | Restyle every screen with the shared classes (login, no-access, Home incl. 2-col tiles, Sell, sale detail, VoucherCode, Sales, Plans, Import, Settings) | `app/**`, `components/**` | tsc, build, grep for leftover `gray-`/`blue-`/`red-` utilities |
| M4 | Animations: press feedback, code card slide-up, Copied pop, page fade (`template.tsx`), alert slide-in, button spinner via `[aria-busy]`/pending, shimmer `loading.tsx` for Home and Sales | `app/globals.css`, `app/(app)/template.tsx`, `loading.tsx` files, client forms | build; reduced-motion block present |
| M5 | Logo: A&B WiFi mark in Mint green, dependency-free PNG generator, regenerate icons (maskable safe zone) | `scripts/make-icons.mjs`, `public/icons/*` | view PNGs |
| M6 | `supabase/tests/concurrency.test.ts` (20 parallel sells on 10 codes, same key x5), gated on `SUPABASE_TEST_DB_URL`, pinned `pg` | test, `vitest.config.ts`, `package.json` | `npm test` skips cleanly |
| M7 | Docs: decisions, README, CLAUDE.md | docs | read-through |
| M8 | Verify: tsc, `npm test`, `npm run build`, `npx playwright test`, `/login` screenshots at phone + desktop, Worker size via `npm run preview` build | n/a | outputs recorded in the final report |

Constraints: pure CSS animation, disabled under reduced motion; 48px targets; 4.5:1 contrast; no deploy; no writes to the remote DB.
