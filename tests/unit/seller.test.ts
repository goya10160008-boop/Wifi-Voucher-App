import { describe, expect, it } from 'vitest';
import { nameMap, sellerLabel } from '@/lib/seller';

describe('sellerLabel', () => {
  const names = nameMap([
    { user_id: 'aaaa1111-0000-0000-0000-000000000000', display_name: ' Maria ' },
    { user_id: 'bbbb2222-0000-0000-0000-000000000000', display_name: null },
    { user_id: 'cccc3333-0000-0000-0000-000000000000', display_name: '   ' },
  ]);
  it('uses the trimmed display name', () => {
    expect(sellerLabel(names, 'aaaa1111-0000-0000-0000-000000000000')).toBe('Maria');
  });
  it('falls back to a short id when the name is empty or the profile is unknown', () => {
    expect(sellerLabel(names, 'bbbb2222-0000-0000-0000-000000000000')).toBe('User bbbb');
    expect(sellerLabel(names, 'cccc3333-0000-0000-0000-000000000000')).toBe('User cccc');
    expect(sellerLabel(names, 'dddd4444-0000-0000-0000-000000000000')).toBe('User dddd');
  });
});
