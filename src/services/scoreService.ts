import { supabase } from "../lib/supabase";
import { fetchAllRows } from "./pagination";

export async function fetchAllScoreEntryRows() {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");

  const client = supabase;
  return fetchAllRows((from, to) => client
      .from("score_entries")
      .select("*", { count: "exact" })
      .order("id", { ascending: true })
      .range(from, to));
}
