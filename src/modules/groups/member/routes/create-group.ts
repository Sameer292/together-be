import { groupCreatedResultDto } from '@shared/models/response.model';
import { idempotencyKey } from '@shared/utils/idempotency-key';
import { documented, ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { createGroupBody } from '../../group.model';
import type { GroupService } from '../../group.service';

export const createGroupRoute = (groups: GroupService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .post(
      '',
      async ({ actor, body, headers }) =>
        ok(await groups.create(actor, body.name, body.description ?? '', idempotencyKey(headers))),
      { body: createGroupBody, detail: documented(groupCreatedResultDto) },
    );
