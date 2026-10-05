import { idParams } from '@shared/models/request.model';
import { idResultDto } from '@shared/models/response.model';
import { idempotencyKey } from '@shared/utils/idempotency-key';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { challengeInput } from '../../challenge.model';
import type { ChallengeService } from '../../challenge.service';

export const createChallengeRoute = (challenges: ChallengeService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '',
      async ({ actor, params, body, headers }) =>
        ok(await challenges.create(actor, params.id, body, idempotencyKey(headers))),
      { params: idParams, body: challengeInput, detail: documented(idResultDto) },
    );
