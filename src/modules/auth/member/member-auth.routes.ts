import { Elysia } from 'elysia';
import type { AuthGuard } from '@/app/middleware/auth-guard';
import type { AuthService } from '../auth.service';
import { createLogoutRoute } from './routes/logout';

export const createMemberAuthRoutes = (auth: AuthService, authGuard: AuthGuard) =>
  new Elysia({ prefix: '/auth', tags: ['Member Auth'] }).use(createLogoutRoute(auth, authGuard));
