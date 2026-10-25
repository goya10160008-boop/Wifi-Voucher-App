# Home menu grid + compact Sales dates

Branch `feat/home-menu-sales-dates`. No DB change, no new dependency.

## How it works (plain words)
- **Home:** the plan boxes become a 3-column menu. Each box shows a big duration (`3h`, `10h`), the plan name small, the price in a green pill and a stock badge on top ("40 left"). Low stock shows a warning icon + "4 left"; 0 stock shows a "Sold out" badge and the box is greyed and not tappable. Tapping a box still opens `/sell?plan=<id>`.
- **Sales:** the filter becomes compact: quick chips (Today, 7 days, This month, Last month) that are plain links, plus "Custom dates" (two date fields side by side, under a fold). Row times become short Manila text like `Oct 25 · 3:42 PM`, `Today 3:42 PM`, `Yesterday 9:05 AM`.

## Tasks
1. `lib/duration.ts` `durationLabel(minutes)` with tests first. Rule: <60 min `Nm`; whole hours <48h `Nh`; mixed `Nh Mm`; exact multiples of 24h at >=48h `Nd`.
2. Home menu grid (`app/(app)/page.tsx`, shared classes in `app/globals.css`, `loading.tsx` skeleton).
3. `lib/short-time.ts` `shortManilaTime(iso, now)` with tests first (Manila TZ, midnight boundaries, 12h clock).
4. Sales: preset chips (`lib/sales-range.ts` pure presets, tested), compact custom dates, short row times. Sale detail page uses the short format too; the receipt keeps its full date.
5. Verify: tsc, npm test, build, playwright, OpenNext size, fixture screenshots at 390x844 and 360x740 (fixture deleted before commit).
