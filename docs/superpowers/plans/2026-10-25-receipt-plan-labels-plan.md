# Receipt: say which plan each code is for

## How will this work (plain words)
Today the receipt has an "Items" summary (2 x 3 Hours, 1 x 1 Day) and then one long list of codes. With mixed plans the
customer cannot tell which code is for which plan. New layout: the codes are grouped under a heading per plan, and the
heading carries the old summary line, so the Items block is gone (no information lost):

```
3 Hours (3 hours)        2 × ₱20.00   ₱40.00
  1.  564275
  2.  150216
1 Day (24 hours)         1 × ₱50.00   ₱50.00
  3.  685170
```
Codes stay the biggest thing on the paper. Numbers (1., 2., 3.) stay running across the whole receipt so they match the
sale pages and "VOIDED" lines. A voided code keeps its place under its plan heading and shows VOIDED with no digits.
"Copy receipt as text" uses the same grouping (plan heading line, then one code per line). No database change:
`plan_name` and `duration_minutes` are already saved on every sale row.

## Tasks
1. `lib/receipt.ts`: each `ReceiptLine` also carries its `codes` (same seq order). Test first (`tests/unit/receipt.test.ts`).
2. `buildReceiptText`: heading line per plan then its codes. Test first.
3. `components/Receipt.tsx` + `app/globals.css`: render headings + codes; drop the separate Items list; keep the dense mode.
4. Sale pages: single-sale page already shows plan in its details table; group page already labels each code with its plan.
   Check, no change unless a gap shows up.
5. Verify: tsc, npm test, build, playwright (logged-out), OpenNext size, screenshot of a temporary fixture (deleted before commit).
