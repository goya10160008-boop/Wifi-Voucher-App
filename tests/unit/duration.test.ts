import { describe, expect, it } from 'vitest';
import { durationLabel } from '@/lib/duration';

describe('durationLabel', () => {
  it('whole hours', () => {
    expect(durationLabel(60)).toBe('1h');
    expect(durationLabel(180)).toBe('3h');
    expect(durationLabel(600)).toBe('10h');
    expect(durationLabel(1440)).toBe('24h');
  });
  it('minutes and mixed', () => {
    expect(durationLabel(30)).toBe('30m');
    expect(durationLabel(90)).toBe('1h 30m');
  });
  it('days only for exact multiples of 24h from 48h up', () => {
    expect(durationLabel(2880)).toBe('2d');
    expect(durationLabel(10080)).toBe('7d');
    expect(durationLabel(3000)).toBe('50h');
  });
});
