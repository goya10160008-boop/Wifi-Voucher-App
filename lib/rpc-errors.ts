const MESSAGES: Record<string, string> = {
  FORBIDDEN: 'You are not allowed to do that.',
  PLAN_NOT_FOUND: 'That plan was not found or is archived.',
  INSUFFICIENT_CASH: 'Cash received is less than the price.',
  OUT_OF_STOCK: 'No codes left for this plan. Import more first.',
  KEY_REUSED: 'This sale may already be recorded. Check Sales before selling again.',
  SALE_NOT_FOUND: 'Sale not found.',
  REASON_REQUIRED: 'Please give a reason (at least 3 characters).',
  TOO_MANY_CODES: 'Too many codes at once (max 5000).',
};

export const rpcMessage = (error: { message: string }) =>
  MESSAGES[error.message] ?? 'Something went wrong. Please try again.';
