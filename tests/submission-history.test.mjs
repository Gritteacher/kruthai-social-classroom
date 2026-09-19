import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20260919143000_submission_history.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/services/submissionHistoryService.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/features/submission-history/SubmissionHistoryPanel.tsx", import.meta.url), "utf8");

test("submission history is append-only and scoped to teacher or related students", () => {
  assert.match(migration, /create table if not exists public\.submission_history/);
  assert.match(migration, /public\.is_teacher\(\)/);
  assert.match(migration, /student_code = public\.current_student_code\(\)/);
  assert.match(migration, /public\.current_student_code\(\) = any\(group_member_codes\)/);
  assert.match(migration, /revoke all on public\.submission_history from public, anon, authenticated, service_role/);
  assert.match(migration, /grant select on public\.submission_history to authenticated, service_role/);
  assert.doesNotMatch(migration, /grant (insert|update|delete).*submission_history/i);
});

test("profile renders paginated submission history without exposing stored paths", () => {
  assert.match(app, /<SubmissionHistoryPanel role=\{session\.role\} classrooms=\{classrooms\}/);
  assert.match(service, /from\("submission_history"\)/);
  assert.match(service, /limit\(51\)/);
  assert.match(panel, /ประวัติการส่งงานและตรวจงาน/);
  assert.match(panel, /โหลดเพิ่มเติม/);
  assert.doesNotMatch(service, /file_path|link_url/);
});

