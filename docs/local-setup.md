# Local setup

Use Bun 1.4.2 and PostgreSQL 15+. Create a localhost database named `together_dev` plus an isolated `together_test`. Set the two database URLs in `.env`; migration access must be separate from the runtime role. Run `bun install --frozen-lockfile` and `bun run db:migrate`, then start API and worker in separate terminals. Run `bun run db:seed` only if you want synthetic rows. The seed profile is not a Supabase Auth login.

In Supabase, enable email confirmation and password recovery, set custom email templates to show `{{ .Token }}` instead of placing credentials in links, and configure a **private** Storage bucket matching `STORAGE_BUCKET`. Keep the anon key (used solely for server Auth requests), service key, and database credentials in server/worker secrets. Turn off the project Data API under Project Settings → Data API. This is an external dashboard action; the repository cannot perform it. Do not give the mobile app direct Supabase credentials or endpoints.

Use `TEST_DATABASE_URL=postgres://...@localhost:5432/together_test bun test` for transactional coverage. The tests run Drizzle migrations on that database and reject non-local or non-`_test` names. Never point them at production.
