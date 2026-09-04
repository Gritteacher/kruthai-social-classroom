# Database security

`supabase-schema.sql` is the current idempotent schema and policy source. Run the whole file in the Supabase SQL editor after deploying these changes.

For an existing production database, `assignment-groups-transaction.sql` is the focused idempotent patch that adds permanent assignment grouping and atomic multi-classroom score updates.

`student-home-cards.sql` adds teacher-managed website cards with classroom-scoped student access.

`score-entry-status.sql` adds persistent score states for ungraded, scored, leave, expired, and no-score entries.

`group-submissions.sql` adds secure individual/group submissions, file-or-link delivery, and classroom-scoped peer selection.

`worksheet-score-links.sql` links worksheet pages to score-assignment groups, stores page-level grades, and atomically updates each student's score entry when the teacher finishes reviewing selected pages.

`retire-ai-grading.sql` disables all AI grading entry points while preserving existing scores, submissions, files, and archived reviews. See `AI-GRADING-RETIREMENT.md`. The chat assistant is not removed.

## Access model

- Teachers are identified only by `profiles.role = 'teacher'`.
- Students are linked through `profiles.student_code` and `students.student_code`.
- Student classroom access is derived by `user_classroom_id()`.
- Shared teaching materials are readable only when their `level` matches the student's classroom level.
- New student files must use `submissions/{student_code}/{safe-file-name}`.
- The legacy student-account RPC is disabled for `authenticated`; Netlify Functions use the Admin API instead.

Do not run `production-patch-2026-06-26.sql`. It remains only as a marker for an obsolete production patch.
