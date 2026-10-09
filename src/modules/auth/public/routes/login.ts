import { tokenResultDto } from '@shared/models/response.model';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { loginBody } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createLoginRoute = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia().post(
    '/login',
    async ({ body, request, server }) => {
      rateLimit(request, server, 'login');
      return ok(await auth.login(body.email, body.password));
    },
    { body: loginBody, detail: documented(tokenResultDto) },
  );
