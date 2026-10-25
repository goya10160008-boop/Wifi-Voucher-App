import { describe, expect, it } from 'vitest';
import { clockTime, dayHeading, shortManilaTime } from '@/lib/short-time';

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

import { shortPeriod } from '@/lib/short-time';

describe('shortPeriod', () => {
  it('day buckets: short month + day, year only when not this year', () => {
    expect(shortPeriod('2026-10-25', 'day', now)).toBe('Oct 25');
    expect(shortPeriod('2025-12-31', 'day', now)).toBe('Dec 31, 2025');
  });
  it('month buckets: month + year', () => {
    expect(shortPeriod('2026-10-01', 'month', now)).toBe('Oct 2026');
  });
});

describe('dayHeading and clockTime (dense Sales list)', () => {
  it('heading is Today, Yesterday, or the short date', () => {
    expect(dayHeading('2026-10-25T07:42:00Z', now)).toBe('Today');
    expect(dayHeading('2026-10-24T01:05:00Z', now)).toBe('Yesterday');
    expect(dayHeading('2026-10-20T07:42:00Z', now)).toBe('Oct 20');
    expect(dayHeading('2025-12-31T07:42:00Z', now)).toBe('Dec 31, 2025');
  });
  it('uses the Manila day: 23:59 Oct 24 Manila is Yesterday, 00:01 Oct 25 Manila is Today', () => {
    expect(dayHeading('2026-10-24T15:59:00Z', now)).toBe('Yesterday');
    expect(dayHeading('2026-10-24T16:01:00Z', now)).toBe('Today');
  });
  it('clock time is 12-hour Manila time', () => {
    expect(clockTime('2026-10-25T07:42:00Z')).toBe('3:42 PM');
    expect(clockTime('2026-10-24T16:01:00Z')).toBe('12:01 AM');
    expect(clockTime('2026-10-25T04:00:00Z')).toBe('12:00 PM');
  });
});
