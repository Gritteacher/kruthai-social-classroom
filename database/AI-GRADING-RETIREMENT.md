# AI grading retired

Run `retire-ai-grading.sql` once in the production Supabase SQL editor. It is
idempotent and is also included at the end of `supabase-schema.sql`.

The migration removes the AI score-writing RPC and worksheet review trigger,
and revokes writes to the legacy AI-only tables, including the service role.
This also blocks workers from old deployment URLs. It does not delete scores,
submissions, student files, worksheet answers, or archived AI feedback.

Deploy the current frontend and Netlify function bundle. Both old grading URLs
must return HTTP 404 because the two workers are no longer deployed. Reserved
`/.netlify/functions/` paths cannot be redirected through `netlify.toml`.

Manual teacher grading and its score synchronization remain unchanged.
The AI chat assistant remains available. Keep its existing server-only gateway
credentials and `AI_GRADING_MODEL` variable (the chat assistant still uses this
legacy model variable name). Never restore the retired grading SQL or workers.
