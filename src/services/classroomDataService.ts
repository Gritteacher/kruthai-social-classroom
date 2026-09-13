import { supabase } from "../lib/supabase";
import { fetchAllRows } from "./pagination";
import { fetchAllScoreEntryRows } from "./scoreService";

function client() {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  return supabase;
}

export async function fetchCoreClassroomRows() {
  const database = client();
  return Promise.all([
    database.from("classrooms").select("*").order("created_at", { ascending: false }),
    fetchAllRows((from, to) => database.from("materials").select("*", { count: "exact" }).order("published_at", { ascending: false }).order("id").range(from, to)),
    fetchAllRows((from, to) => database.from("announcements").select("*", { count: "exact" }).order("published_at", { ascending: false }).order("id").range(from, to)),
    fetchAllRows((from, to) => database.from("student_home_cards").select("*", { count: "exact" }).order("sort_order", { ascending: true }).order("created_at", { ascending: true }).order("id").range(from, to)),
    fetchAllRows((from, to) => database.from("students").select("*", { count: "exact" }).order("student_no", { ascending: true }).order("id").range(from, to)),
    fetchAllRows((from, to) => database.from("score_assignments").select("*", { count: "exact" }).order("created_at", { ascending: true }).order("id").range(from, to)),
    fetchAllScoreEntryRows(),
    fetchAllRows((from, to) => database.from("submissions").select("*", { count: "exact" }).order("submitted_at", { ascending: false }).order("id").range(from, to)),
  ]);
}

export function fetchMaterialDownloadLogRows() {
  const database = client();
  return fetchAllRows((from, to) => database
    .from("material_download_logs")
    .select("*", { count: "exact" })
    .order("downloaded_at", { ascending: false })
    .order("id")
    .range(from, to));
}

export function fetchChatMessageRows(classroomId: string) {
  const database = client();
  return fetchAllRows((from, to) => database
    .from("chat_messages")
    .select("*", { count: "exact" })
    .eq("classroom_id", classroomId)
    .order("created_at", { ascending: true })
    .order("id")
    .range(from, to));
}
