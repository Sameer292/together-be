import { idParams, pagination } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { ChallengeService } from '../../challenge.service';

export const createGetChallengesRoute = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .get(
      '',
      async ({ actor, params, query }) => ok(await challenges.list(actor, params.id, query.limit ?? 20, query.cursor)),
      { params: idParams, query: pagination },
    );
