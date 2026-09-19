import { supabase } from "../lib/supabase";
import type { SubmissionHistoryCursor, SubmissionHistoryEvent, SubmissionHistoryItem } from "../features/submission-history/types";

const eventGroups: Record<string, SubmissionHistoryEvent[]> = {
  submitted: ["submitted", "baseline"],
  reviewed: ["reviewed", "score_changed"],
  status: ["status_changed"],
  deleted: ["attachment_removed", "deleted"]
};

function cursorFilter(cursor: SubmissionHistoryCursor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)
    || !/^[0-9T:.+Z -]+$/.test(cursor.occurred_at)
    || !Number.isFinite(Date.parse(cursor.occurred_at))) {
    throw new Error("จุดเริ่มต้นประวัติไม่ถูกต้อง กรุณาโหลดใหม่");
  }
  return `occurred_at.lt.${cursor.occurred_at},and(occurred_at.eq.${cursor.occurred_at},id.lt.${cursor.id})`;
}

export async function fetchSubmissionHistory(filters: { classroomId: string; category: string }, cursor?: SubmissionHistoryCursor) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  let query = supabase.from("submission_history")
    .select("id,submission_id,assignment_id,classroom_id,assignment_title,classroom_name,student_code,student_name,submission_kind,group_member_codes,group_member_names,event_type,before_state,after_state,attachment_name,actor_name,actor_type,submitted_at,reviewed_at,occurred_at")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (filters.classroomId) query = query.eq("classroom_id", filters.classroomId);
  if (filters.category !== "all") query = query.in("event_type", eventGroups[filters.category] || []);
  if (cursor) query = query.or(cursorFilter(cursor));

  const result = await query;
  if (result.error) {
    if (/42P01|PGRST205/.test(result.error.code || "")) throw new Error("ระบบประวัติการส่งงานยังไม่พร้อม กรุณาติดตั้งฐานข้อมูลล่าสุด");
    throw new Error("โหลดประวัติการส่งงานไม่สำเร็จ กรุณาลองใหม่");
  }
  const rows = (result.data || []) as SubmissionHistoryItem[];
  return { items: rows.slice(0, 50), hasMore: rows.length > 50 };
}

