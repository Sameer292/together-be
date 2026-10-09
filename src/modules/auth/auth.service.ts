import type { Database } from '@infra/database/database.client';
import { profiles } from '@infra/database/database.schema';
import { fail, isAppError } from '@shared/errors/app-error';
import { isRecord } from '@shared/utils/validation';
import { eq } from 'drizzle-orm';
import type { Config } from '@/app/config/env';
import { createLocalAuthService } from './local-auth.service';

export type Actor = { id: string; email: string; verified: boolean; moderationRole: boolean };
type AuthResponse = Record<string, unknown>;

export type AuthService = ReturnType<typeof createAuthService>;

export const createAuthService = (config: Config, db: Database) => {
  if (config.providerMode === 'local') return createLocalAuthService(db);
  const authRequest = async (path: string, init: RequestInit, token?: string): Promise<AuthResponse> => {
    const response = await fetch(`${config.supabaseUrl}/auth/v1${path}`, {
      ...init,
      headers: {
        apikey: config.supabaseAnonKey,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(10000),
    });
    const body = await response.text();
    let data: unknown = {};
    try {
      if (body) data = JSON.parse(body);
    } catch {
      return fail(503, 'unavailable', 'Authentication unavailable');
    }
    if (!response.ok)
      fail(
        response.status === 429 ? 429 : 401,
        response.status === 429 ? 'rate_limited' : 'unauthorized',
        'Authentication failed',
      );
    if (!isRecord(data)) return fail(503, 'unavailable', 'Authentication unavailable');
    return data;
  };
  const expectString = (value: unknown): string => {
    if (typeof value !== 'string') return fail(401, 'unauthorized', 'Authentication incomplete');
    return value;
  };
  const tokens = (data: AuthResponse): { accessToken: string; refreshToken: string; expiresIn: number } => {
    const expiresIn = data.expires_in;
    if (typeof expiresIn !== 'number') return fail(401, 'unauthorized', 'Authentication incomplete');
    return { accessToken: expectString(data.access_token), refreshToken: expectString(data.refresh_token), expiresIn };
  };
  const userFromToken = async (token: string): Promise<Actor> => {
    const data = await authRequest('/user', { method: 'GET' }, token);
    const user = 'id' in data ? data : isRecord(data.user) ? data.user : undefined;
    const userId = expectString(user?.id);
    const email = expectString(user?.email);
    if (!user?.email_confirmed_at) fail(403, 'forbidden', 'Verify your email');
    const existing = await db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
      columns: { moderationRole: true, deletionRequestedAt: true },
    });
    if (!existing) {
      await db
        .insert(profiles)
        .values({ id: userId, displayName: email.split('@')[0] ?? 'Member' })
        .onConflictDoNothing();
    } else if (existing.deletionRequestedAt) fail(403, 'forbidden', 'Account deletion pending');
    return { id: userId, email, verified: true, moderationRole: existing?.moderationRole ?? false };
  };
  const redirect = `?redirect_to=${encodeURIComponent(config.authCallbackUrl)}`;
  return {
    userFromToken,
    register: async (email: string, password: string): Promise<{ message: string }> => {
      await authRequest(`/signup${redirect}`, { method: 'POST', body: JSON.stringify({ email, password }) });
      return { message: 'Check your email for verification' };
    },
    login: async (email: string, password: string) =>
      tokens(
        await authRequest('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) }),
      ),
    refresh: async (refreshToken: string) =>
      tokens(
        await authRequest('/token?grant_type=refresh_token', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: refreshToken }),
        }),
      ),
    logout: async (accessToken: string): Promise<void> => {
      await authRequest('/logout', { method: 'POST' }, accessToken);
    },
    resend: async (email: string): Promise<void> => {
      try {
        await authRequest(`/resend${redirect}`, { method: 'POST', body: JSON.stringify({ email, type: 'signup' }) });
      } catch (error: unknown) {
        if (!isAppError(error) || error.status !== 401) throw error;
      }
    },
    requestReset: async (email: string): Promise<void> => {
      try {
        await authRequest(`/recover${redirect}`, { method: 'POST', body: JSON.stringify({ email }) });
      } catch (error: unknown) {
        if (!isAppError(error) || error.status !== 401) throw error;
      }
    },
    verify: async (email: string, code: string, type: 'email' | 'recovery') =>
      tokens(await authRequest('/verify', { method: 'POST', body: JSON.stringify({ email, token: code, type }) })),
    resetPassword: async (email: string, code: string, password: string): Promise<void> => {
      const session = tokens(
        await authRequest('/verify', {
          method: 'POST',
          body: JSON.stringify({ email, token: code, type: 'recovery' }),
        }),
      );
      await authRequest('/user', { method: 'PUT', body: JSON.stringify({ password }) }, session.accessToken);
      await authRequest('/logout', { method: 'POST' }, session.accessToken).catch(() => undefined);
    },
  };
};
