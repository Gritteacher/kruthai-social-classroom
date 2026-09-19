export type SubmissionHistoryEvent =
  | "baseline"
  | "submitted"
  | "reviewed"
  | "score_changed"
  | "status_changed"
  | "attachment_removed"
  | "deleted";

export type SubmissionHistoryState = {
  status: string;
  raw_score: number;
  raw_max: number;
  final_score: number;
  final_max: number;
  attachment_type: "file" | "link" | "none";
  file_deleted: boolean;
};

export type SubmissionHistoryItem = {
  id: string;
  submission_id: string;
  assignment_id: string | null;
  classroom_id: string | null;
  assignment_title: string;
  classroom_name: string;
  student_code: string;
  student_name: string;
  submission_kind: "individual" | "group";
  group_member_codes: string[];
  group_member_names: string[];
  event_type: SubmissionHistoryEvent;
  before_state: SubmissionHistoryState | null;
  after_state: SubmissionHistoryState | null;
  attachment_name: string;
  actor_name: string;
  actor_type: "teacher" | "student" | "system" | "baseline";
  submitted_at: string | null;
  reviewed_at: string | null;
  occurred_at: string;
};

export type SubmissionHistoryCursor = { id: string; occurred_at: string };

