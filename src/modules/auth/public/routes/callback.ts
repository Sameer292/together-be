import { fail } from '@shared/errors/app-error';
import { message, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { callbackBody, callbackQuery } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createCallbackRoutes = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia()
    .get(
      '/callback',
      ({ query }) =>
        ok({
          flow: query.flow ?? 'email',
          method:
            'Enter the emailed code in the app and POST it to /v1/auth/verify or /v1/auth/password-reset/confirm.',
        }),
      { query: callbackQuery },
    )
    .post(
      '/callback',
      async ({ body, request, server }) => {
        rateLimit(request, server, 'callback');
        if (body.flow === 'email') return ok(await auth.verify(body.email, body.code, 'email'));
        if (!body.password) return fail(400, 'bad_request', 'New password required');
        await auth.resetPassword(body.email, body.code, body.password);
        return message;
      },
      { body: callbackBody },
    );
