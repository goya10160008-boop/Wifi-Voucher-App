# Import: show the chosen filename

## How it will work (plain words)
1. You choose a PDF. A "File" card appears at once with the file name and size (or "Pasted text" if you pasted codes).
2. The same name stays on screen above the code preview, and again right above the Import button in one sentence: "Importing 56 codes from 3HRS_10202026.pdf into 3HRS WIFI". The last thing you read before tapping Import is the file, the plan and the count.
3. After the import, the result keeps the name: "Imported 56 from 3HRS_10202026.pdf into 3HRS WIFI. Already had 0. Invalid 0."
4. If you pick a PDF with the same name and size as one you already imported on this device, a yellow warning says so and shows the date. It does not block you; the database already skips codes it has.

Not done on purpose: guessing the plan from the filename, page count (needs a change to the PDF reader for little value).

## Tasks
1. `lib/import-history.ts` + `tests/unit/import-history.test.ts` (test first): shortName, formatSize, importSummary, previousImport / recordImport with injectable storage.
2. `ImportClient.tsx`: file card, confirm sentence, result text, duplicate warning. Mint classes only.
3. e2e (skipped without creds): filename visible after choosing the sample and in the result; update the old result assertions.
4. decisions.md entries.

## Verification
tsc, npm test, npm run build, playwright (logged-out pass, login-only skip), OpenNext size, fixture screenshot at 390x844 (fixture deleted before commit).
