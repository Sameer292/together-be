import { challengeParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { challengeInput } from '../../challenge.model';
import type { ChallengeService } from '../../challenge.service';

export const createUpdateChallengeRoute = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .patch(
      '/:challengeId',
      async ({ actor, params, body }) => ok(await challenges.updateDraft(actor, params.challengeId, body)),
      { params: challengeParams, body: challengeInput },
    );
