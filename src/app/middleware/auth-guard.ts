import type { Actor, AuthService } from '@modules/auth/auth.service';
import { fail } from '@shared/errors/app-error';
import { Elysia } from 'elysia';

export const createAuthGuard = (auth: AuthService) =>
  new Elysia({ name: 'authGuard' }).resolve(
    { as: 'scoped' },
    async ({ headers }): Promise<{ actor: Actor; accessToken: string }> => {
      const accessToken = headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!accessToken) return fail(401, 'unauthorized', 'Bearer token required');
      return { actor: await auth.userFromToken(accessToken), accessToken };
    },
  );

export type AuthGuard = ReturnType<typeof createAuthGuard>;
