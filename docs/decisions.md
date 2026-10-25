# Decisions

The 20 design decisions are in `docs/superpowers/specs/2026-10-25-voucher-manager-design.md` section 8. This file logs decisions made while building.

## 2026-10-25

1. **Omada PDFs have no text layer.** The sample (`samples/3HRS_10202026.pdf`) is a browser "print to PDF" whose glyphs are outlined vector paths, so `pdfjs-dist` `getTextContent()` returns nothing. `lib/pdf-text.ts` tries the text layer first, then renders each page and runs OCR (`tesseract.js`, digits only, 2x scale). On the sample it read all 56 codes correctly. The preview/untick step stays the safety net. Paste/CSV also works.
2. **OCR assets are self-hosted.** `scripts/copy-ocr.mjs` (runs on `predev` and `prebuild`) copies the tesseract worker, the three `-lstm` core builds, `eng.traineddata.gz` and the pdf.js worker into `public/` (git-ignored). No CDN at runtime. They are static assets, so they do not count toward the 3 MiB Worker limit.
3. **Code format:** `parseCodes` accepts only 6 to 10 digit numeric tokens (confirmed from the sample: 6 digits). The DB regex stays wider (`[A-Za-z0-9-]{4,32}`). If Omada ever issues alphanumeric codes, widen `lib/parse-codes.ts` and add a fixture.
4. **No real-PDF text fixture.** The spec asked for a parse test on real Omada PDF text. There is no text, and the sample holds real unsold codes (git-ignored). `tests/unit/parse-codes.test.ts` uses synthetic OCR-shaped text. The real sample is covered by the Playwright test (needs login).
5. **Hours, not minutes, in the plan form.** Stored as `duration_minutes`. Fractions work (0.5 h = 30 min).
6. **Icons are generated** by `scripts/make-icons.mjs` (see decision 15 for the current A&B mark).
7. **Local DB tests not run.** No Docker on the dev machine. The RPC logic was checked on the remote project inside a transaction that always rolls back (FIFO, idempotent retry, insufficient cash, out of stock, import counts, void burns code, Manila 23:59/00:01 buckets all passed). **Not tested:** true parallel `SKIP LOCKED` (needs two connections). Test it before relying on two sellers at once.
8. **Worker size:** about 2.47 MiB gzipped on 2026-10-25 against the 3 MiB free limit. Watch it when adding dependencies. Server code must not import `pdfjs-dist`, `tesseract.js` or `qrcode.react`.
9. **`proxy.ts` works under OpenNext** (`x-proxy: 1` seen in `npm run preview`), so no `middleware.ts` fallback is needed.
10. **Generated DB types** live in `lib/supabase/database.types.ts` (hand-trimmed from the generator). Regenerate after every migration.

## 2026-10-25: Mint redesign

11. **Design = "Mint"** (chosen by the owner from 5 samples). All colors, radii, shadows and fonts are tokens in `app/globals.css` (`@theme`). Pages use the shared classes (`.btn`, `.btn-ghost`, `.btn-danger`, `.field`, `.card`, `.alert-*`, `.tile`, `.pick`, `.chip`, `.row-link`, `.skeleton`); do not add per-page colors. Only two literal colors remain, both unavoidable: `themeColor` in `app/layout.tsx` and the QR `fgColor` in `components/VoucherCode.tsx` (keep them equal to `--color-pri` / `--color-ink`).
12. **Fonts** DM Sans + DM Mono via `next/font/google`: downloaded and self-hosted at build time, no font CDN at runtime. The build needs internet once.
13. **Animations are pure CSS** (keyframes in `globals.css`): press scale on buttons/tiles, `.code-card` slide-up, `.pop` for "Copied", `app/(app)/template.tsx` page fade (a template remounts per navigation), `.alert` slide-in, `.btn[aria-busy=true]` spinner (set `aria-busy={pending}` on submit buttons), nav pill slide (`--n`/`--i` CSS vars), `.skeleton` shimmer via `loading.tsx` (`(app)/loading.tsx` generic, `sales/loading.tsx`). A `prefers-reduced-motion` block at the end of the file shortens all of them to ~0. No animation library.
14. **Nav** is a client component (`usePathname`) so the active pill can slide between routes. Icons are inline stroke SVGs, decorative (`aria-hidden`); the text label names the link.
15. **Logo** drawn by `scripts/make-icons.mjs` (white WiFi arcs + "A&B" pixel text on `#166534`, 3x3 supersampling). Maskable icon keeps the mark inside the central 60%. Rerun the script after changing it.
16. **Concurrency test** `supabase/tests/concurrency.test.ts` (20 parallel sells on 10 codes, 5 parallel same-key calls) needs a LOCAL DB: `SUPABASE_TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test`. Skipped when unset. It inserts and deletes rows with a throwaway owner, so never point it at the production project. **Not run yet** (no Docker here).
17. **Worker size** after the redesign: 2,614,752 bytes gzipped (about 2.49 MiB of the 3 MiB free limit).
18. **Not visually reviewed:** the logged-in screens (Home, Sell, Sales, Plans, Import, Settings, code screen) have not been looked at in a browser, because no owner login existed in the dev environment. `/login` was checked at phone and desktop width. Review the rest with a real login and report anything off.
