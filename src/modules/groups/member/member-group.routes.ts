import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { RateLimit } from '@/app/middleware/rate-limit';
import type { GroupService } from '../group.service';
import { createArchiveGroupRoute } from './routes/archive-group';
import { createGroupRoute } from './routes/create-group';
import { createInvitationRoute } from './routes/create-invitation';
import { createGetGroupRoute } from './routes/get-group';
import { createGetGroupsRoute } from './routes/get-groups';
import { createLeaveGroupRoute } from './routes/leave-group';
import { createRemoveMemberRoute } from './routes/remove-member';
import { createRevokeInvitationRoute } from './routes/revoke-invitation';
import { createTransferGroupRoute } from './routes/transfer-group';
import { createUpdateGroupRoute } from './routes/update-group';

export const createMemberGroupRoutes = (groups: GroupService, authGuard: AuthGuard, rateLimit: RateLimit) =>
  new Elysia({ prefix: '/groups', tags: ['Groups'] })
    .use(createGroupRoute(groups, authGuard))
    .use(createGetGroupsRoute(groups, authGuard))
    .use(createGetGroupRoute(groups, authGuard))
    .use(createUpdateGroupRoute(groups, authGuard))
    .use(createArchiveGroupRoute(groups, authGuard))
    .use(createLeaveGroupRoute(groups, authGuard))
    .use(createTransferGroupRoute(groups, authGuard))
    .use(createRemoveMemberRoute(groups, authGuard))
    .use(createInvitationRoute(groups, authGuard, rateLimit))
    .use(createRevokeInvitationRoute(groups, authGuard));
