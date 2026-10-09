import { challengeParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import type { MediaService } from '../../media.service';

export const createUploadProofRoute = (media: MediaService, authGuard: AuthGuard, rateLimit: RateLimit) =>
  new Elysia().use(authGuard).post(
    '/challenges/:challengeId/uploads',
    async ({ actor, params, request, server }) => {
      rateLimit(request, server, 'upload');
      return ok(await media.upload(actor, params.challengeId, request));
    },
    { params: challengeParams, parse: 'none' },
  );
