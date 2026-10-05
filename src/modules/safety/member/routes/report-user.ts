import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { reportBody } from '../../safety.model';
import type { SafetyService } from '../../safety.service';

export const createReportUserRoute = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '/reports/users/:id',
      async ({ actor, params, body }) => ok(await safety.reportUser(actor, params.id, body.reason)),
      { params: idParams, body: reportBody },
    );
