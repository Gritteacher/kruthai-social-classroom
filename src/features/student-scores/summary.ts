import type { ScoreAssignment, ScoreEntry } from "../../types";

export type StudentGrade = "0" | "1" | "1.5" | "2" | "2.5" | "3" | "3.5" | "4";

export interface StudentScoreSummary {
  earned: number;
  total: number;
  percentage: number;
  grade: StudentGrade | null;
  gradedCount: number;
  rows: Array<{ assignment: ScoreAssignment; entry?: ScoreEntry }>;
}

export function gradeFromPercentage(percentage: number): StudentGrade {
  if (percentage >= 80) return "4";
  if (percentage >= 75) return "3.5";
  if (percentage >= 70) return "3";
  if (percentage >= 65) return "2.5";
  if (percentage >= 60) return "2";
  if (percentage >= 55) return "1.5";
  if (percentage >= 50) return "1";
  return "0";
}

export function calculateStudentScoreSummary(
  assignments: ScoreAssignment[],
  entries: ScoreEntry[],
  studentRecordId?: string
): StudentScoreSummary {
  const studentEntries = new Map(
    (studentRecordId ? entries.filter((entry) => entry.studentRecordId === studentRecordId) : [])
      .map((entry) => [entry.assignmentId, entry])
  );
  const rows = assignments.map((assignment) => ({
    assignment,
    entry: studentEntries.get(assignment.id)
  }));
  const total = rows.reduce((sum, { assignment }) => {
    const fullScore = Number.isFinite(assignment.finalMax) ? Math.max(0, assignment.finalMax) : 0;
    return sum + fullScore;
  }, 0);
  const earned = rows.reduce((sum, { assignment, entry }) => {
    if (entry?.status !== "scored") return sum;
    const score = Number.isFinite(entry.finalScore) ? entry.finalScore : 0;
    return sum + Math.max(0, Math.min(assignment.finalMax, score));
  }, 0);
  const percentage = total > 0 ? Math.max(0, Math.min(100, (earned / total) * 100)) : 0;

  return {
    earned,
    total,
    percentage,
    grade: total > 0 ? gradeFromPercentage(percentage) : null,
    gradedCount: rows.filter(({ entry }) => entry?.status === "scored" || entry?.status === "expired" || entry?.status === "no_score").length,
    rows
  };
}
