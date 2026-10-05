import { expect, test } from 'bun:test';
import { createDatabase } from '@infra/database/database.client';
import { createAuthService } from '@modules/auth/auth.service';
import type { Config } from '@/app/config/env';

const config: Config = {
  providerMode: 'supabase',
  localMediaDir: '.local/media',
  databaseUrl: 'postgres://unused:unused@localhost:5432/unused',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon',
  supabaseServiceKey: 'service',
  storageBucket: 'private',
  authCallbackUrl: 'http://localhost:3000/v1/auth/callback',
  freeGroupCapacity: 2,
  paidGroupCapacity: 4,
  freeActiveChallenges: 1,
  paidActiveChallenges: 2,
  maxImageBytes: 1048576,
  maxAttachmentsPerSubmission: 3,
  billingMode: 'test',
  revenueCatEnvironment: 'sandbox',
  port: 3000,
};
const auth = createAuthService(config, createDatabase(config.databaseUrl).db);

test('verification and reset reject invalid codes before issuing sessions', async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const fakeFetch = async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input));
    return new Response('{"error":"expired"}', { status: 401 });
  };
  globalThis.fetch = Object.assign(fakeFetch, { preconnect: original.preconnect });
  try {
    await expect(auth.verify('person@example.test', '123456', 'email')).rejects.toMatchObject({ status: 401 });
    await expect(auth.resetPassword('person@example.test', '123456', 'long-new-password')).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(2);
    expect(calls.every((path) => path.endsWith('/auth/v1/verify'))).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

test('reset establishes a recovery session and updates through its bearer token', async () => {
  const original = globalThis.fetch;
  const requests: { path: string; method: string; authorization: string | null }[] = [];
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const path = new URL(String(input)).pathname;
    requests.push({ path, method: init?.method ?? 'GET', authorization: headers.get('authorization') });
    if (path.endsWith('/verify'))
      return Response.json({ access_token: 'verified-recovery-session', refresh_token: 'refresh', expires_in: 3600 });
    if (path.endsWith('/user')) return Response.json({ id: crypto.randomUUID() });
    return new Response(null, { status: 204 });
  };
  globalThis.fetch = Object.assign(fakeFetch, { preconnect: original.preconnect });
  try {
    await auth.resetPassword('person@example.test', '123456', 'long-new-password');
    expect(requests.map((item) => item.method)).toEqual(['POST', 'PUT', 'POST']);
    expect(requests[1]?.authorization).toBe('Bearer verified-recovery-session');
  } finally {
    globalThis.fetch = original;
  }
});
