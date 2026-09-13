import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const teacher='11111111-1111-4111-8111-111111111111';
const student='22222222-2222-4222-8222-222222222222';
const room='33333333-3333-4333-8333-333333333333';
const assignment='44444444-4444-4444-8444-444444444444';
const entry='55555555-5555-4555-8555-555555555555';

test('history migration, RLS, attribution, no-op, atomic failure and cascade retention',async()=>{
  const db=await PGlite.create();
  try{
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table profiles(id uuid primary key,full_name text,role text);
      create function public.is_teacher() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='teacher')$$;
      create table classrooms(id uuid primary key,display_name text);
      create table students(id uuid primary key,full_name text,student_code text,classroom_id uuid);
      create table score_assignments(id uuid primary key,title text,classroom_id uuid);
      create table score_entries(id uuid primary key default gen_random_uuid(), assignment_id uuid references score_assignments(id) on delete cascade,student_id uuid references students(id) on delete cascade,student_code text,score_status text,raw_score numeric,raw_max numeric,final_score numeric,final_max numeric,updated_at timestamptz default now());
      insert into profiles values('${teacher}','Teacher Test','teacher'),('${student}','Student Test','student');
      insert into classrooms values('${room}','Room Test');
      insert into students values('${student}','Student Test','12345','${room}');
      insert into score_assignments values('${assignment}','Work Test','${room}');
      insert into score_entries values('${entry}','${assignment}','${student}','12345','scored',9,10,9,10,now());
      grant usage on schema public,auth to authenticated,anon,service_role;
    `);
    const migration=readFileSync(new URL('../database/score-entry-history.sql',import.meta.url),'utf8');
    await db.exec(migration); await db.exec(migration);
    const rows=async()=> (await db.query('select * from score_entry_history order by changed_at,id')).rows;
    assert.equal((await rows()).length,1);
    assert.equal((await rows())[0].operation,'baseline');
    assert.equal((await rows())[0].after_score.raw_score,9);
    await db.query("select set_config('test.user',$1,false)",[teacher]);
    await db.exec("update score_entries set raw_score=10,final_score=10");
    const updated=(await rows()).at(-1);
    assert.equal(updated.actor_id,teacher);assert.equal(updated.actor_name,'Teacher Test');
    assert.equal(updated.before_score.raw_score,9);assert.equal(updated.after_score.raw_score,10);
    await db.exec("update score_entries set updated_at=clock_timestamp()");
    assert.equal((await rows()).length,2);
    await db.exec("update score_entries set score_status='leave'");
    assert.equal((await rows()).at(-1).after_score.status,'leave');
    await db.exec("set role authenticated");
    assert.equal((await rows()).length,3);
    for(const statement of [
      "delete from score_entry_history",
      "update score_entry_history set actor_name='forged'",
      "insert into score_entry_history select * from score_entry_history limit 1",
      "truncate score_entry_history",
      "select public.record_score_entry_history()"
    ]) await assert.rejects(db.exec(statement),/permission denied/);
    await db.query("select set_config('test.user',$1,false)",[student]);
    assert.equal((await rows()).length,0);
    await db.exec("reset role; set role service_role");
    await assert.rejects(db.exec("delete from score_entry_history"),/permission denied/);
    await db.exec("reset role");
    await db.exec(`create function test_reject_audit() returns trigger language plpgsql as $$begin raise exception 'AUDIT_UNAVAILABLE';end;$$;
      create trigger test_reject_audit before insert on score_entry_history for each row execute function test_reject_audit();`);
    await assert.rejects(db.exec("update score_entries set raw_score=1"),/AUDIT_UNAVAILABLE/);
    assert.equal(Number((await db.query('select raw_score from score_entries')).rows[0].raw_score),10);
    assert.equal((await rows()).length,3);
    await db.exec("drop trigger test_reject_audit on score_entry_history");
    await db.query("select set_config('test.user',$1,false)",[teacher]);
    await db.exec("delete from score_assignments");
    const deleted=(await rows()).at(-1);
    assert.equal(deleted.operation,'delete'); assert.equal(deleted.assignment_title,'Work Test');
    assert.equal(deleted.student_name,'Student Test');assert.equal(deleted.after_score,null);
    assert.equal((await rows()).length,4);
    assert.equal((await db.query('select count(*) n from score_entries')).rows[0].n,0);
  } finally { await db.close(); }
});
