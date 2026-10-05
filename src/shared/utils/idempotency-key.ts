import { fail } from '@shared/errors/app-error';

export const idempotencyKey = (headers: Record<string, string | undefined>): string => {
  const value = headers['idempotency-key'];
  if (!value || value.length < 8 || value.length > 128) return fail(400, 'bad_request', 'Idempotency-Key required');
  return value;
};
