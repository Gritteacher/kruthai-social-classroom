# Teacher Settings

Apply `teacher-settings.sql` before deploying. It is transactional and rerunnable.
No new environment variables or credentials are required.

Teachers manage feature popups in Profile, and chat preferences in AI Assistant >
Settings. Preferences apply to subsequent chat requests, not automated grading.
The model and API credentials remain server environment configuration only.
Student access and score access are checked on the server for every request.
Custom guidance cannot grant database access or change scores.

Feature updates are plain text, targeted to students, teachers, or everyone.
Drafts are disabled. Every saved edit increments a server-generated revision.
Users acknowledge each revision once, persisted by account across devices.
Enabled updates are checked on login, window focus, and every 60 seconds while
visible. Preview does not acknowledge or publish. Delete requires confirmation.

RLS restricts publishing and settings changes to teachers. Receipts are scoped
to the authenticated user and a visible, enabled update revision. No secrets
belong in instructions or popup text. Existing scores and submissions are untouched.
