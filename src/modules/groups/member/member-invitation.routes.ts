import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import type { GroupService } from '../group.service';
import { createAcceptInvitationRoute } from './routes/accept-invitation';

export const createMemberInvitationRoutes = (groups: GroupService, authGuard: AuthGuard, rateLimit: RateLimit) =>
  new Elysia({ prefix: '/invitations', tags: ['Invitations'] }).use(
    createAcceptInvitationRoute(groups, authGuard, rateLimit),
  );
