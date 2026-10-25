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
  it('names the short plan and how many are left when the DB gives details', () => {
    expect(rpcMessage({ message: 'OUT_OF_STOCK', details: '3 Hours|2' })).toBe('Only 2 codes left for 3 Hours. Lower the quantity or import more.');
    expect(rpcMessage({ message: 'OUT_OF_STOCK', details: '3 Hours|1' })).toBe('Only 1 code left for 3 Hours. Lower the quantity or import more.');
    expect(rpcMessage({ message: 'OUT_OF_STOCK', details: '3 Hours|0' })).toBe('No codes left for 3 Hours. Import more first.');
  });
  it('maps the cart codes', () => {
    expect(rpcMessage({ message: 'CART_TOO_BIG' })).toMatch(/10/);
    expect(rpcMessage({ message: 'CART_INVALID' })).toMatch(/cart/i);
  });
});
