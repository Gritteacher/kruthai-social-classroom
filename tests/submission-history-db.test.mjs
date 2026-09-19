import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const teacher = "11111111-1111-4111-8111-111111111111";
const submitter = "22222222-2222-4222-8222-222222222222";
const member = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
const room = "55555555-5555-4555-8555-555555555555";
const submission = "66666666-6666-4666-8666-666666666666";

test("submission history survives deletion and RLS limits it to related users", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table profiles(id uuid primary key,full_name text,role text,student_code text);
      create function public.is_teacher() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='teacher')$$;
      create function public.current_student_code() returns text language sql stable security definer set search_path=public as $$select student_code from profiles where id=auth.uid() and role='student'$$;
      create table classrooms(id uuid primary key,display_name text);
      create table submissions(
        id uuid primary key, assignment_id uuid, assignment_title text not null,
        student_name text not null, student_code text not null, classroom_id uuid,
        file_path text, link_url text, submission_kind text not null default 'individual',
        group_member_codes text[] not null default '{}', group_member_names text[] not null default '{}',
        status text not null default 'รอตรวจ', raw_score numeric not null default 0,
        raw_max numeric not null default 10, final_score numeric not null default 0,
        final_max numeric not null default 10, reviewed_at timestamptz,
        file_deleted_at timestamptz, original_file_name text, submitted_at timestamptz not null default now()
      );
      insert into profiles values
        ('${teacher}','Teacher','teacher',null),
        ('${submitter}','Student One','student','10001'),
        ('${member}','Student Two','student','10002'),
        ('${outsider}','Student Three','student','10003');
      insert into classrooms values('${room}','ม.1 ห้อง 1');
      grant usage on schema public,auth to authenticated,anon,service_role;
    `);
    const migration = readFileSync(new URL("../supabase/migrations/20260919143000_submission_history.sql", import.meta.url), "utf8");
    await db.exec(migration);

    await db.query("select set_config('test.user',$1,false)", [submitter]);
    await db.query(`insert into submissions(
      id,assignment_title,student_name,student_code,classroom_id,file_path,submission_kind,
      group_member_codes,group_member_names,original_file_name
    ) values($1,'งานกลุ่ม','Student One','10001',$2,'submissions/10001/work.pdf','group',array['10001','10002'],array['Student One','Student Two'],'work.pdf')`, [submission, room]);

    await db.query("select set_config('test.user',$1,false)", [teacher]);
    await db.query("update submissions set status='ตรวจแล้ว',raw_score=9,final_score=5,reviewed_at=now() where id=$1", [submission]);
    await db.query("delete from submissions where id=$1", [submission]);
    assert.deepEqual((await db.query("select event_type from submission_history order by occurred_at,id")).rows.map((row) => row.event_type), ["submitted", "reviewed", "deleted"]);

    for (const [userId, expected] of [[submitter, 3], [member, 3], [outsider, 0], [teacher, 3]]) {
      await db.query("select set_config('test.user',$1,false)", [userId]);
      await db.exec("set role authenticated");
      const result = await db.query("select count(*)::int count from submission_history");
      await db.exec("reset role");
      assert.equal(result.rows[0].count, expected);
    }

    await db.query("select set_config('test.user',$1,false)", [teacher]);
    await db.exec("set role authenticated");
    await assert.rejects(db.exec("delete from submission_history"), /permission denied/);
    await db.exec("reset role");
    assert.equal((await db.query("select count(*)::int count from submission_history")).rows[0].count, 3);
  } finally {
    await db.close();
  }
});

