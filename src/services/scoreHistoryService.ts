import { supabase } from "../lib/supabase";
import { historyCursorFilter } from "../features/score-history/format";
import type { HistoryCursor, ScoreHistoryItem } from "../features/score-history/types";

export async function fetchScoreHistory(filters: { classroomId: string; studentId: string; assignmentId: string; includeBaseline: boolean }, cursor?: HistoryCursor) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  if (!filters.classroomId) return { items: [] as ScoreHistoryItem[], hasMore: false };
  let query = supabase.from("score_entry_history")
    .select("id,entry_id,classroom_id,student_id,assignment_id,student_code,student_name,assignment_title,operation,before_score,after_score,actor_name,actor_type,changed_at")
    .eq("classroom_id", filters.classroomId)
    .order("changed_at", { ascending: false }).order("id", { ascending: false }).limit(51);
  if (filters.studentId) query = query.eq("student_id", filters.studentId);
  if (filters.assignmentId) query = query.eq("assignment_id", filters.assignmentId);
  if (!filters.includeBaseline) query = query.neq("operation", "baseline");
  if (cursor) query = query.or(historyCursorFilter(cursor));
  const result = await query;
  if (result.error) {
    if (/42P01|PGRST205/.test(result.error.code || "")) throw new Error("ระบบประวัติคะแนนยังไม่พร้อม กรุณาติดตั้งฐานข้อมูลล่าสุด");
    throw new Error("โหลดประวัติคะแนนไม่สำเร็จ กรุณาลองใหม่");
  }
  const rows = (result.data || []) as ScoreHistoryItem[];
  return { items: rows.slice(0,50), hasMore: rows.length > 50 };
}
