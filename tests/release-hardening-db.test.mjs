import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const teacher = "11111111-1111-4111-8111-111111111111";
const student = "22222222-2222-4222-8222-222222222222";
const room = "33333333-3333-4333-8333-333333333333";

test("hardening migration atomically deletes a classroom and queues its files", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table profiles(id uuid primary key,role text);
      create function public.is_teacher() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='teacher')$$;
      create table classrooms(id uuid primary key,display_name text);
      create table students(id uuid primary key,classroom_id uuid,student_no integer);
      create table score_assignments(id uuid primary key,classroom_id uuid,created_at timestamptz);
      create table score_entries(id uuid primary key,student_id uuid,assignment_id uuid);
      create table materials(id uuid primary key,classroom_id uuid,file_path text,cover_path text,level text,published_at timestamptz);
      create table submissions(id uuid primary key,classroom_id uuid,file_path text,status text,submitted_at timestamptz,student_code text);
      create table announcements(id uuid primary key,classroom_id uuid,published_at timestamptz);
      create table material_download_logs(id uuid primary key,classroom_id uuid,student_code text,downloaded_at timestamptz);
      create table student_roster_uploads(id uuid primary key,classroom_id uuid,file_path text);
      create table chat_messages(id uuid primary key,classroom_id uuid);
      create table student_home_cards(id uuid primary key,classroom_ids uuid[],updated_at timestamptz);
      create table worksheets(id uuid primary key,file_path text);
      insert into profiles values('${teacher}','teacher'),('${student}','student');
      insert into classrooms values('${room}','Test room');
      insert into materials values(gen_random_uuid(),'${room}','materials/test.pdf',null,'ม.1',now());
      insert into submissions values(gen_random_uuid(),'${room}','submissions/123/test.pdf','รอตรวจ',now(),'123');
      insert into student_home_cards values(gen_random_uuid(),array['${room}'::uuid],now());
      grant usage on schema public,auth to authenticated,anon,service_role;
    `);
    const migration = readFileSync(new URL("../supabase/migrations/20260913120000_release_hardening.sql", import.meta.url), "utf8");
    await db.exec(migration);
    await db.query("select set_config('test.user',$1,false)", [student]);
    await assert.rejects(db.query("select public.delete_classroom_with_cleanup($1)", [room]), /TEACHER_REQUIRED/);
    assert.equal((await db.query("select count(*)::int count from classrooms")).rows[0].count, 1);

    await db.query("select set_config('test.user',$1,false)", [teacher]);
    const result = await db.query("select public.delete_classroom_with_cleanup($1) result", [room]);
    assert.equal(result.rows[0].result.ok, true);
    assert.equal((await db.query("select count(*)::int count from classrooms")).rows[0].count, 0);
    assert.equal((await db.query("select count(*)::int count from materials")).rows[0].count, 0);
    assert.equal((await db.query("select count(*)::int count from submissions")).rows[0].count, 0);
    assert.equal((await db.query("select count(*)::int count from storage_cleanup_queue where status='pending'")).rows[0].count, 2);
    assert.deepEqual((await db.query("select classroom_ids from student_home_cards")).rows[0].classroom_ids, []);
  } finally {
    await db.close();
  }
});
