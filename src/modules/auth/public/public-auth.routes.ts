import { Elysia } from 'elysia';
import type { RateLimit } from '@/app/middleware/rate-limit';
import type { AuthService } from '../auth.service';
import { createCallbackRoutes } from './routes/callback';
import { createConfirmPasswordResetRoute } from './routes/confirm-password-reset';
import { createLoginRoute } from './routes/login';
import { createRefreshRoute } from './routes/refresh';
import { createRegisterRoute } from './routes/register';
import { createRequestPasswordResetRoute } from './routes/request-password-reset';
import { createResendVerificationRoute } from './routes/resend-verification';
import { createVerifyRoute } from './routes/verify';

export const createPublicAuthRoutes = (auth: AuthService, rateLimit: RateLimit) =>
  new Elysia({ prefix: '/auth', tags: ['Public Auth'] })
    .use(createRegisterRoute(auth, rateLimit))
    .use(createVerifyRoute(auth, rateLimit))
    .use(createResendVerificationRoute(auth, rateLimit))
    .use(createLoginRoute(auth, rateLimit))
    .use(createRefreshRoute(auth, rateLimit))
    .use(createRequestPasswordResetRoute(auth, rateLimit))
    .use(createConfirmPasswordResetRoute(auth, rateLimit))
    .use(createCallbackRoutes(auth, rateLimit));
