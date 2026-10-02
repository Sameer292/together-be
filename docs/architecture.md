# Architecture and authorization

The API and worker share Drizzle schema and service modules. Elysia validates HTTP input and dispatches; services enforce rules using Drizzle queries and transactions. Supabase Auth supplies verified identity; direct PostgreSQL connections do not inherit Supabase RLS user identity. The backend never exposes Storage object keys or direct Storage URLs.

`memberships` records every join generation. Only one active row per group/user is allowed. Group row locks serialize invitation joins, departures, owner changes, publication, submission finalization, and sponsorship changes where needed. Publication inserts `challenge_participants` in the same transaction. `participantAccess` requires the snapshot membership ID to equal the actor's current active membership ID. `revealAccess` additionally requires an accepted, undeleted submission. Feed, attachment, comment, and reaction reads call these checks; blocks filter both directions. Previously downloaded content cannot be recalled.

Accepted proof and attachment state changes commit together. The deadline check uses PostgreSQL `clock_timestamp()` after group and challenge locks; uploading earlier does not reserve eligibility. Idempotency keys are stored with actor, operation, request hash, and result ID under a transaction advisory lock. Jobs use `FOR UPDATE SKIP LOCKED` and leases; side effects are enqueued inside domain transactions.

Cancellation and archive keep history. See [assumptions](assumptions.md) for reads and mutations. Moderator proof reads are separate from ordinary feed authorization, require the database moderation flag, require an existing report, and append an audit event. The flag must be granted only by an administrator with migration credentials; no API can self-grant it.
