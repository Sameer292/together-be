import { message } from '@shared/utils/response';
import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { AuthService } from '../../auth.service';

export const createLogoutRoute = (auth: AuthService, authGuard: AuthGuard) =>
  new Elysia().use(authGuard).post('/logout', async ({ accessToken }) => {
    await auth.logout(accessToken);
    return message;
  });
