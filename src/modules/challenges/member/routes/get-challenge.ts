import { challengeParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { ChallengeService } from '../../challenge.service';

export const createGetChallengeRoute = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get('/:challengeId', async ({ actor, params }) => ok(await challenges.get(actor, params.challengeId)), {
      params: challengeParams,
    });
