import type { AuthService } from '@modules/auth/auth.service';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { UserService } from '../user.service';
import { createGetProfileRoute } from './routes/get-profile';
import { createRequestDeletionRoute } from './routes/request-deletion';
import { createUpdateProfileRoute } from './routes/update-profile';

export const createMemberUserRoutes = (users: UserService, auth: AuthService, authGuard: AuthGuard) =>
  new Elysia({ prefix: '/me', tags: ['Profile'] })
    .use(createGetProfileRoute(users, authGuard))
    .use(createUpdateProfileRoute(users, authGuard))
    .use(createRequestDeletionRoute(users, auth, authGuard));
