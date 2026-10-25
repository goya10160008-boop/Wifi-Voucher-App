# Multi-voucher (cart) sales: plan

Goal: one sale can hold up to 10 vouchers across one or more plans (e.g. 2x 3 Hours + 1x 1 Day), all-or-nothing, with one set of cash/change, each code still its own sale row (void and totals unchanged).

Constraints: nothing applied to the remote Supabase project, no deploy. DB tested on local embedded Postgres (decision 16). Single sale behaviour (`sell_voucher`) stays untouched.

| # | Task | Files | Verify |
|---|------|-------|--------|
| 1 | Pure cart logic (totals, 10 cap, cash chips, change) | `lib/cart.ts`, `tests/unit/cart.test.ts` | vitest red then green |
| 2 | Error messages for new codes + OUT_OF_STOCK detail | `lib/rpc-errors.ts`, `tests/unit/rpc-errors.test.ts` | vitest |
| 3 | Migration 0002: `sales.group_id/seq`, `sell_cart()` | `supabase/migrations/0002_sell_cart.sql`, `lib/supabase/database.types.ts` | applies on local PG after 0001 |
| 4 | DB tests: group of 3, mixed, all-or-nothing, parallel carts, same-key x5, KEY_REUSED, max 10, cash, void burns one | `supabase/tests/cart.test.ts` | 5 local runs green; mutation check |
| 5 | Server action `sell` on `sell_cart` | `app/(app)/sell/actions.ts` | tsc |
| 6 | Cart UI on `/sell` (steppers, total, chips, change) | `app/(app)/sell/SellForm.tsx`, `page.tsx`, `globals.css` (`.stepper`) | tsc, build |
| 7 | Group page with every code, Copy, Copy all, cash summary | `app/(app)/sales/group/[id]/page.tsx`, `components/CopyAll.tsx` | tsc, build |
| 8 | Sales list grouping, CSV group column | `app/(app)/sales/page.tsx`, `sales/export/route.ts` | tsc, build |
| 9 | e2e update, docs (README, CLAUDE.md, decisions) | `e2e/voucher-flow.spec.ts`, docs | playwright logged-out green |
| 10 | Full verification + OpenNext size | commands | outputs shown in report |

Design rulings are logged in `docs/decisions.md` (entries 22+).
