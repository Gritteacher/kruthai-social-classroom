# Classroom AI Assistant

Run `ai-assistant.sql` once before deploying this feature. Re-running it is safe.

Server environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `AI_GATEWAY_API_KEY`, optional `AI_GATEWAY_URL`
and `AI_GRADING_MODEL`. Never expose a service or AI key with a VITE prefix.

All classroom reads use the verified caller's access token and existing RLS.
Student selectors from the request are ignored for student accounts. The admin
client only claims the daily budget: 30 requests per student, 100 per teacher,
reset at midnight Bangkok time. Attempts that fail after claiming count too.
Conversation contents are held in browser memory, cleared by logout/reload,
and sent to the configured AI provider with relevant reference data. They are
not stored in the database. Daily usage counts are stored separately.

The assistant cannot mutate scores, submissions, announcements or profiles.
Score sums and target differences are calculated server-side. Missing scores
remain null; leave is not scored as zero. Multi-student prompts contain anonymous
summary rows; individual names are rendered only in the server-generated table.
Teacher draft requests produce text only, never publish anything.

PDF references use the same bounded text reader as submission grading: maximum
10 MB, 40 pages, 60,000 characters. Scanned/image-only pages are rejected.
Source documents are untrusted input. There is no arbitrary URL fetch or tool
execution in chat. Answers and page citations can still be incorrect and must
be checked. No conversation export or persistent chat history is implemented.

For macOS CLI production deploys, ensure the matching optional package
`@napi-rs/canvas-linux-x64-gnu` is installed in the release node_modules. The
Netlify function configuration includes it for PDF.js on Lambda Linux. Linux
CI installs the platform package automatically.

Tests: `node --test tests/ai-assistant.test.mjs tests/submission-ai.test.mjs`.
