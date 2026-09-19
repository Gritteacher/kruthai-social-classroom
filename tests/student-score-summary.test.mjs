import test from "node:test";
import assert from "node:assert/strict";
import { calculateStudentScoreSummary, gradeFromPercentage } from "../src/features/student-scores/summary.ts";

const assignment = (id, finalMax) => ({
  id,
  title: `งาน ${id}`,
  assignmentType: "ทั่วไป",
  className: "ม.1 ห้อง 1",
  rawMax: finalMax,
  finalMax,
  acceptingSubmissions: true,
  createdAt: "2026-09-19T00:00:00Z"
});

const entry = (assignmentId, finalScore, status = "scored") => ({
  id: `entry-${assignmentId}`,
  assignmentId,
  studentRecordId: "student-1",
  studentId: "10001",
  status,
  rawScore: finalScore,
  rawMax: 100,
  finalScore,
  finalMax: 100
});

test("grade boundaries follow the configured classroom criteria", () => {
  assert.equal(gradeFromPercentage(49), "0");
  assert.equal(gradeFromPercentage(50), "1");
  assert.equal(gradeFromPercentage(54.99), "1");
  assert.equal(gradeFromPercentage(55), "1.5");
  assert.equal(gradeFromPercentage(74.99), "3");
  assert.equal(gradeFromPercentage(75), "3.5");
  assert.equal(gradeFromPercentage(80), "4");
});

test("all classroom assignments contribute to the full score", () => {
  const summary = calculateStudentScoreSummary(
    [assignment("a", 20), assignment("b", 30), assignment("c", 10)],
    [entry("a", 18), entry("b", 0, "ungraded")],
    "student-1"
  );

  assert.equal(summary.earned, 18);
  assert.equal(summary.total, 60);
  assert.equal(summary.percentage, 30);
  assert.equal(summary.grade, "0");
  assert.equal(summary.rows.length, 3);
});

test("leave and zero-score statuses remain in the denominator without adding points", () => {
  const summary = calculateStudentScoreSummary(
    [assignment("a", 10), assignment("b", 10), assignment("c", 10)],
    [entry("a", 10), entry("b", 10, "leave"), entry("c", 10, "expired")],
    "student-1"
  );

  assert.equal(summary.earned, 10);
  assert.equal(summary.total, 30);
  assert.equal(summary.gradedCount, 2);
});

test("a classroom without assignments has no grade", () => {
  const summary = calculateStudentScoreSummary([], [], "student-1");
  assert.equal(summary.total, 0);
  assert.equal(summary.grade, null);
});

test("missing student identity never mixes another student's entries into the summary", () => {
  const summary = calculateStudentScoreSummary([assignment("a", 10)], [entry("a", 10)]);
  assert.equal(summary.earned, 0);
  assert.equal(summary.total, 10);
});
