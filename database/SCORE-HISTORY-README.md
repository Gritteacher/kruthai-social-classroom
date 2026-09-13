# Score history

Apply `score-entry-history.sql` to the existing production database before deploying
the history tab. The same migration is appended to `supabase-schema.sql`.

The migration briefly locks score writes to install an AFTER INSERT/UPDATE/DELETE
trigger and seed one baseline per existing score entry. It never changes scores.
Repeat installation does not duplicate baselines. A failed audit insert fails the
score transaction too, so a successful score write cannot silently lose its audit.

Only teachers can SELECT history through RLS. Clients, including service_role,
have no direct INSERT/UPDATE/DELETE/TRUNCATE permission. The trigger writes under
its database owner. It records auth.uid() and the trusted profile name; database
maintenance without a user token is labeled system, not attributed to a teacher.
Database owners can still alter the log; it is not a cryptographic audit ledger.

History has no cascading foreign keys. Label snapshots and baselines preserve
context when a student or assignment is deleted. Deleting the log from the app
is deliberately unsupported. Changes to updated_at or source metadata alone do
not create noisy score events. Status and raw/final score/max changes do.

Baselines are installation snapshots, not reconstructed past changes. The page
shows changes by default; enable the baseline checkbox to view starting values.
Pagination uses timestamp plus UUID keysets, retaining PostgreSQL microseconds.
The page is read-only and does not restore or overwrite any score.

Tests: `node --experimental-strip-types --test tests/score-history.test.mjs tests/score-history-db.test.mjs`.
The database tests use isolated in-memory PostgreSQL (PGlite), not production data.
