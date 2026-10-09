import { idParams } from '@shared/models/request.model';
import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { createInvitationBody } from '../../group.model';
import type { GroupService } from '../../group.service';

export const createInvitationRoute = (groups: GroupService, authGuard: AuthGuard, rateLimit: RateLimit) =>
  new Elysia().use(authGuard).post(
    '/:id/invitations',
    async ({ actor, params, body, request, server }) => {
      rateLimit(request, server, 'invite');
      return ok(await groups.invite(actor, params.id, body.expiresInHours));
    },
    { params: idParams, body: createInvitationBody },
  );
