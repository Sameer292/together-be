import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { SafetyService } from '../../safety.service';

export const createGetReportedProofRoute = (safety: SafetyService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get('/submissions/:id', async ({ actor, params }) => ok(await safety.readReportedProof(actor, params.id)), {
      params: idParams,
    });
