# Classroom AI Assistant

Run `ai-assistant-history.sql` before deploying the persistent chat feature.
Also apply `teacher-settings.sql` for teacher-configurable chat preferences.
Re-running it is safe. The earlier `ai-assistant.sql` usage table is retained
for historical counts only; the endpoint no longer calls its quota RPC.

Server environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, optional `AI_GATEWAY_URL`
and `AI_GRADING_MODEL`. Never expose a service or AI key with a VITE prefix.

All classroom reads use the verified caller's access token and existing RLS.
Student selectors from the request are ignored for student accounts. The admin
client only writes chat exchanges after verifying the user's access token.
The app imposes no daily question quota. Provider limits and credits still apply.
There is a 6,000-character per-message safety bound. New clients submit a job
to the authenticated starter and poll their own exchange via RLS. The signed
background worker allows up to 150 seconds for the provider; legacy synchronous
requests retain a 45-second timeout. The browser can recover persisted replies
after a proxy/network failure and does not automatically resend a question.
Jobs are atomically claimed to prevent duplicate provider calls. Job signatures
bind the exchange ID, user token and expiry using the server service key. Neither
the signature nor token is stored in the exchange. Deploy `ai-assistant-background`
with the same PDF native dependencies as `ai-assistant`. No new secrets or SQL
are required. The newest 16 completed exchanges supply model context. User-supplied
history is ignored. Conversation IDs are always scoped to the authenticated user.

Questions, answers, timestamps, author identity, score snapshots and failures
are stored in `ai_assistant_exchanges`. RLS allows students to read only their
own exchanges; teachers can read all exchanges in the explicit history tab.
Only the server can insert/update logs. The chat displays a recording notice
before sending. New conversations do not delete existing history.
No pre-existing browser-only conversations can be recovered retroactively.
The chat view resumes the latest 100 exchanges; the history browser has paging
for older exchanges. Teachers can filter by name and role. Chat remains usable
for general topics without selecting a classroom or reference document.

The assistant cannot mutate scores, submissions, announcements or profiles.
Score sums and target differences are calculated server-side. Missing scores
remain null; leave is not scored as zero. Multi-student prompts contain anonymous
summary rows; individual names are rendered only in the server-generated table.
Teacher draft requests produce text only, never publish anything.

PDF references use the same bounded text reader as submission grading: maximum
10 MB, 40 pages, 60,000 characters. Scanned/image-only pages are rejected.
Source documents are untrusted input. There is no arbitrary URL fetch or tool
execution in chat. Answers and page citations can still be incorrect and must
be checked. Conversation export is not implemented.

For macOS CLI production deploys, ensure the matching optional package
`@napi-rs/canvas-linux-x64-gnu` is installed in the release node_modules. The
Netlify function configuration includes it for PDF.js on Lambda Linux. Linux
CI installs the platform package automatically.

Tests: `node --test tests/ai-assistant.test.mjs tests/pdf-text.test.mjs tests/ai-grading-retired.test.mjs`.
