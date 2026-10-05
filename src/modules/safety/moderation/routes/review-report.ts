import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { reviewReportBody } from '../../safety.model';
import type { SafetyService } from '../../safety.service';

export const createReviewReportRoute = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '/reports/:id/review',
      async ({ actor, params, body }) => ok(await safety.review(actor, params.id, body.state)),
      { params: idParams, body: reviewReportBody },
    );
