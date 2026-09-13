import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreLabel, rawLabel, historyCursorFilter } from '../src/features/score-history/format.ts';

test('score history distinguishes missing, zero, leave and scored values', () => {
  const score = {status:'scored',raw_score:0,raw_max:20,final_score:0,final_max:10};
  assert.equal(scoreLabel(null),'ไม่มีรายการ');
  assert.equal(scoreLabel(score),'0 / 10');
  assert.equal(scoreLabel({...score,status:'leave'}),'ลา');
  assert.equal(scoreLabel({...score,status:'ungraded'}),'ยังไม่กรอก');
  assert.equal(rawLabel(score),'ดิบ 0 / 20');
});
test('keyset pagination preserves microseconds and rejects filter injection', () => {
  const cursor={id:'11111111-1111-4111-8111-111111111111',changed_at:'2026-09-04T09:01:02.123456+00:00'};
  assert.ok(historyCursorFilter(cursor).includes('.123456+00:00'));
  assert.throws(()=>historyCursorFilter({...cursor,id:'x),or(id.neq.null'}));
  assert.throws(()=>historyCursorFilter({...cursor,changed_at:'2026-09-04),id.neq.null'}));
  assert.throws(()=>historyCursorFilter({...cursor,changed_at:'invalid'}));
});
test('history SQL contains append-only teacher policy and atomic trigger', () => {
  const sql=readFileSync(new URL('../database/score-entry-history.sql',import.meta.url),'utf8');
  assert.match(sql,/for select to authenticated using \(public.is_teacher\(\)\)/);
  assert.match(sql,/revoke all on public.score_entry_history from public, anon, authenticated, service_role/);
  assert.match(sql,/after insert or update or delete on public.score_entries/);
  assert.doesNotMatch(sql,/references public\./i);
  assert.doesNotMatch(sql,/update public.score_entries|delete from public.score_entries/i);
  assert.match(sql,/where not exists \(select 1 from public.score_entry_history h where h.entry_id=e.id\)/);
});
