# Deployment and recovery runbook

## Release order

1. Create a database backup before every schema release.
2. Apply pending files from `supabase/migrations` to a staging project.
3. Run `npm run check` locally and `npm run test:staging` against staging.
4. Apply the same migrations to production.
5. Deploy the frontend and Netlify Functions only after the database succeeds.
6. Test teacher login, student login, one score save, one submission preview and one file download.

Never commit database passwords, service-role keys, test-account passwords or backup files.

## Database backup

Use the connection string from Supabase Database settings through an environment variable:

```bash
export SUPABASE_DATABASE_URL='postgresql://...'
mkdir -p "$HOME/Backups/kruthai-classroom"
pg_dump "$SUPABASE_DATABASE_URL" \
  --format=custom \
  --no-owner \
  --file="$HOME/Backups/kruthai-classroom/database-$(date +%Y%m%d-%H%M%S).dump"
```

Encrypt the dump and keep the encrypted copy outside the computer that runs the application. Do not use a Git repository as backup storage.

## Storage backup

Database dumps do not contain Supabase Storage objects. Export the `classroom-files` bucket separately and retain its object paths alongside the database backup. The database table `storage_cleanup_queue` is operational state, not a replacement for a file backup.

## Restore drill

At least once per school term, restore the latest dump into an empty staging project and verify:

- classroom and student counts
- score totals for a known test student
- one teaching material download
- one submission file preview
- teacher and student RLS using `npm run test:staging`

Never test a restore by overwriting production.

## Required deployment configuration

Netlify requires `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY`. AI chat additionally requires `AI_GATEWAY_API_KEY`. GitHub staging smoke tests use the six `STAGING_*` variables listed in `.github/workflows/ci.yml`.
