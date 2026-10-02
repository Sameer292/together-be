# Together backend

Bun + Elysia API and worker for private group challenges. PostgreSQL is the source of application state; Supabase Auth and private Storage are called only by the backend. Mobile code is outside this repository.

## Local start

1. Provision separate local `together_dev` and `together_test` PostgreSQL databases. See [local setup](docs/local-setup.md).
2. Copy `.env.example` to `.env` and fill every required value. Example policy numbers are local fixtures; choose production limits explicitly.
3. Run `bun install --frozen-lockfile`, `bun run db:migrate`, `bun run dev`, and separately `bun run worker`.
4. Visit `/v1/live`, `/v1/ready`, and `/v1/openapi` (JSON: `/v1/openapi/json`). [Generated snapshot](docs/openapi.json) is committed.

`bun run build`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test`, and `bun run api:generate` validate the code. Set `TEST_DATABASE_URL` to an isolated localhost database ending in `_test` to run transactional tests; otherwise those tests are explicitly skipped. `bun run db:seed` creates synthetic local data only in a localhost database ending in `_dev`.

## API conventions

All product endpoints use `/v1`. Successful JSON responses use `{ "data": ... }`; failures use `{ "error": { "code", "message", "requestId" } }`. The server also returns `x-request-id`. Authenticated calls send a Supabase access token in `Authorization: Bearer ...`; the backend verifies it with Supabase Auth. Create group, create challenge, and submit proof require `Idempotency-Key` (8–128 characters). List endpoints accept `limit` (1–50) and an opaque UUID cursor; `nextCursor` is null at the end. Upload sends a raw image request body with `Content-Length`; downloads stream through the backend with `Cache-Control: private, no-store`.

Common statuses: 200 success, 400 invalid input, 401 unauthenticated, 403 ineligible or not revealed, 404 unavailable resource, 408 interrupted upload, 409 state conflict, 413 oversized upload, 415 unsupported image, 429 rate limited, 500 unexpected server failure, 503 dependency failure. Provider errors and private proof are not logged or returned.

## Operating notes

[Architecture](docs/architecture.md) · [Assumptions](docs/assumptions.md) · [Auth callbacks](docs/auth-callbacks.md) · [Migrations](docs/migrations.md) · [Billing](docs/billing.md) · [Jobs](docs/jobs.md) · [Account deletion](docs/account-deletion.md) · [Deployment](docs/deployment.md)
