# Decisions

The 20 design decisions are in `docs/superpowers/specs/2026-10-25-voucher-manager-design.md` section 8. This file logs decisions made while building.

## 2026-10-25

1. **Omada PDFs have no text layer.** The sample (`samples/3HRS_10202026.pdf`) is a browser "print to PDF" whose glyphs are outlined vector paths, so `pdfjs-dist` `getTextContent()` returns nothing. `lib/pdf-text.ts` tries the text layer first, then renders each page and runs OCR (`tesseract.js`, digits only, 2x scale). On the sample it read all 56 codes correctly. The preview/untick step stays the safety net. Paste/CSV also works.
2. **OCR assets are self-hosted.** `scripts/copy-ocr.mjs` (runs on `predev` and `prebuild`) copies the tesseract worker, the three `-lstm` core builds, `eng.traineddata.gz` and the pdf.js worker into `public/` (git-ignored). No CDN at runtime. They are static assets, so they do not count toward the 3 MiB Worker limit.
3. **Code format:** `parseCodes` accepts only 6 to 10 digit numeric tokens (confirmed from the sample: 6 digits). The DB regex stays wider (`[A-Za-z0-9-]{4,32}`). If Omada ever issues alphanumeric codes, widen `lib/parse-codes.ts` and add a fixture.
4. **No real-PDF text fixture.** The spec asked for a parse test on real Omada PDF text. There is no text, and the sample holds real unsold codes (git-ignored). `tests/unit/parse-codes.test.ts` uses synthetic OCR-shaped text. The real sample is covered by the Playwright test (needs login).
5. **Hours, not minutes, in the plan form.** Stored as `duration_minutes`. Fractions work (0.5 h = 30 min).
6. **Icons are generated** by `scripts/make-icons.mjs` (plain WiFi glyph, no dependencies). Replace `public/icons/*` with real branding any time.
7. **Local DB tests not run.** No Docker on the dev machine. The RPC logic was checked on the remote project inside a transaction that always rolls back (FIFO, idempotent retry, insufficient cash, out of stock, import counts, void burns code, Manila 23:59/00:01 buckets all passed). **Not tested:** true parallel `SKIP LOCKED` (needs two connections). Test it before relying on two sellers at once.
8. **Worker size:** about 2.47 MiB gzipped on 2026-10-25 against the 3 MiB free limit. Watch it when adding dependencies. Server code must not import `pdfjs-dist`, `tesseract.js` or `qrcode.react`.
9. **`proxy.ts` works under OpenNext** (`x-proxy: 1` seen in `npm run preview`), so no `middleware.ts` fallback is needed.
10. **Generated DB types** live in `lib/supabase/database.types.ts` (hand-trimmed from the generator). Regenerate after every migration.
