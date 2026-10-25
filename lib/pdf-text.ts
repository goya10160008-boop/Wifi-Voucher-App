'use client';
// Browser only. Omada's printed PDFs have outlined glyphs (no text layer), so when
// pdf.js finds no text we render each page and OCR it, digits only.
const MAX_PAGES = 30;

export async function extractPdfText(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES);

  let text = '';
  for (let i = 1; i <= pages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
  }
  if (/\d{6}/.test(text)) return text;

  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/core',
    langPath: '/ocr/lang',
    workerBlobURL: false,
  });
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: PSM.SPARSE_TEXT });
  try {
    for (let i = 1; i <= pages; i++) {
      onProgress?.(`Reading page ${i} of ${pages}…`);
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      text += (await worker.recognize(canvas)).data.text + '\n';
    }
  } finally {
    await worker.terminate();
  }
  return text;
}
