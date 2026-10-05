import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { updateProfileBody } from '../../user.model';
import type { UserService } from '../../user.service';

export const createUpdateProfileRoute = (users: UserService, authGuard: AuthGuard) =>
  new Elysia()
    .use(authGuard)
    .patch('', async ({ actor, body }) => ok(await users.update(actor, body.displayName, body.bio ?? null)), {
      body: updateProfileBody,
    });
