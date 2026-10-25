// Omada voucher codes are numeric, 6 to 10 digits (confirmed from samples/: 6 digits).
// Split on anything that is not alphanumeric so CSV, quotes and OCR spacing all work.
// Never trim leading zeros or reformat: the code is used verbatim at the portal.
const CODE = /^\d{6,10}$/;

export function parseCodes(text: string): string[] {
  const seen = new Set<string>();
  for (const token of text.split(/[^0-9A-Za-z]+/)) if (CODE.test(token)) seen.add(token);
  return [...seen];
}
