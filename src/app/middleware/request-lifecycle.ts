import { fail, isAppError } from '@shared/errors/app-error';
import { Elysia } from 'elysia';
import type { Config } from '@/app/config/env';

export const createRequestLifecycle = (config: Config) =>
  new Elysia({ name: 'requestLifecycle' })
    .onRequest(({ request, set }) => {
      set.headers['x-request-id'] = crypto.randomUUID();
      const path = new URL(request.url).pathname;
      const maximum = path.endsWith('/uploads')
        ? config.maxImageBytes
        : path === '/v1/billing/webhook'
          ? 256_000
          : 64_000;
      const length = Number(request.headers.get('content-length'));
      if (length > maximum) fail(413, 'bad_request', 'Request too large');
    })
    .onAfterHandle({ as: 'global' }, ({ request, set }) => {
      console.info(
        JSON.stringify({
          event: 'request',
          requestId: set.headers['x-request-id'],
          method: request.method,
          path: new URL(request.url).pathname,
          status: set.status ?? 200,
        }),
      );
    })
    .onError({ as: 'global' }, ({ error, set, code, request }) => {
      const known = isAppError(error);
      set.status = known ? error.status : code === 'VALIDATION' ? 400 : code === 'NOT_FOUND' ? 404 : 500;
      console.warn(
        JSON.stringify({
          event: 'request_error',
          requestId: set.headers['x-request-id'],
          method: request.method,
          path: new URL(request.url).pathname,
          status: set.status,
        }),
      );
      return {
        error: {
          code: known
            ? error.code
            : code === 'VALIDATION'
              ? 'bad_request'
              : code === 'NOT_FOUND'
                ? 'not_found'
                : 'internal_error',
          message: known
            ? error.message
            : code === 'VALIDATION'
              ? 'Invalid request'
              : code === 'NOT_FOUND'
                ? 'Not found'
                : 'Internal server error',
          requestId: set.headers['x-request-id'],
        },
      };
    })
    .as('global');
