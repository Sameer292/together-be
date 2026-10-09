# Durable jobs

Run `bun run worker` beside the API. Jobs live in PostgreSQL, are claimed with `FOR UPDATE SKIP LOCKED`, and receive a two-minute lease. After a crash the lease expires and another worker retries. Failures back off exponentially up to five attempts; terminal failures remain visible in `jobs.failed_at` and `jobs.last_error` for operator repair. Dedupe keys prevent duplicate domain side effects; external delivery remains best effort.

Submission notifications are currently sent to a test transport that logs only generic activity, never hidden proof. Image cleanup finds ready uploads older than 24 hours, marks them deletion-pending, and removes private objects. Account deletion and RevenueCat reconciliation also run here. The hourly cleanup schedule is persisted as jobs; a process timer is used only to poll for due jobs, not to hold business deadlines.
