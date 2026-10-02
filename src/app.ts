import { openapi } from '@elysia/openapi';
import { sql } from 'drizzle-orm';
import type { TSchema } from 'elysia';
import { Elysia, t } from 'elysia';
import { createAuthService } from './auth/service';
import { createBillingService } from './billing/service';
import { createChallengeService } from './challenges/service';
import type { Config } from './config';
import {
  acceptedResultDto,
  errorDto,
  feedResultDto,
  groupCreatedResultDto,
  groupPageResultDto,
  groupResultDto,
  idResultDto,
  tokenResultDto,
} from './contracts';
import type { Database } from './db';
import { createEngagementService } from './engagement/service';
import { fail, isAppError } from './errors';
import { createGroupService } from './groups/service';
import { createMediaService } from './media/service';
import { createSafetyService } from './safety/service';
import { createSubmissionService } from './submissions/service';
import { createUserService } from './users/service';

const uuid = t.String({ format: 'uuid' });
const idParams = t.Object({ id: uuid });
const groupParams = t.Object({ id: uuid });
const challengeParams = t.Object({ challengeId: uuid });
const submissionParams = t.Object({ submissionId: uuid });
const pagination = t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })), cursor: t.Optional(uuid) });
const challengeInput = t.Object({
  title: t.String({ minLength: 1, maxLength: 160 }),
  description: t.String({ maxLength: 10000 }),
  criteria: t.String({ minLength: 1, maxLength: 10000 }),
  proofFormats: t.Array(t.Union([t.Literal('text'), t.Literal('image'), t.Literal('link')]), {
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
  }),
  deadlineAt: t.String({ format: 'date-time' }),
});
const proofInput = t.Object({
  text: t.Optional(t.String({ minLength: 1, maxLength: 5000 })),
  link: t.Optional(t.String({ minLength: 1, maxLength: 2048 })),
  attachmentIds: t.Array(uuid, { maxItems: 20 }),
});
const message = { data: { message: 'ok' } };
const ok = <T>(value: T): { data: T } => ({ data: value });
const documented = (schema: TSchema) => ({
  responses: {
    200: { description: 'Success', content: { 'application/json': { schema } } },
    400: { description: 'Invalid request', content: { 'application/json': { schema: errorDto } } },
    401: { description: 'Unauthenticated', content: { 'application/json': { schema: errorDto } } },
    403: { description: 'Forbidden', content: { 'application/json': { schema: errorDto } } },
    409: { description: 'Conflict', content: { 'application/json': { schema: errorDto } } },
  },
});
const key = (headers: Record<string, string | undefined>): string => {
  const value = headers['idempotency-key'];
  if (!value || value.length < 8 || value.length > 128) return fail(400, 'bad_request', 'Idempotency-Key required');
  return value;
};

export const createApp = (config: Config, db: Database) => {
  const auth = createAuthService(config, db);
  const users = createUserService(db);
  const groups = createGroupService(db, config);
  const challenges = createChallengeService(db, config);
  const submissions = createSubmissionService(db, config);
  const media = createMediaService(db, config);
  const engagement = createEngagementService(db);
  const safety = createSafetyService(db);
  const billing = createBillingService(db, config);
  const attempts = new Map<string, { count: number; until: number }>();
  const authLimit = (
    request: Request,
    server: { requestIP: (request: Request) => { address: string } | null } | null,
    operation: string,
  ): void => {
    const address = server?.requestIP(request)?.address ?? 'unknown';
    const value = `${address}:${operation}`;
    const now = Date.now();
    if (attempts.size >= 10000)
      for (const [storedKey, stored] of attempts) if (stored.until <= now) attempts.delete(storedKey);
    const current = attempts.get(value);
    if (!current || current.until <= now) {
      if (attempts.size >= 10000) fail(429, 'rate_limited', 'Too many requests');
      attempts.set(value, { count: 1, until: now + 60000 });
      return;
    }
    if (current.count >= 10) fail(429, 'rate_limited', 'Too many requests');
    current.count += 1;
  };
  const publicRoutes = new Elysia({ prefix: '/v1/auth' })
    .post(
      '/register',
      ({ body, request, server }) => {
        authLimit(request, server, 'register');
        return auth.register(body.email, body.password).then(ok);
      },
      {
        body: t.Object({
          email: t.String({ format: 'email', maxLength: 320 }),
          password: t.String({ minLength: 12, maxLength: 128 }),
        }),
      },
    )
    .post(
      '/verify',
      ({ body, request, server }) => {
        authLimit(request, server, 'verify');
        return auth.verify(body.email, body.code, 'email').then(ok);
      },
      {
        body: t.Object({ email: t.String({ format: 'email' }), code: t.String({ minLength: 6, maxLength: 16 }) }),
        detail: documented(tokenResultDto),
      },
    )
    .post(
      '/resend-verification',
      ({ body, request, server }) => {
        authLimit(request, server, 'resend');
        return auth.resend(body.email).then(() => message);
      },
      { body: t.Object({ email: t.String({ format: 'email' }) }) },
    )
    .post(
      '/login',
      ({ body, request, server }) => {
        authLimit(request, server, 'login');
        return auth.login(body.email, body.password).then(ok);
      },
      {
        body: t.Object({ email: t.String({ format: 'email' }), password: t.String() }),
        detail: documented(tokenResultDto),
      },
    )
    .post(
      '/refresh',
      ({ body, request, server }) => {
        authLimit(request, server, 'refresh');
        return auth.refresh(body.refreshToken).then(ok);
      },
      { body: t.Object({ refreshToken: t.String({ minLength: 16 }) }), detail: documented(tokenResultDto) },
    )
    .post(
      '/password-reset/request',
      ({ body, request, server }) => {
        authLimit(request, server, 'password-reset');
        return auth.requestReset(body.email).then(() => message);
      },
      { body: t.Object({ email: t.String({ format: 'email' }) }) },
    )
    .post(
      '/password-reset/confirm',
      ({ body, request, server }) => {
        authLimit(request, server, 'password-reset-confirm');
        return auth.resetPassword(body.email, body.code, body.password).then(() => message);
      },
      {
        body: t.Object({
          email: t.String({ format: 'email' }),
          code: t.String({ minLength: 6, maxLength: 16 }),
          password: t.String({ minLength: 12, maxLength: 128 }),
        }),
      },
    )
    .get(
      '/callback',
      ({ query }) =>
        ok({
          flow: query.flow ?? 'email',
          method:
            'Enter the emailed code in the app and POST it to /v1/auth/verify or /v1/auth/password-reset/confirm.',
        }),
      { query: t.Object({ flow: t.Optional(t.Union([t.Literal('email'), t.Literal('recovery')])) }) },
    )
    .post(
      '/callback',
      ({ body, request, server }) => {
        authLimit(request, server, 'callback');
        if (body.flow === 'email') return auth.verify(body.email, body.code, 'email').then(ok);
        if (!body.password) return fail(400, 'bad_request', 'New password required');
        return auth.resetPassword(body.email, body.code, body.password).then(() => message);
      },
      {
        body: t.Object({
          flow: t.Union([t.Literal('email'), t.Literal('recovery')]),
          email: t.String({ format: 'email' }),
          code: t.String({ minLength: 6, maxLength: 16 }),
          password: t.Optional(t.String({ minLength: 12, maxLength: 128 })),
        }),
      },
    );
  const protectedRoutes = new Elysia({ prefix: '/v1' })
    .derive(async ({ headers }) => {
      const token = headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return fail(401, 'unauthorized', 'Bearer token required');
      return { actor: await auth.userFromToken(token) };
    })
    .post('/auth/logout', ({ headers }) => auth.logout(headers.authorization?.slice(7) ?? '').then(() => message))
    .get('/me', ({ actor }) => users.me(actor).then(ok))
    .patch('/me', ({ actor, body }) => users.update(actor, body.displayName, body.bio ?? null).then(ok), {
      body: t.Object({
        displayName: t.String({ minLength: 1, maxLength: 120 }),
        bio: t.Optional(t.Union([t.String({ maxLength: 2000 }), t.Null()])),
      }),
    })
    .post(
      '/me/deletion-request',
      async ({ actor, body }) => {
        const session = await auth.login(actor.email, body.password);
        const confirmed = await auth.userFromToken(session.accessToken);
        if (confirmed.id !== actor.id) return fail(403, 'forbidden', 'Reauthentication failed');
        await users.requestDeletion(actor);
        return message;
      },
      { body: t.Object({ password: t.String({ minLength: 1 }) }) },
    )
    .post(
      '/groups',
      ({ actor, body, headers }) => groups.create(actor, body.name, body.description ?? '', key(headers)).then(ok),
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          description: t.Optional(t.String({ maxLength: 2000 })),
        }),
        detail: documented(groupCreatedResultDto),
      },
    )
    .get('/groups', ({ actor, query }) => groups.list(actor, query.limit ?? 20, query.cursor).then(ok), {
      query: pagination,
      detail: documented(groupPageResultDto),
    })
    .get('/groups/:id', ({ actor, params }) => groups.get(actor, params.id).then(ok), {
      params: idParams,
      detail: documented(groupResultDto),
    })
    .patch(
      '/groups/:id',
      ({ actor, params, body }) => groups.update(actor, params.id, body.name, body.description).then(ok),
      {
        params: idParams,
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 120 }),
          description: t.String({ maxLength: 2000 }),
        }),
      },
    )
    .post('/groups/:id/archive', ({ actor, params }) => groups.archive(actor, params.id).then(() => message), {
      params: idParams,
    })
    .post('/groups/:id/leave', ({ actor, params }) => groups.leave(actor, params.id).then(() => message), {
      params: idParams,
    })
    .post(
      '/groups/:id/transfer',
      ({ actor, params, body }) => groups.transfer(actor, params.id, body.newOwnerId).then(() => message),
      { params: idParams, body: t.Object({ newOwnerId: uuid }) },
    )
    .delete(
      '/groups/:id/members/:userId',
      ({ actor, params }) => groups.remove(actor, params.id, params.userId).then(() => message),
      { params: t.Object({ id: uuid, userId: uuid }) },
    )
    .post(
      '/groups/:id/invitations',
      ({ actor, params, body, request, server }) => {
        authLimit(request, server, 'invite');
        return groups.invite(actor, params.id, body.expiresInHours).then(ok);
      },
      { params: idParams, body: t.Object({ expiresInHours: t.Integer({ minimum: 1, maximum: 168 }) }) },
    )
    .delete(
      '/groups/:id/invitations/:inviteId',
      ({ actor, params }) => groups.revokeInvite(actor, params.id, params.inviteId).then(() => message),
      { params: t.Object({ id: uuid, inviteId: uuid }) },
    )
    .post(
      '/invitations/accept',
      ({ actor, body, request, server }) => {
        authLimit(request, server, 'invite-accept');
        return groups.acceptInvite(actor, body.token).then(ok);
      },
      {
        body: t.Object({ token: t.String({ minLength: 32, maxLength: 128 }) }),
      },
    )
    .post(
      '/groups/:id/challenges',
      ({ actor, params, body, headers }) => challenges.create(actor, params.id, body, key(headers)).then(ok),
      { params: groupParams, body: challengeInput, detail: documented(idResultDto) },
    )
    .get(
      '/groups/:id/challenges',
      ({ actor, params, query }) => challenges.list(actor, params.id, query.limit ?? 20, query.cursor).then(ok),
      { params: groupParams, query: pagination },
    )
    .get('/challenges/:challengeId', ({ actor, params }) => challenges.get(actor, params.challengeId).then(ok), {
      params: challengeParams,
    })
    .patch(
      '/challenges/:challengeId',
      ({ actor, params, body }) => challenges.updateDraft(actor, params.challengeId, body).then(ok),
      { params: challengeParams, body: challengeInput },
    )
    .post(
      '/challenges/:challengeId/publish',
      ({ actor, params }) => challenges.publish(actor, params.challengeId).then(ok),
      { params: challengeParams },
    )
    .post(
      '/challenges/:challengeId/cancel',
      ({ actor, params }) => challenges.cancel(actor, params.challengeId).then(() => message),
      { params: challengeParams },
    )
    .post(
      '/challenges/:challengeId/submissions',
      ({ actor, params, body, headers, request, server }) => {
        authLimit(request, server, 'submission');
        return submissions.submit(actor, params.challengeId, body, key(headers)).then(ok);
      },
      { params: challengeParams, body: proofInput, detail: documented(acceptedResultDto) },
    )
    .get(
      '/challenges/:challengeId/submissions/me',
      ({ actor, params }) => submissions.own(actor, params.challengeId).then(ok),
      { params: challengeParams },
    )
    .delete(
      '/challenges/:challengeId/submissions/me',
      ({ actor, params }) => submissions.deleteOwn(actor, params.challengeId).then(() => message),
      { params: challengeParams },
    )
    .get(
      '/challenges/:challengeId/feed',
      ({ actor, params, query }) =>
        submissions.feed(actor, params.challengeId, query.limit ?? 20, query.cursor).then(ok),
      { params: challengeParams, query: pagination, detail: documented(feedResultDto) },
    )
    .post(
      '/challenges/:challengeId/uploads',
      ({ actor, params, request, server }) => {
        authLimit(request, server, 'upload');
        return media.upload(actor, params.challengeId, request).then(ok);
      },
      { params: challengeParams, parse: 'none' },
    )
    .get('/attachments/:id', ({ actor, params }) => media.read(actor, params.id), { params: idParams })
    .delete('/attachments/:id', ({ actor, params }) => media.removeAbandoned(actor, params.id).then(() => message), {
      params: idParams,
    })
    .post(
      '/submissions/:submissionId/comments',
      ({ actor, params, body }) => engagement.addComment(actor, params.submissionId, body.body).then(ok),
      { params: submissionParams, body: t.Object({ body: t.String({ minLength: 1, maxLength: 2000 }) }) },
    )
    .get(
      '/submissions/:submissionId/comments',
      ({ actor, params, query }) =>
        engagement.listComments(actor, params.submissionId, query.limit ?? 20, query.cursor).then(ok),
      { params: submissionParams, query: pagination },
    )
    .delete('/comments/:id', ({ actor, params }) => engagement.deleteComment(actor, params.id).then(() => message), {
      params: idParams,
    })
    .post(
      '/submissions/:submissionId/reactions',
      ({ actor, params, body }) => engagement.addReaction(actor, params.submissionId, body.emoji).then(() => message),
      {
        params: submissionParams,
        body: t.Object({ emoji: t.Union([t.Literal('like'), t.Literal('heart'), t.Literal('clap')]) }),
      },
    )
    .delete(
      '/submissions/:submissionId/reactions/:emoji',
      ({ actor, params }) => engagement.removeReaction(actor, params.submissionId, params.emoji).then(() => message),
      {
        params: t.Object({
          submissionId: uuid,
          emoji: t.Union([t.Literal('like'), t.Literal('heart'), t.Literal('clap')]),
        }),
      },
    )
    .get(
      '/submissions/:submissionId/reactions',
      ({ actor, params }) => engagement.listReactions(actor, params.submissionId).then(ok),
      { params: submissionParams },
    )
    .post('/blocks', ({ actor, body }) => safety.block(actor, body.userId).then(() => message), {
      body: t.Object({ userId: uuid }),
    })
    .delete('/blocks/:id', ({ actor, params }) => safety.unblock(actor, params.id).then(() => message), {
      params: idParams,
    })
    .post(
      '/reports/users/:id',
      ({ actor, params, body }) => safety.reportUser(actor, params.id, body.reason).then(ok),
      { params: idParams, body: t.Object({ reason: t.String({ minLength: 1, maxLength: 2000 }) }) },
    )
    .post(
      '/reports/submissions/:id',
      ({ actor, params, body }) => safety.reportSubmission(actor, params.id, body.reason).then(ok),
      { params: idParams, body: t.Object({ reason: t.String({ minLength: 1, maxLength: 2000 }) }) },
    )
    .get('/moderation/reports', ({ actor, query }) => safety.listReports(actor, query.limit ?? 20).then(ok), {
      query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })) }),
    })
    .post(
      '/moderation/reports/:id/review',
      ({ actor, params, body }) => safety.review(actor, params.id, body.state).then(ok),
      { params: idParams, body: t.Object({ state: t.Union([t.Literal('dismissed'), t.Literal('actioned')]) }) },
    )
    .get('/moderation/submissions/:id', ({ actor, params }) => safety.readReportedProof(actor, params.id).then(ok), {
      params: idParams,
    })
    .get('/moderation/attachments/:id', ({ actor, params }) => media.moderatedRead(actor, params.id), {
      params: idParams,
    })
    .get('/groups/:id/entitlement', ({ actor, params }) => billing.entitlement(actor, params.id).then(ok), {
      params: groupParams,
    })
    .post('/groups/:id/upgrade-intents', ({ actor, params }) => billing.createIntent(actor, params.id).then(ok), {
      params: groupParams,
    })
    .post(
      '/upgrade-intents/:id/reconcile',
      ({ actor, params, body }) => billing.reconcileIntent(actor, params.id, body.subscriptionId).then(ok),
      { params: idParams, body: t.Object({ subscriptionId: t.String({ minLength: 1, maxLength: 500 }) }) },
    );
  return new Elysia()
    .use(openapi({ path: '/v1/openapi' }))
    .onRequest(({ request, set }) => {
      set.headers['x-request-id'] = crypto.randomUUID();
      const path = new URL(request.url).pathname;
      const maximum = path.endsWith('/uploads')
        ? config.maxImageBytes
        : path === '/v1/billing/webhook'
          ? 256_000
          : 64_000;
      const length = Number(request.headers.get('content-length'));
      if (length > maximum) fail(413, 'bad_request', 'Request too large');
    })
    .onAfterHandle(({ request, set }) => {
      console.info(
        JSON.stringify({
          event: 'request',
          requestId: set.headers['x-request-id'],
          method: request.method,
          path: new URL(request.url).pathname,
          status: set.status ?? 200,
        }),
      );
    })
    .onError(({ error, set, code, request }) => {
      const known = isAppError(error);
      set.status = known ? error.status : code === 'VALIDATION' ? 400 : 500;
      console.warn(
        JSON.stringify({
          event: 'request_error',
          requestId: set.headers['x-request-id'],
          method: request.method,
          path: new URL(request.url).pathname,
          status: set.status,
        }),
      );
      return {
        error: {
          code: known ? error.code : code === 'VALIDATION' ? 'bad_request' : 'internal_error',
          message: known ? error.message : code === 'VALIDATION' ? 'Invalid request' : 'Internal server error',
          requestId: set.headers['x-request-id'],
        },
      };
    })
    .get('/v1/live', () => ok({ status: 'live' }))
    .get('/v1/ready', async () => {
      await db.execute(sql`select 1`);
      return ok({ status: 'ready' });
    })
    .post(
      '/v1/billing/webhook',
      async ({ request }) => {
        await billing.webhook(await request.text(), request.headers.get('x-revenuecat-webhook-signature'));
        return message;
      },
      { parse: 'none' },
    )
    .use(publicRoutes)
    .use(protectedRoutes);
};
export type App = ReturnType<typeof createApp>;
