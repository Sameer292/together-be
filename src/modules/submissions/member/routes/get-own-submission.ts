import { challengeParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { SubmissionService } from '../../submission.service';

export const createGetOwnSubmissionRoute = (submissions: SubmissionService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get('/submissions/me', async ({ actor, params }) => ok(await submissions.own(actor, params.challengeId)), {
      params: challengeParams,
    });
