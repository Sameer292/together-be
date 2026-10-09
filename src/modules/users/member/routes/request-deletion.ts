import type { AuthService } from '@modules/auth/auth.service';
import { fail } from '@shared/errors/app-error';
import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import { deletionRequestBody } from '../../user.model';
import type { UserService } from '../../user.service';

export const createRequestDeletionRoute = (users: UserService, auth: AuthService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).post(
    '/deletion-request',
    async ({ actor, body }) => {
      const session = await auth.login(actor.email, body.password);
      const confirmed = await auth.userFromToken(session.accessToken);
      if (confirmed.id !== actor.id) return fail(403, 'forbidden', 'Reauthentication failed');
      await users.requestDeletion(actor);
      return message;
    },
    { body: deletionRequestBody },
  );
