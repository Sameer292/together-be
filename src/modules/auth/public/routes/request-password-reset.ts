import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { emailBody } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createRequestPasswordResetRoute = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia().post(
    '/password-reset/request',
    async ({ body, request, server }) => {
      rateLimit(request, server, 'password-reset');
      return ok((await auth.requestReset(body.email)) ?? { message: 'ok' });
    },
    { body: emailBody },
  );
