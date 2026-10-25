// Self-host OCR + PDF worker files so nothing loads from a CDN. Runs before dev/build.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';

mkdirSync('public/ocr/core', { recursive: true });
mkdirSync('public/ocr/lang', { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/worker.min.js');
for (const f of readdirSync('node_modules/tesseract.js-core'))
  if (/-lstm\.wasm\.js$/.test(f)) cpSync(`node_modules/tesseract.js-core/${f}`, `public/ocr/core/${f}`);
cpSync('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'public/ocr/lang/eng.traineddata.gz');
cpSync('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'public/pdf.worker.min.mjs');
