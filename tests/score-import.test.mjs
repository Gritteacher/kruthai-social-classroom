import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseScoreImportValue } from "../src/features/score-import/scoreImport.ts";

test("score import accepts numeric scores and supported statuses", () => {
  assert.deepEqual(parseScoreImportValue(8.5, 10), { status: "scored", rawScore: 8.5 });
  assert.deepEqual(parseScoreImportValue("ลา", 10), { status: "leave", rawScore: 0 });
  assert.deepEqual(parseScoreImportValue("หมดเวลาส่ง", 10), { status: "expired", rawScore: 0 });
  assert.deepEqual(parseScoreImportValue("ไม่มีคะแนน", 10), { status: "no_score", rawScore: 0 });
  assert.deepEqual(parseScoreImportValue("ยังไม่กรอก", 10), { status: "ungraded", rawScore: 0 });
  assert.equal(parseScoreImportValue("", 10), null);
});

test("score import rejects invalid and out-of-range scores", () => {
  assert.throws(() => parseScoreImportValue(-1, 10), /ไม่ติดลบ/);
  assert.throws(() => parseScoreImportValue(11, 10), /ไม่เกิน 10/);
  assert.throws(() => parseScoreImportValue("ไม่ทราบ", 10), /ใช้ตัวเลข/);
});

test("score import template preserves stable system identifiers", async () => {
  const source = await readFile(new URL("../src/features/score-import/scoreImport.ts", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/features/score-import/ScoreImportTools.tsx", import.meta.url), "utf8");
  assert.match(source, /__score_import_ids__/);
  assert.match(source, /classroom_id/);
  assert.match(source, /assignment\.id/);
  assert.match(component, /ตรวจสอบก่อนบันทึก/);
  assert.match(component, /accept="\.xlsx/);
});
