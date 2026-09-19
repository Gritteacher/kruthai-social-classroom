import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/20260919223000_normalize_econ_score_total.sql", import.meta.url),
  "utf8"
);

const targetGroup = "5159b258-12a2-452b-91cb-384e861ee71c";
const duplicateSupplyGroup = "045f1ca6-c980-4785-ac47-bd1bb57141f7";
const canonicalSupplyGroup = "77455eef-c907-4387-80a9-12d04efb7a99";

test("Econ normalization makes every room total 100 and gives all students full score atomically", async () => {
  const db = new PGlite();
  await db.exec(`
    create table classrooms (id uuid primary key, display_name text not null);
    create table students (
      id uuid primary key,
      student_code text not null unique,
      classroom_id uuid references classrooms(id)
    );
    create table score_assignments (
      id uuid primary key,
      assignment_group_id uuid,
      title text not null,
      assignment_type text not null default 'ทั่วไป',
      class_name text not null,
      classroom_id uuid references classrooms(id),
      raw_max numeric not null,
      final_max numeric not null,
      created_at timestamptz not null default now()
    );
    create table score_entries (
      id uuid primary key default gen_random_uuid(),
      assignment_id uuid not null references score_assignments(id),
      student_id uuid not null references students(id),
      student_code text not null,
      score_status text not null,
      raw_score numeric not null,
      raw_max numeric not null,
      final_score numeric not null,
      final_max numeric not null,
      updated_at timestamptz not null default now(),
      unique (assignment_id, student_id)
    );
    create table submissions (
      id uuid primary key default gen_random_uuid(),
      assignment_id uuid references score_assignments(id),
      status text not null,
      raw_score numeric not null default 0,
      raw_max numeric not null,
      final_score numeric not null default 0,
      final_max numeric not null,
      reviewed_at timestamptz
    );
  `);

  for (let index = 0; index < 7; index += 1) {
    const roomNumber = [2, 4, 5, 6, 7, 8, 10][index];
    const roomId = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const studentId = `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const targetId = `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const supplyId = `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const otherId = `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const className = `ม.6 ห้อง ${roomNumber} - Econ`;
    const supplyGroup = roomNumber === 2 ? duplicateSupplyGroup : canonicalSupplyGroup;
    await db.query("insert into classrooms values ($1,$2)", [roomId, className]);
    await db.query("insert into students values ($1,$2,$3)", [studentId, `code-${roomNumber}`, roomId]);
    await db.query("insert into score_assignments values ($1,$2,'อุปทาน 2','ทั่วไป',$3,$4,10,1,now())", [supplyId, supplyGroup, className, roomId]);
    await db.query("insert into score_assignments values ($1,gen_random_uuid(),'งานก่อนหน้า','ทั่วไป',$2,$3,100,96,now())", [otherId, className, roomId]);
    await db.query("insert into score_assignments values ($1,$2,'วันเงินตราวินาศ','ทั่วไป',$3,$4,10,2,now())", [targetId, targetGroup, className, roomId]);
    if (index === 0) {
      await db.query("insert into score_entries (assignment_id,student_id,student_code,score_status,raw_score,raw_max,final_score,final_max) values ($1,$2,$3,'scored',4,10,1,2)", [targetId, studentId, `code-${roomNumber}`]);
      await db.query("insert into submissions (assignment_id,status,raw_score,raw_max,final_score,final_max) values ($1,'รอตรวจ',4,10,1,2)", [targetId]);
    } else if (index === 1) {
      await db.query("insert into score_entries (assignment_id,student_id,student_code,score_status,raw_score,raw_max,final_score,final_max) values ($1,$2,$3,'ungraded',0,10,0,2)", [targetId, studentId, `code-${roomNumber}`]);
    }
  }

  await db.exec(migration);

  const totals = await db.query("select class_name, sum(final_max)::numeric as total from score_assignments group by class_name order by class_name");
  assert.equal(totals.rows.length, 7);
  assert.ok(totals.rows.every((row) => Number(row.total) === 100));

  const entries = await db.query(`
    select e.score_status,e.raw_score,e.raw_max,e.final_score,e.final_max
    from score_entries e join score_assignments a on a.id=e.assignment_id
    where a.assignment_group_id=$1
  `, [targetGroup]);
  assert.equal(entries.rows.length, 7);
  assert.ok(entries.rows.every((row) => row.score_status === "scored" && Number(row.raw_score) === 10 && Number(row.final_score) === 3));

  const submission = await db.query("select status,raw_score,final_score,final_max from submissions");
  assert.equal(submission.rows[0].status, "ตรวจแล้ว");
  assert.equal(Number(submission.rows[0].raw_score), 10);
  assert.equal(Number(submission.rows[0].final_score), 3);
  assert.equal(Number(submission.rows[0].final_max), 3);

  const supplyGroups = await db.query("select count(distinct assignment_group_id)::integer as count from score_assignments where title='อุปทาน 2'");
  assert.equal(supplyGroups.rows[0].count, 1);

  const previousWork = await db.query("select distinct final_max from score_assignments where title='งานก่อนหน้า'");
  assert.deepEqual(previousWork.rows.map((row) => Number(row.final_max)), [96]);

  await db.exec(migration);
  const entryCount = await db.query("select count(*)::integer as count from score_entries");
  assert.equal(entryCount.rows[0].count, 7);
  await db.close();
});
