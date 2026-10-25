import { describe, expect, it } from 'vitest';
import { parseCodes } from '@/lib/parse-codes';

// Shaped like OCR output of an Omada "print voucher" PDF: codes plus header/footer noise.
const OCR = `101201261220
564275 150216 685170
Valid for 3h 3 3 1 1
080137 564275
Limited Usage Counts 1
5226924616531607012629080536411352763220845409595
12345`;

describe('parseCodes', () => {
  it('keeps 6-10 digit tokens, drops noise, dedupes, keeps order and leading zeros', () => {
    expect(parseCodes(OCR)).toEqual(['564275', '150216', '685170', '080137']);
  });
  it('accepts CSV / one-per-line paste', () => {
    expect(parseCodes('code,plan\n123456,3h\n"654321",3h')).toEqual(['123456', '654321']);
  });
  it('returns [] for empty or code-free text', () => {
    expect(parseCodes('')).toEqual([]);
    expect(parseCodes('hello world 12')).toEqual([]);
  });
});
