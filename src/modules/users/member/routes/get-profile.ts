import { ok } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { UserService } from '../../user.service';

export const createGetProfileRoute = (users: UserService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).get('', async ({ actor }) => ok(await users.me(actor)));
