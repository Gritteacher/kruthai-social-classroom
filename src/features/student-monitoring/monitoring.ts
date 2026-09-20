import type { ScoreAssignment, ScoreEntry, StudentRecord, SubmissionRecord } from "../../types";

export type StudentMonitorScoreMode = "percentage" | "score";
export type StudentMonitorMatchMode = "any" | "both";
export type StudentMonitorGroup = "both" | "missing-work" | "low-score";

export interface StudentMonitorCriteria {
  scoreMode: StudentMonitorScoreMode;
  threshold: number;
  minimumMissing: number;
  assignmentId: string;
  matchMode: StudentMonitorMatchMode;
}

export interface StudentMonitorRow {
  student: StudentRecord;
  earned: number;
  total: number;
  percentage: number;
  missingAssignments: ScoreAssignment[];
  isLowScore: boolean;
  hasMissingWork: boolean;
  group: StudentMonitorGroup;
}

export interface StudentNotificationMessage {
  student: StudentRecord;
  body: string;
}

export const DEFAULT_STUDENT_MONITOR_CRITERIA: StudentMonitorCriteria = {
  scoreMode: "percentage",
  threshold: 50,
  minimumMissing: 1,
  assignmentId: "",
  matchMode: "any"
};

export const DEFAULT_STUDENT_MONITOR_MESSAGE = [
  "เรียน {ชื่อ}",
  "ขณะนี้คะแนนรวมของคุณคือ {คะแนน}/{คะแนนเต็ม} ({เปอร์เซ็นต์}%)",
  "งานที่ยังไม่ส่ง: {งานค้าง}",
  "กรุณาตรวจสอบและส่งงานตามกำหนดครับ"
].join("\n");

export function buildStudentMonitorRows(
  students: StudentRecord[],
  assignments: ScoreAssignment[],
  entries: ScoreEntry[],
  submissions: SubmissionRecord[],
  criteria: StudentMonitorCriteria,
  now = Date.now()
): StudentMonitorRow[] {
  const assignmentCandidates = assignments.filter((assignment) => assignment.acceptingSubmissions && assignmentHasStarted(assignment, now));
  const missingCandidates = criteria.assignmentId
    ? assignmentCandidates.filter((assignment) => assignment.id === criteria.assignmentId)
    : assignmentCandidates;
  const threshold = Math.max(0, finiteNumber(criteria.threshold));
  const minimumMissing = Math.max(1, Math.floor(finiteNumber(criteria.minimumMissing) || 1));

  return students.flatMap((student) => {
    const studentEntries = entries.filter((entry) => entry.studentRecordId === student.id || entry.studentId === student.studentId);
    const summary = calculateMonitorScore(assignments, studentEntries);
    const missingAssignments = missingCandidates.filter((assignment) => {
      if (hasSubmittedAssignment(submissions, assignment.id, student.studentId)) return false;
      const entry = studentEntries.find((item) => item.assignmentId === assignment.id);
      return entry?.status !== "scored" && entry?.status !== "leave";
    });
    const isLowScore = summary.total > 0 && (criteria.scoreMode === "score"
      ? summary.earned < threshold
      : summary.percentage < threshold);
    const hasMissingWork = missingAssignments.length >= minimumMissing;
    const matches = criteria.matchMode === "both"
      ? isLowScore && hasMissingWork
      : isLowScore || hasMissingWork;
    if (!matches) return [];

    const group: StudentMonitorGroup = isLowScore && hasMissingWork
      ? "both"
      : hasMissingWork
        ? "missing-work"
        : "low-score";
    return [{
      student,
      earned: summary.earned,
      total: summary.total,
      percentage: summary.percentage,
      missingAssignments,
      isLowScore,
      hasMissingWork,
      group
    }];
  }).sort(compareMonitorRows);
}

export function formatStudentMonitorMessage(template: string, row: StudentMonitorRow) {
  const missing = row.missingAssignments.length
    ? row.missingAssignments.map((assignment) => assignment.title).join(", ")
    : "ไม่มีงานค้าง";
  const replacements: Record<string, string> = {
    "{ชื่อ}": row.student.name,
    "{คะแนน}": formatMonitorScore(row.earned),
    "{คะแนนเต็ม}": formatMonitorScore(row.total),
    "{เปอร์เซ็นต์}": formatMonitorScore(row.percentage),
    "{จำนวนงานค้าง}": String(row.missingAssignments.length),
    "{งานค้าง}": missing
  };
  return Object.entries(replacements).reduce((message, [token, value]) => message.split(token).join(value), template).trim();
}

export function monitorGroupLabel(group: StudentMonitorGroup) {
  if (group === "both") return "คะแนนต่ำและมีงานค้าง";
  if (group === "missing-work") return "มีงานค้าง";
  return "คะแนนต่ำ";
}

function hasSubmittedAssignment(submissions: SubmissionRecord[], assignmentId: string, studentCode: string) {
  return submissions.some((submission) => submission.assignmentId === assignmentId && (
    submission.studentId === studentCode || submission.groupMemberCodes.includes(studentCode)
  ));
}

function calculateMonitorScore(assignments: ScoreAssignment[], studentEntries: ScoreEntry[]) {
  const entriesByAssignment = new Map(studentEntries.map((entry) => [entry.assignmentId, entry]));
  const total = assignments.reduce((sum, assignment) => sum + Math.max(0, finiteNumber(assignment.finalMax)), 0);
  const earned = assignments.reduce((sum, assignment) => {
    const entry = entriesByAssignment.get(assignment.id);
    if (entry?.status !== "scored") return sum;
    return sum + Math.max(0, Math.min(assignment.finalMax, finiteNumber(entry.finalScore)));
  }, 0);
  return { earned, total, percentage: total > 0 ? Math.max(0, Math.min(100, (earned / total) * 100)) : 0 };
}

function assignmentHasStarted(assignment: ScoreAssignment, now: number) {
  if (!assignment.submissionOpenAt) return true;
  const opensAt = Date.parse(assignment.submissionOpenAt);
  return Number.isNaN(opensAt) || opensAt <= now;
}

function compareMonitorRows(a: StudentMonitorRow, b: StudentMonitorRow) {
  const order: Record<StudentMonitorGroup, number> = { both: 0, "missing-work": 1, "low-score": 2 };
  return order[a.group] - order[b.group]
    || b.missingAssignments.length - a.missingAssignments.length
    || a.percentage - b.percentage
    || a.student.no - b.student.no;
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function formatMonitorScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
