import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { resetPasswordBody } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createConfirmPasswordResetRoute = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia().post(
    '/password-reset/confirm',
    async ({ body, request, server }) => {
      rateLimit(request, server, 'password-reset-confirm');
      await auth.resetPassword(body.email, body.code, body.password);
      return message;
    },
    { body: resetPasswordBody },
  );
