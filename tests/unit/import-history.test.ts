import { describe, expect, it } from 'vitest';
import { formatSize, importSummary, previousImport, recordImport, shortName, type Store } from '@/lib/import-history';

const memory = (): Store => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('import-history', () => {
  it('shortName keeps short names and trims long ones in the middle, keeping the extension', () => {
    expect(shortName('3HRS_10202026.pdf')).toBe('3HRS_10202026.pdf');
    const s = shortName('a'.repeat(100) + '.pdf', 40);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('.pdf')).toBe(true);
    expect(s).toContain('…');
  });
  it('formatSize', () => {
    expect(formatSize(900)).toBe('900 B');
    expect(formatSize(378644)).toBe('370 KB');
    expect(formatSize(2_621_440)).toBe('2.5 MB');
  });
  it('importSummary names count, source and plan', () => {
    expect(importSummary(56, '3HRS_10202026.pdf', '3HRS WIFI')).toBe('Importing 56 codes from 3HRS_10202026.pdf into 3HRS WIFI');
    expect(importSummary(1, 'Pasted text', 'X')).toBe('Importing 1 code from Pasted text into X');
    expect(importSummary(5, 'a.pdf', '')).toBe('Importing 5 codes from a.pdf (choose a plan)');
  });
  it('remembers an import and finds it again by name and size', () => {
    const s = memory();
    expect(previousImport(s, 'a.pdf', 10)).toBeNull();
    recordImport(s, 'a.pdf', 10, '2026-10-25T10:00:00.000Z');
    expect(previousImport(s, 'a.pdf', 10)?.at).toBe('2026-10-25T10:00:00.000Z');
    expect(previousImport(s, 'a.pdf', 11)).toBeNull();
    expect(previousImport(s, 'b.pdf', 10)).toBeNull();
  });
  it('keeps only the latest 50 and survives junk or a broken store', () => {
    const s = memory();
    for (let i = 0; i < 60; i++) recordImport(s, `f${i}.pdf`, i, '2026-10-25T00:00:00.000Z');
    expect(previousImport(s, 'f0.pdf', 0)).toBeNull();
    expect(previousImport(s, 'f59.pdf', 59)).not.toBeNull();
    s.setItem('imported-pdfs', '{not json');
    expect(previousImport(s, 'a.pdf', 1)).toBeNull();
    const broken: Store = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(previousImport(broken, 'a.pdf', 1)).toBeNull();
    expect(() => recordImport(broken, 'a.pdf', 1, 'x')).not.toThrow();
  });
});
