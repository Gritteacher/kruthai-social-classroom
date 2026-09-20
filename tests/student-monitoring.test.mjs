import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudentMonitorRows,
  DEFAULT_STUDENT_MONITOR_CRITERIA,
  formatStudentMonitorMessage
} from "../src/features/student-monitoring/monitoring.ts";

const students = [
  student("student-a", "1001", "กานต์", 1),
  student("student-b", "1002", "ขวัญ", 2),
  student("student-c", "1003", "คิม", 3),
  student("student-d", "1004", "ดาว", 4)
];
const assignments = [
  assignment("work-1", "ใบงานที่ 1", 10),
  assignment("work-2", "ใบงานที่ 2", 10)
];

test("groups students into low score, missing work, and both", () => {
  const entries = [
    score("entry-a1", "work-1", students[0], 2),
    score("entry-a2", "work-2", students[0], 2),
    score("entry-b1", "work-1", students[1], 8),
    score("entry-c1", "work-1", students[2], 10),
    score("entry-c2", "work-2", students[2], 10),
    score("entry-d1", "work-1", students[3], 10)
  ];
  const submissions = [submission("sub-a1", "work-1", "1001"), submission("sub-c1", "work-1", "1003"), submission("sub-c2", "work-2", "1003")];
  const rows = buildStudentMonitorRows(students, assignments, entries, submissions, DEFAULT_STUDENT_MONITOR_CRITERIA);

  assert.deepEqual(rows.map((row) => [row.student.studentId, row.group]), [
    ["1002", "both"],
    ["1004", "missing-work"],
    ["1001", "low-score"],
  ]);
});

test("counts a group submission for every selected group member", () => {
  const groupSubmission = { ...submission("group-1", "work-1", "1001"), submissionKind: "group", groupMemberCodes: ["1001", "1002"] };
  const criteria = { ...DEFAULT_STUDENT_MONITOR_CRITERIA, threshold: 0, assignmentId: "work-1" };
  const rows = buildStudentMonitorRows(students.slice(0, 2), assignments, [], [groupSubmission], criteria);
  assert.equal(rows.length, 0);
});

test("does not mark scored or leave entries as missing without a submission", () => {
  const entries = [
    score("entry-a1", "work-1", students[0], 10),
    { ...score("entry-a2", "work-2", students[0], 0), status: "leave" }
  ];
  const criteria = { ...DEFAULT_STUDENT_MONITOR_CRITERIA, threshold: 0 };
  assert.equal(buildStudentMonitorRows([students[0]], assignments, entries, [], criteria).length, 0);
});

test("does not report work that is closed at the assignment level as missing", () => {
  const closedAssignment = { ...assignments[0], acceptingSubmissions: false };
  const criteria = { ...DEFAULT_STUDENT_MONITOR_CRITERIA, threshold: 0 };
  assert.equal(buildStudentMonitorRows([students[0]], [closedAssignment], [], [], criteria).length, 0);
});

test("specific assignment filter only reports that assignment", () => {
  const criteria = { ...DEFAULT_STUDENT_MONITOR_CRITERIA, threshold: 0, assignmentId: "work-2" };
  const rows = buildStudentMonitorRows([students[0]], assignments, [], [submission("sub-a1", "work-1", "1001")], criteria);
  assert.deepEqual(rows[0].missingAssignments.map((item) => item.id), ["work-2"]);
});

test("formats a personalized notification from tokens", () => {
  const [row] = buildStudentMonitorRows([students[0]], assignments, [], [], DEFAULT_STUDENT_MONITOR_CRITERIA);
  const message = formatStudentMonitorMessage("{ชื่อ}: {คะแนน}/{คะแนนเต็ม} ({เปอร์เซ็นต์}%) ค้าง {จำนวนงานค้าง} - {งานค้าง}", row);
  assert.equal(message, "กานต์: 0/20 (0%) ค้าง 2 - ใบงานที่ 1, ใบงานที่ 2");
});

function student(id, studentId, name, no) {
  return { id, no, studentId, name, gender: "", className: "ม.1 ห้อง 1", classroomId: "class-1" };
}

function assignment(id, title, finalMax) {
  return { id, title, assignmentType: "ใบงาน", className: "ม.1 ห้อง 1", classroomId: "class-1", rawMax: finalMax, finalMax, acceptingSubmissions: true, createdAt: "2026-01-01T00:00:00.000Z" };
}

function score(id, assignmentId, target, finalScore) {
  return { id, assignmentId, studentRecordId: target.id, studentId: target.studentId, status: "scored", rawScore: finalScore, rawMax: 10, finalScore, finalMax: 10 };
}

function submission(id, assignmentId, studentId) {
  return { id, assignmentId, assignmentTitle: "", studentName: "", studentId, classroomId: "class-1", submissionKind: "individual", groupMemberCodes: [studentId], groupMemberNames: [], status: "รอตรวจ", submittedAt: "1 ม.ค. 69", rawScore: 0, rawMax: 10, finalScore: 0, finalMax: 10 };
}
