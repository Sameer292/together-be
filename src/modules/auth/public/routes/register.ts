import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { registerBody } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createRegisterRoute = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia().post(
    '/register',
    async ({ body, request, server }) => {
      rateLimit(request, server, 'register');
      return ok(await auth.register(body.email, body.password));
    },
    { body: registerBody },
  );
