import { tokenResultDto } from '@shared/models/response.model';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { refreshBody } from '../../auth.model';
import type { AuthService } from '../../auth.service';

export const createRefreshRoute = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia().post(
    '/refresh',
    async ({ body, request, server }) => {
      rateLimit(request, server, 'refresh');
      return ok(await auth.refresh(body.refreshToken));
    },
    { body: refreshBody, detail: documented(tokenResultDto) },
  );
