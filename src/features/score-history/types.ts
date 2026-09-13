export type ScoreSnapshot = {
  status: string;
  raw_score: number;
  raw_max: number;
  final_score: number;
  final_max: number;
};
export type ScoreHistoryItem = {
  id: string;
  entry_id: string;
  classroom_id: string | null;
  student_id: string;
  assignment_id: string;
  student_code: string;
  student_name: string;
  assignment_title: string;
  operation: "baseline" | "insert" | "update" | "delete";
  before_score: ScoreSnapshot | null;
  after_score: ScoreSnapshot | null;
  actor_name: string;
  actor_type: "teacher" | "user" | "system" | "baseline";
  changed_at: string;
};
export type HistoryCursor = { id: string; changed_at: string };
