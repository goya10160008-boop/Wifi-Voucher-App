import { describe, expect, it } from 'vitest';
import { shortManilaTime } from '@/lib/short-time';

// Manila = UTC+8. now = 2026-10-25 15:00 Manila.
const now = new Date('2026-10-25T07:00:00Z');

describe('shortManilaTime', () => {
  it('today shows only the time, 12-hour', () => {
    expect(shortManilaTime('2026-10-25T07:42:00Z', now)).toBe('Today 3:42 PM');
  });
  it('yesterday', () => {
    expect(shortManilaTime('2026-10-24T01:05:00Z', now)).toBe('Yesterday 9:05 AM');
  });
  it('older dates use short month and day', () => {
    expect(shortManilaTime('2026-10-20T07:42:00Z', now)).toBe('Oct 20 · 3:42 PM');
  });
  it('uses the Manila day, not the UTC day (23:59 vs 00:01 Manila)', () => {
    expect(shortManilaTime('2026-10-24T15:59:00Z', now)).toBe('Yesterday 11:59 PM'); // 23:59 Oct 24 Manila
    expect(shortManilaTime('2026-10-24T16:01:00Z', now)).toBe('Today 12:01 AM'); // 00:01 Oct 25 Manila
  });
  it('shows the year when it is not the current year', () => {
    expect(shortManilaTime('2025-12-31T07:42:00Z', now)).toBe('Dec 31, 2025 · 3:42 PM');
  });
  it('noon and midnight read correctly', () => {
    expect(shortManilaTime('2026-10-20T04:00:00Z', now)).toBe('Oct 20 · 12:00 PM');
    expect(shortManilaTime('2026-10-19T16:00:00Z', now)).toBe('Oct 20 · 12:00 AM');
  });
});
