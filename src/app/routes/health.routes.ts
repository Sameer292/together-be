import type { Database } from '@infra/database/database.client';
import { ok } from '@shared/utils/response';
import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';

export const createHealthRoutes = (db: Database) =>
  new Elysia({ tags: ['Health'] })
    .get('/live', () => ok({ status: 'live' }))
    .get('/ready', async () => {
      await db.execute(sql`select 1`);
      return ok({ status: 'ready' });
    });
