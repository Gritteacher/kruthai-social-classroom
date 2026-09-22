import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../supabase/migrations/20260922090000_import_score_entries.sql", import.meta.url), "utf8");
const teacherId = "10000000-0000-0000-0000-000000000001";
const studentUserId = "10000000-0000-0000-0000-000000000002";
const classroomId = "20000000-0000-0000-0000-000000000001";
const otherClassroomId = "20000000-0000-0000-0000-000000000002";
const assignmentId = "30000000-0000-0000-0000-000000000001";
const studentId = "40000000-0000-0000-0000-000000000001";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.session_context (user_id uuid);
    insert into auth.session_context values (null);
    create function auth.uid() returns uuid language sql stable as $$ select user_id from auth.session_context limit 1 $$;
    create table public.profiles (id uuid primary key, role text not null);
    create function public.is_teacher() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
      select exists(select 1 from public.profiles where id=auth.uid() and role='teacher')
    $$;
    create table public.classrooms (id uuid primary key, display_name text);
    create table public.students (
      id uuid primary key, student_id text not null, classroom_id uuid references public.classrooms(id)
    );
    create table public.score_assignments (
      id uuid primary key, classroom_id uuid references public.classrooms(id), raw_max numeric not null,
      final_max numeric not null, title text not null default '', class_name text not null default '',
      assignment_type text not null default 'ทั่วไป', accepting_submissions boolean not null default true,
      submission_open_at timestamptz, submission_close_at timestamptz, created_at timestamptz not null default now()
    );
    create table public.score_entries (
      id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.score_assignments(id),
      student_id uuid not null references public.students(id), student_code text not null,
      score_status text not null default 'ungraded', raw_score numeric not null default 0,
      raw_max numeric not null, final_score numeric not null default 0, final_max numeric not null,
      source_type text, source_id uuid, updated_at timestamptz not null default now(), unique(assignment_id,student_id)
    );
    insert into public.profiles values ('${teacherId}','teacher'),('${studentUserId}','student');
    insert into public.classrooms values ('${classroomId}','ห้อง 1'),('${otherClassroomId}','ห้อง 2');
    insert into public.students values ('${studentId}','12345','${classroomId}');
    insert into public.score_assignments (id,classroom_id,raw_max,final_max,title) values ('${assignmentId}','${classroomId}',10,5,'ใบงาน');
  `);
  await db.exec(migration);
  return db;
}

async function setUser(db, id) {
  await db.query("update auth.session_context set user_id=$1", [id]);
}

function payload(rawScore, overrides = {}) {
  return JSON.stringify([{ assignment_id: assignmentId, student_id: studentId, score_status: "scored", raw_score: rawScore, ...overrides }]);
}

test("only teachers can import classroom scores", async () => {
  const db = await setup();
  await setUser(db, studentUserId);
  await assert.rejects(() => db.query("select public.import_score_entries($1,$2::jsonb)", [classroomId, payload(8)]), /TEACHER_REQUIRED/);
  await db.close();
});

test("score import scales scores and stores statuses", async () => {
  const db = await setup();
  await setUser(db, teacherId);
  const result = await db.query("select public.import_score_entries($1,$2::jsonb) as count", [classroomId, payload(8)]);
  assert.equal(result.rows[0].count, 1);
  let saved = await db.query("select score_status,raw_score,final_score,source_type from public.score_entries");
  assert.deepEqual(saved.rows[0], { score_status: "scored", raw_score: "8", final_score: "4", source_type: "manual" });
  await db.query("select public.import_score_entries($1,$2::jsonb)", [classroomId, payload(9, { score_status: "leave" })]);
  saved = await db.query("select score_status,raw_score,final_score from public.score_entries");
  assert.deepEqual(saved.rows[0], { score_status: "leave", raw_score: "0", final_score: "0" });
  await db.close();
});

test("invalid batch rolls back every change", async () => {
  const db = await setup();
  await setUser(db, teacherId);
  const batch = JSON.stringify([
    { assignment_id: assignmentId, student_id: studentId, score_status: "scored", raw_score: 7 },
    { assignment_id: "30000000-0000-0000-0000-000000000099", student_id: studentId, score_status: "scored", raw_score: 5 }
  ]);
  await assert.rejects(() => db.query("select public.import_score_entries($1,$2::jsonb)", [classroomId, batch]), /SCORE_IMPORT_ASSIGNMENT_NOT_IN_CLASSROOM/);
  const saved = await db.query("select count(*)::int as count from public.score_entries");
  assert.equal(saved.rows[0].count, 0);
  await assert.rejects(() => db.query("select public.import_score_entries($1,$2::jsonb)", [classroomId, payload(11)]), /SCORE_IMPORT_SCORE_OUT_OF_RANGE/);
  await db.close();
});
