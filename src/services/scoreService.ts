import { supabase } from "../lib/supabase";

const SCORE_ENTRY_PAGE_SIZE = 1000;

export async function fetchAllScoreEntryRows() {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");

  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += SCORE_ENTRY_PAGE_SIZE) {
    const result = await supabase
      .from("score_entries")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + SCORE_ENTRY_PAGE_SIZE - 1);

    if (result.error) return { data: rows, error: result.error };

    const page = (result.data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < SCORE_ENTRY_PAGE_SIZE) return { data: rows, error: null };
  }
}
