# Together backend

Bun + Elysia API and worker for private group challenges. PostgreSQL is the source of application state. Local development can use PostgreSQL and disk only, or Supabase Auth/Storage with local PostgreSQL. Mobile code is outside this repository.

## Local start

1. Run `bun install --frozen-lockfile` and `docker compose -f compose.local.yml up -d --wait`.
2. Run `cp .env.example .env` and `bun run db:migrate`.
3. Run `bun run dev` and, in another terminal, `bun run worker`. See [local setup](docs/local-setup.md) for Auth and Supabase options.
4. Visit `/v1/live`, `/v1/ready`, and `/v1/openapi` (JSON: `/v1/openapi/json`). [Generated snapshot](docs/openapi.json) is committed.

`bun run build`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test`, and `bun run api:generate` validate the code. `.env.example` sets `TEST_DATABASE_URL` to the isolated Compose test database. Without a local `_test` URL, transactional tests are skipped. `bun run db:seed` creates synthetic local data only in a localhost database ending in `_dev`.

## Code structure

`src/index.ts` starts the server; `src/app/app.ts` composes the API. `src/app/routes` combines public, member, and moderation routes. Features live in `src/modules`, with named service/model files and individual Elysia endpoint plugins composed by audience-specific route files. Configuration and middleware live under `src/app`; database code lives in `src/infrastructure/database`; cross-feature helpers live in `src/shared`. See [architecture](docs/architecture.md) for dependency and hook scope conventions.

## API conventions

All product endpoints use `/v1`. Successful JSON responses use `{ "data": ... }`; failures use `{ "error": { "code", "message", "requestId" } }`. The server also returns `x-request-id`. Authenticated calls send the current provider's access token in `Authorization: Bearer ...`; the backend verifies it. Create group, create challenge, and submit proof require `Idempotency-Key` (8–128 characters). List endpoints accept `limit` (1–50) and a UUID cursor; `nextCursor` is null at the end. Upload sends a raw image request body with `Content-Length`; downloads stream through the backend with `Cache-Control: private, no-store`.

Common statuses: 200 success, 400 invalid input, 401 unauthenticated, 403 ineligible or not revealed, 404 unavailable resource, 408 interrupted upload, 409 state conflict, 413 oversized upload, 415 unsupported image, 429 rate limited, 500 unexpected server failure, 503 dependency failure. Provider errors and private proof are not logged or returned.

## Operating notes

[Architecture](docs/architecture.md) · [Assumptions](docs/assumptions.md) · [Auth callbacks](docs/auth-callbacks.md) · [Migrations](docs/migrations.md) · [Billing](docs/billing.md) · [Jobs](docs/jobs.md) · [Account deletion](docs/account-deletion.md) · [Deployment](docs/deployment.md)
