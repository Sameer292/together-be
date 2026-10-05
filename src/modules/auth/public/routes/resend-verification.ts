import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { emailBody } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createResendVerificationRoute = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia().post(
    '/resend-verification',
    async ({ body, request, server }) => {
      rateLimit(request, server, 'resend');
      return ok((await auth.resend(body.email)) ?? { message: 'ok' });
    },
    { body: emailBody },
  );
