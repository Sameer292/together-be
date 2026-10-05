import { openapi } from '@elysia/openapi';
import type { Database } from '@infra/database/database.client';
import { Elysia } from 'elysia';
import type { Config } from './config/env';
import { createDependencies } from './dependencies';
import { createRequestLifecycle } from './middleware/request-lifecycle';
import { createRoutes } from './routes';
import { createHealthRoutes } from './routes/health.routes';

export const createApp = (config: Config, db: Database) =>
  new Elysia({ prefix: '/v1' })
    .use(createRequestLifecycle(config))
    .use(
      openapi({
        path: '/openapi',
        documentation: { info: { title: 'Together API', version: '0.1.0' } },
      }),
    )
    .use(createHealthRoutes(db))
    .use(createRoutes(createDependencies(config, db)));

export type App = ReturnType<typeof createApp>;
