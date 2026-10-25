const MESSAGES: Record<string, string> = {
  FORBIDDEN: 'You are not allowed to do that.',
  PLAN_NOT_FOUND: 'That plan was not found or is archived.',
  INSUFFICIENT_CASH: 'Cash received is less than the price.',
  OUT_OF_STOCK: 'No codes left for this plan. Import more first.',
  KEY_REUSED: 'This sale may already be recorded. Check Sales before selling again.',
  SALE_NOT_FOUND: 'Sale not found.',
  REASON_REQUIRED: 'Please give a reason (at least 3 characters).',
  TOO_MANY_CODES: 'Too many codes at once (max 5000).',
  CART_TOO_BIG: 'You can sell at most 10 vouchers at a time.',
  CART_INVALID: 'Something is wrong with the cart. Check the quantities and try again.',
  BAD_REASON: 'Choose a reason.',
  STAFF_SALE: 'Owner Test is only for sales you made yourself. Nothing was changed.',
  TOO_OLD: 'Owner Test only works within 60 minutes of the sale. Nothing was changed.',
  NOT_SOLD: 'One of these codes is no longer marked as sold, so nothing was changed.',
};

// sell_cart raises OUT_OF_STOCK with DETAIL "<plan name>|<codes left>".
function outOfStock(details?: string) {
  const i = details?.lastIndexOf('|') ?? -1;
  if (!details || i < 1) return MESSAGES.OUT_OF_STOCK;
  const name = details.slice(0, i);
  const left = Number(details.slice(i + 1));
  if (!Number.isInteger(left) || left < 0) return MESSAGES.OUT_OF_STOCK;
  if (left === 0) return `No codes left for ${name}. Import more first.`;
  return `Only ${left} ${left === 1 ? 'code' : 'codes'} left for ${name}. Lower the quantity or import more.`;
}

export const rpcMessage = (error: { message: string; details?: string | null }) =>
  error.message === 'OUT_OF_STOCK' ? outOfStock(error.details ?? undefined)
    : MESSAGES[error.message] ?? 'Something went wrong. Please try again.';
