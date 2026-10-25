# Screenshot receipt: design note and plan

## How would this work? (plain words)

After a sale (or from Sales history) the owner opens the sale page and taps **Show receipt**. The screen turns into one white, receipt-style paper: shop name, receipt number, date and time, what was bought, **every code in big numbers, one per row**, total, cash and change, and a thank-you line. The bottom menu and all buttons disappear from the paper area. The owner takes a normal phone screenshot and sends or shows it. Below the paper (so it is not in the screenshot) are **Copy receipt as text** (for pasting into Messenger/SMS) and **Done** (back to the normal page). A code voided later shows as **VOIDED** with no digits, so a stale screenshot copy cannot look usable.

It is the same page with `?receipt=1`. Nothing new is stored: the receipt is built from the sales and payment rows that already exist. No database change, no public link: it is behind login like every other page.

## Tasks

1. `lib/receipt.ts` (pure, tested first): business name constant, short receipt number, duration label, group lines by plan, total/cash/change, plain-text receipt. Test: `tests/unit/receipt.test.ts`.
2. `components/Receipt.tsx` (server, presentational) + `.receipt*` classes in `app/globals.css` (Mint tokens only, zigzag edge, compact when more than 5 codes).
3. `components/ReceiptActions.tsx` (client): Copy as text (clipboard with select-all fallback, same pattern as CopyAll) and Done (replace navigation, so Back leaves the page rather than toggling).
4. Wire both pages: `/sales/group/[id]` and `/sales/[id]` render the receipt when `?receipt=1`, and show a **Show receipt** button otherwise. `Nav` hides itself when `receipt=1`.
5. e2e (skips without creds), docs/decisions.md, README line.

## Verification

`npx tsc --noEmit`, `npm test`, `npm run build`, `npx playwright test`, OpenNext build size. Layout is checked at 390x844 with a throwaway fixture page (deleted before commit) and Playwright screenshots. The logged-in pages themselves cannot be viewed without an owner login.
