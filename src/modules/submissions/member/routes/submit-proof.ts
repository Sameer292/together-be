import { challengeParams } from '@shared/models/request.model';
import { acceptedResultDto } from '@shared/models/response.model';
import { idempotencyKey } from '@shared/utils/idempotency-key';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { proofInput } from '../../submission.model';
import type { SubmissionService } from '../../submission.service';

export const createSubmitProofRoute = (submissions: SubmissionService, authGuard: AuthGuard, rateLimit: RateLimit) =>
  new Elysia().use(authGuard).post(
    '/submissions',
    async ({ actor, params, body, headers, request, server }) => {
      rateLimit(request, server, 'submission');
      return ok(await submissions.submit(actor, params.challengeId, body, idempotencyKey(headers)));
    },
    { params: challengeParams, body: proofInput, detail: documented(acceptedResultDto) },
  );
