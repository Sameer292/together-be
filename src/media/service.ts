import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { Actor } from '../auth/service';
import type { Config } from '../config';
import type { Database } from '../db';
import { attachments, auditEvents, blocks, groups, jobs, reports } from '../db/schema';
import { fail } from '../errors';
import { participantAccess, submissionAccess } from '../submissions/access';

export const createMediaService = (db: Database, config: Config) => {
  const localPath = (key: string): string => {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/.test(key)) throw new Error('Invalid object key');
    return join(config.localMediaDir, key);
  };
  const objectUrl = (key: string, authenticated = false): string =>
    `${config.supabaseUrl}/storage/v1/object/${authenticated ? 'authenticated/' : ''}${encodeURIComponent(config.storageBucket)}/${key}`;
  const storageHeaders = {
    apikey: config.supabaseServiceKey,
    ...(config.supabaseServiceKey.startsWith('sb_secret_')
      ? {}
      : { Authorization: `Bearer ${config.supabaseServiceKey}` }),
  };
  const deleteObject = async (key: string): Promise<void> => {
    if (config.providerMode === 'local') {
      await rm(localPath(key), { force: true });
      return;
    }
    const response = await fetch(
      `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(config.storageBucket)}`,
      {
        method: 'DELETE',
        headers: { ...storageHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [key] }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok && response.status !== 404) return fail(503, 'unavailable', 'Storage cleanup failed');
  };
  const readObject = async (key: string, mimeType: string): Promise<Response> => {
    if (config.providerMode === 'local') {
      const file = Bun.file(localPath(key));
      if (!(await file.exists())) return fail(503, 'unavailable', 'Storage unavailable');
      return new Response(file, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    const storage = await fetch(objectUrl(key, true), {
      headers: storageHeaders,
      signal: AbortSignal.timeout(15000),
    });
    if (!storage.ok || !storage.body) return fail(503, 'unavailable', 'Storage unavailable');
    return new Response(storage.body, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  };
  return {
    upload: async (actor: Actor, challengeId: string, request: Request) => {
      const challenge = await participantAccess(db, challengeId, actor.id);
      if (challenge.cancelledAt) return fail(409, 'conflict', 'Challenge cancelled');
      const [group] = await db
        .select({ archivedAt: groups.archivedAt })
        .from(groups)
        .where(eq(groups.id, challenge.groupId));
      if (!group || group.archivedAt) return fail(409, 'conflict', 'Group archived');
      const length = Number(request.headers.get('content-length'));
      if (!Number.isSafeInteger(length) || length < 1 || length > config.maxImageBytes)
        return fail(413, 'bad_request', 'Image too large');
      if (!request.body) return fail(400, 'bad_request', 'Image required');
      const reader = request.body.getReader();
      const timeout = AbortSignal.timeout(30000);
      const cancel = (): void => {
        void reader.cancel().catch(() => undefined);
      };
      timeout.addEventListener('abort', cancel, { once: true });
      request.signal.addEventListener('abort', cancel, { once: true });
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > config.maxImageBytes) {
            await reader.cancel();
            return fail(413, 'bad_request', 'Image too large');
          }
          chunks.push(value);
        }
      } catch (error: unknown) {
        if (timeout.aborted || request.signal.aborted) return fail(408, 'bad_request', 'Upload interrupted');
        throw error;
      } finally {
        timeout.removeEventListener('abort', cancel);
        request.signal.removeEventListener('abort', cancel);
      }
      if (timeout.aborted || request.signal.aborted) return fail(408, 'bad_request', 'Upload interrupted');
      if (!total) return fail(400, 'bad_request', 'Image required');
      const original = Buffer.concat(chunks);
      const info = await sharp(original, { failOn: 'error', limitInputPixels: 20_000_000 })
        .metadata()
        .catch(() => null);
      if (
        !info ||
        !['jpeg', 'png', 'webp'].includes(info.format ?? '') ||
        !info.width ||
        !info.height ||
        info.width * info.height > 20_000_000
      )
        return fail(415, 'bad_request', 'Unsupported image');
      const encoded = await sharp(original, { failOn: 'error', limitInputPixels: 20_000_000 })
        .rotate()
        .webp({ quality: 82 })
        .toBuffer();
      if (encoded.byteLength > config.maxImageBytes) return fail(413, 'bad_request', 'Image too large');
      const attachmentId = crypto.randomUUID();
      const key = `${actor.id}/${attachmentId}.webp`;
      await db.insert(attachments).values({
        id: attachmentId,
        ownerId: actor.id,
        groupId: challenge.groupId,
        challengeId,
        objectKey: key,
        mimeType: 'image/webp',
        byteSize: encoded.byteLength,
        state: 'staged',
      });
      try {
        if (config.providerMode === 'local') {
          const path = localPath(key);
          await mkdir(join(config.localMediaDir, actor.id), { recursive: true });
          await writeFile(path, encoded, { flag: 'wx' });
        } else {
          const response = await fetch(objectUrl(key), {
            method: 'POST',
            headers: { ...storageHeaders, 'Content-Type': 'image/webp', 'x-upsert': 'false' },
            body: encoded,
            signal: AbortSignal.timeout(30000),
          });
          if (!response.ok) return fail(503, 'unavailable', 'Storage upload failed');
        }
        await db
          .update(attachments)
          .set({ state: 'ready' })
          .where(and(eq(attachments.id, attachmentId), eq(attachments.state, 'staged')));
      } catch (error: unknown) {
        await db.transaction(async (tx) => {
          await tx.update(attachments).set({ state: 'deletion_pending' }).where(eq(attachments.id, attachmentId));
          await tx
            .insert(jobs)
            .values({
              kind: 'delete_attachment',
              dedupeKey: `delete_attachment:${attachmentId}`,
              payload: { attachmentId },
            })
            .onConflictDoNothing();
        });
        throw error;
      }
      return { id: attachmentId, byteSize: encoded.byteLength, mimeType: 'image/webp' };
    },
    read: async (actor: Actor, attachmentId: string): Promise<Response> => {
      const [attachment] = await db
        .select({
          id: attachments.id,
          ownerId: attachments.ownerId,
          submissionId: attachments.submissionId,
          challengeId: attachments.challengeId,
          objectKey: attachments.objectKey,
          mimeType: attachments.mimeType,
          state: attachments.state,
        })
        .from(attachments)
        .where(eq(attachments.id, attachmentId));
      if (attachment?.state !== 'attached' || !attachment.submissionId)
        return fail(404, 'not_found', 'Attachment not found');
      const submission = await submissionAccess(db, attachment.submissionId, actor.id);
      if (submission.userId !== actor.id) {
        const blocked = await db.query.blocks.findFirst({
          where: sql`(${blocks.blockerId} = ${actor.id} and ${blocks.blockedId} = ${submission.userId}) or (${blocks.blockerId} = ${submission.userId} and ${blocks.blockedId} = ${actor.id})`,
        });
        if (blocked) return fail(404, 'not_found', 'Attachment not found');
      }
      return readObject(attachment.objectKey, attachment.mimeType);
    },
    moderatedRead: async (actor: Actor, attachmentId: string): Promise<Response> => {
      if (!actor.moderationRole) return fail(403, 'forbidden', 'Moderator required');
      const [attachment] = await db
        .select({
          submissionId: attachments.submissionId,
          objectKey: attachments.objectKey,
          mimeType: attachments.mimeType,
          state: attachments.state,
        })
        .from(attachments)
        .where(eq(attachments.id, attachmentId));
      if (attachment?.state !== 'attached' || !attachment.submissionId)
        return fail(404, 'not_found', 'Attachment not found');
      const report = await db.query.reports.findFirst({
        where: eq(reports.submissionId, attachment.submissionId),
        columns: { id: true },
      });
      if (!report) return fail(404, 'not_found', 'Report not found');
      await db
        .insert(auditEvents)
        .values({ actorId: actor.id, targetId: attachmentId, action: 'moderation.attachment_read' });
      return readObject(attachment.objectKey, attachment.mimeType);
    },
    removeAbandoned: async (actor: Actor, attachmentId: string): Promise<void> =>
      db.transaction(async (tx) => {
        const [row] = await tx
          .update(attachments)
          .set({ state: 'deletion_pending' })
          .where(
            and(eq(attachments.id, attachmentId), eq(attachments.ownerId, actor.id), eq(attachments.state, 'ready')),
          )
          .returning({ id: attachments.id });
        if (!row) return fail(404, 'not_found', 'Upload not found');
        await tx
          .insert(jobs)
          .values({
            kind: 'delete_attachment',
            dedupeKey: `delete_attachment:${attachmentId}`,
            payload: { attachmentId },
          })
          .onConflictDoNothing();
      }),
    deleteObject,
  };
};
