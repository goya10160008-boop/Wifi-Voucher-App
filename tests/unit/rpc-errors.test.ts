import { describe, expect, it } from 'vitest';
import { rpcMessage } from '@/lib/rpc-errors';

describe('rpcMessage', () => {
  it('maps known codes', () => {
    expect(rpcMessage({ message: 'OUT_OF_STOCK' })).toMatch(/no .*codes/i);
    expect(rpcMessage({ message: 'INSUFFICIENT_CASH' })).toMatch(/cash/i);
  });
  it('hides unknown errors behind a generic message', () => {
    expect(rpcMessage({ message: 'relation "x" does not exist' })).toBe('Something went wrong. Please try again.');
  });
});
