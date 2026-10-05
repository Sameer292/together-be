# Backend agent conventions

## Scope and architecture
- Build with strict TypeScript, ElysiaJS on Bun, Drizzle ORM, and Supabase PostgreSQL. Supabase Auth and Storage are accessed server-side.
- The backend owns all database access and application rules. Expose API endpoints for authentication, refresh, uploads, media, and product operations; do not require direct Supabase access from the app.
- Disable the Supabase Data API when using PostgreSQL connections exclusively. Keep credentials server-side and use a least-privileged runtime database role, separate from migrations/admin access.
- Keep one modular application initially. Organize by feature: routes validate/dispatch, services coordinate rules, repositories query data. Workers reuse the same services.
- Groups define their challenges. Do not hardcode unapproved audience restrictions, membership limits, pricing, or proof formats.

## TypeScript and naming
- Use arrow functions exclusively, including handlers and callbacks. Never define functions with the `function` keyword. Avoid classes; use plain objects and composition.
- Explicitly type parameters, return values, and contracts. Allow contextual typing for inline callbacks and inference for obvious locals.
- Use `type` aliases, `import type`, and named exports. No `any`, `@ts-ignore`, non-null assertions, or unchecked casts; validate and narrow `unknown`.
- Use PascalCase for types, camelCase for code identifiers, and snake_case for database identifiers. Name files consistently with the repository.
- Keep modules focused, dependencies explicit, and configuration centralized. Avoid speculative frameworks and unrelated refactors.

## Elysia structure
- Follow the layout and route composition of `/home/iamsameer/Projects/HashTag/E-Commerce-BE`. Keep server startup in `src/index.ts`, application composition in `src/app/app.ts`, configuration in `src/app/config`, middleware in `src/app/middleware`, and API aggregators in `src/app/routes`.
- Put feature code in `src/modules/<feature>` with descriptive `<feature>.service.ts`, `<feature>.repository.ts`, and `<feature>.model.ts` names. Audience-specific `*.routes.ts` files compose individual endpoint plugins from their `routes/` folder using chained `.use(...)` calls. Place database/provider infrastructure in `src/infrastructure` and cross-feature helpers in `src/shared`.
- Use chained Elysia instances with inline arrow handlers and schemas imported from feature models. Protected endpoint plugins explicitly `.use(authGuard)`; shared logging/error hooks are global, while authentication stays scoped. Use the configured `@/`, `@modules/`, `@infra/`, and `@shared/` aliases.
- Keep configuration/database injection at application composition so tests and tools can create an app without listening or opening production connections. Preserve Together's `/v1` contract rather than copying the reference project's URL prefixes or domain roles.

## API and authorization
- Validate request bodies, parameters, queries, environment variables, and external payloads at runtime. Explicitly select response fields; never return raw database rows by default.
- Verify tokens using supported verification libraries. Derive actor identity from verified credentials; never trust client-supplied identity or role claims.
- Authorize every operation against current membership and resource ownership. Check proof visibility across submissions, attachments, comments, notifications, and realtime events.
- Use consistent errors and HTTP statuses; hide internals from clients. Add request IDs and structured logs without tokens, private proof, or personal payloads.
- Bound pagination, uploads, and expensive requests. Apply rate limits to authentication, invitations, submissions, and uploads.
- Preserve compatibility with released mobile versions. Shared TypeScript contracts do not make breaking API changes safe.

## Data and reliability
- Use reviewed Drizzle queries and parameterized SQL. Track schema changes in migrations; never edit production schemas manually or run destructive migrations without explicit authorization.
- Enforce integrity through foreign keys, unique/check constraints, and transactions. Capacity checks and joins, submission acceptance, and entitlement changes must remain correct under concurrency.
- Use database time for authoritative deadlines and timezone-aware timestamps. Do not persist critical state only in memory.
- Make retryable mutations and billing webhooks idempotent. Verify webhook authenticity; handle duplicate/out-of-order events and bind upgrades to the selected group.
- Persist background jobs with bounded retries. Do not rely on process timers for reminders. Publish side effects after successful commits, using durable outbox records where needed.
- Keep media private; validate size/type, authorize retrieval, and clean up abandoned uploads. Direct SQL does not automatically apply a user's Supabase identity or RLS context.

## Verification and documentation
- Run repository formatting, linting, type checks, relevant tests, and migration checks before committing.
- Test authorization denials, hidden-proof access, concurrent capacity/submission operations, webhook retries, and changed deadline behavior where applicable. Use isolated test data; never production data.
- Maintain API/OpenAPI documentation, `.env.example`, setup instructions, migration notes, and focused `docs/` pages. Record meaningful architecture decisions briefly.
- Document what changed, why, configuration, verification, and operational impact. State any checks that could not run; never claim unperformed validation.

## Git and delivery
- Inspect Git status and applicable instructions first. Create `feat/<short-name>` or `fix/<short-name>` before a new feature/fix; resume an existing task branch when appropriate. Never work directly on the default branch.
- Preserve user changes and stage only task-related files. Never discard work, rewrite history, or force-push without explicit authorization.
- Commit coherent, checked changes with descriptive messages, such as `fix(groups): enforce capacity atomically`. Review the staged diff; never commit secrets or knowingly broken work.
- Finish with changes, documentation, validation results, migration/configuration notes, branch, and commit hashes. Commit locally; push or merge only when requested.
