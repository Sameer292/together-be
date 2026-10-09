export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unavailable';
export type AppError = Error & { status: number; code: ErrorCode };
export const fail = (status: number, code: ErrorCode, message: string): never => {
  const error = Object.assign(new Error(message), { status, code });
  throw error;
};
export const isAppError = (value: unknown): value is AppError =>
  value instanceof Error &&
  'status' in value &&
  typeof value.status === 'number' &&
  'code' in value &&
  (value.code === 'bad_request' ||
    value.code === 'unauthorized' ||
    value.code === 'forbidden' ||
    value.code === 'not_found' ||
    value.code === 'conflict' ||
    value.code === 'rate_limited' ||
    value.code === 'unavailable');
