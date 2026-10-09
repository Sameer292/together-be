import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import { acceptInvitationBody } from '../../group.model';
import type { GroupService } from '../../group.service';

export const createAcceptInvitationRoute = (groups: GroupService, authGuard: AuthGuard, rateLimit: RateLimit) =>
  new Elysia().use(authGuard).post(
    '/accept',
    async ({ actor, body, request, server }) => {
      rateLimit(request, server, 'invite-accept');
      return ok(await groups.acceptInvite(actor, body.token));
    },
    { body: acceptInvitationBody },
  );
