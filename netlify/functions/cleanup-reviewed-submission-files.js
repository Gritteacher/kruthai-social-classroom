import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "classroom-files";
const RETENTION_DAYS = 7;
const DELETE_BATCH_SIZE = 100;
const MAX_FILES_PER_RUN = 500;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

export async function handler() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, message: "Missing Supabase server environment variables" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const dueResult = await admin
      .from("submissions")
      .select("id, file_path, reviewed_at")
      .eq("status", "ตรวจแล้ว")
      .not("file_path", "is", null)
      .is("file_deleted_at", null)
      .lte("reviewed_at", cutoff)
      .order("reviewed_at", { ascending: true })
      .limit(MAX_FILES_PER_RUN);
    if (dueResult.error) throw dueResult.error;

    const dueItems = (dueResult.data || []).filter((item) => item.id && item.file_path);
    if (!dueItems.length) return json(200, { ok: true, deleted: 0 });

    // Recheck immediately before deletion so a recent re-grade can reset the retention window.
    const candidateIds = dueItems.map((item) => item.id);
    const freshResult = await admin
      .from("submissions")
      .select("id, file_path")
      .in("id", candidateIds)
      .eq("status", "ตรวจแล้ว")
      .not("file_path", "is", null)
      .is("file_deleted_at", null)
      .lte("reviewed_at", cutoff);
    if (freshResult.error) throw freshResult.error;

    const freshItems = (freshResult.data || []).filter((item) => item.id && item.file_path);
    if (!freshItems.length) return json(200, { ok: true, deleted: 0 });

    const deletedAt = new Date().toISOString();
    let deletedCount = 0;
    for (let index = 0; index < freshItems.length; index += DELETE_BATCH_SIZE) {
      const batch = freshItems.slice(index, index + DELETE_BATCH_SIZE);
      const paths = Array.from(new Set(batch.map((item) => item.file_path)));
      const removeResult = await admin.storage.from(STORAGE_BUCKET).remove(paths);
      if (removeResult.error) throw removeResult.error;

      const updateResult = await admin
        .from("submissions")
        .update({ file_path: null, file_deleted_at: deletedAt })
        .in("id", batch.map((item) => item.id))
        .eq("status", "ตรวจแล้ว")
        .lte("reviewed_at", cutoff);
      if (updateResult.error) throw updateResult.error;
      deletedCount += batch.length;
    }

    return json(200, { ok: true, deleted: deletedCount, deletedAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown cleanup error");
    console.error("Submission file cleanup failed", message);
    return json(500, { ok: false, message });
  }
}
