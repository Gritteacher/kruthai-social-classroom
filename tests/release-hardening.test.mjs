import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260913120000_release_hardening.sql", import.meta.url), "utf8");
const config = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");

test("destructive classroom records use transactional teacher-only RPCs", () => {
  for (const name of ["delete_classroom_with_cleanup", "delete_material_with_cleanup", "delete_submission_with_cleanup", "delete_worksheet_with_cleanup"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}`));
    assert.match(migration, /if not public\.is_teacher\(\)/);
    assert.match(app + readFileSync(new URL("../src/features/worksheets/service.ts", import.meta.url), "utf8"), new RegExp(`rpc\\("${name}"`));
  }
  assert.match(migration, /create table if not exists public\.storage_cleanup_queue/);
});

test("score autosave has blur, visibility and navigation flush paths", () => {
  assert.match(app, /onBlur=\{\(\) => onCommit\(assignment, student\)\}/);
  assert.match(app, /visibilitychange/);
  assert.match(app, /beforeunload/);
  assert.match(app, /flushPendingScoreAutoSaves/);
});

test("Netlify sends baseline browser security headers", () => {
  for (const header of ["Content-Security-Policy", "Permissions-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options"]) {
    assert.match(config, new RegExp(header));
  }
});
