import { createClient } from "@supabase/supabase-js";

const STORAGE_BUCKET = "classroom-files";
const RETENTION_DAYS = 7;
const DELETE_BATCH_SIZE = 100;
const MAX_FILES_PER_RUN = 500;
const QUEUE_RETENTION_DAYS = 30;

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

async function processStorageCleanupQueue(admin) {
  const dueResult = await admin
    .from("storage_cleanup_queue")
    .select("id, bucket_id, object_path, attempts")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_FILES_PER_RUN);

  // Older installations can run submission retention before the hardening
  // migration is applied. Do not block that existing cleanup path.
  if (dueResult.error?.code === "42P01" || dueResult.error?.code === "PGRST205") {
    return { completed: 0, failed: 0, unavailable: true };
  }
  if (dueResult.error) throw dueResult.error;

  let completed = 0;
  let failed = 0;
  const items = (dueResult.data || []).filter((item) => item.id && item.bucket_id && item.object_path);
  for (let index = 0; index < items.length; index += DELETE_BATCH_SIZE) {
    const batch = items.slice(index, index + DELETE_BATCH_SIZE);
    const groups = Map.groupBy(batch, (item) => item.bucket_id);
    for (const [bucket, group] of groups) {
      const paths = Array.from(new Set(group.map((item) => item.object_path)));
      const removeResult = await admin.storage.from(bucket).remove(paths);
      if (removeResult.error) {
        failed += group.length;
        const failedUpdate = await admin
          .from("storage_cleanup_queue")
          .update({
            attempts: Math.max(...group.map((item) => Number(item.attempts) || 0)) + 1,
            last_error: String(removeResult.error.message || "Storage cleanup failed").slice(0, 1000)
          })
          .in("id", group.map((item) => item.id));
        if (failedUpdate.error) throw failedUpdate.error;
        continue;
      }

      const completedAt = new Date().toISOString();
      const completedUpdate = await admin
        .from("storage_cleanup_queue")
        .update({ status: "completed", completed_at: completedAt, last_error: null })
        .in("id", group.map((item) => item.id));
      if (completedUpdate.error) throw completedUpdate.error;
      completed += group.length;
    }
  }

  const pruneBefore = new Date(Date.now() - QUEUE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const pruneResult = await admin
    .from("storage_cleanup_queue")
    .delete()
    .eq("status", "completed")
    .lt("completed_at", pruneBefore);
  if (pruneResult.error) throw pruneResult.error;
  return { completed, failed, unavailable: false };
}

async function pruneAssistantHistory(admin) {
  const settings = await admin
    .from("ai_assistant_settings")
    .select("history_retention_days")
    .eq("id", true)
    .maybeSingle();
  if (settings.error?.code === "42P01" || settings.error?.code === "PGRST205") return { unavailable: true };
  if (settings.error) throw settings.error;
  const retentionDays = Math.max(7, Math.min(3650, Number(settings.data?.history_retention_days) || 90));
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const removed = await admin
    .from("ai_assistant_exchanges")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);
  if (removed.error?.code === "42P01" || removed.error?.code === "PGRST205") return { unavailable: true };
  if (removed.error) throw removed.error;
  return { unavailable: false, deleted: removed.count || 0, retentionDays };
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
    const queuedCleanup = await processStorageCleanupQueue(admin);
    const assistantHistory = await pruneAssistantHistory(admin);
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
    if (!dueItems.length) return json(200, { ok: true, deleted: 0, queuedCleanup, assistantHistory });

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
    if (!freshItems.length) return json(200, { ok: true, deleted: 0, queuedCleanup, assistantHistory });

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

    return json(200, { ok: true, deleted: deletedCount, deletedAt, queuedCleanup, assistantHistory });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "Unknown cleanup error");
    console.error("Submission file cleanup failed", message);
    return json(500, { ok: false, message });
  }
}
