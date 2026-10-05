import { tokenResultDto } from '@shared/models/response.model';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { verifyBody } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createVerifyRoute = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia().post(
    '/verify',
    async ({ body, request, server }) => {
      rateLimit(request, server, 'verify');
      return ok(await auth.verify(body.email, body.code, 'email'));
    },
    { body: verifyBody, detail: documented(tokenResultDto) },
  );
