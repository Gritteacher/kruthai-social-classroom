import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { supabase } from "../../lib/supabase";
import { storageSafeFileName } from "../../lib/validation";
import type {
  Worksheet,
  WorksheetAnnotation,
  WorksheetDraft,
  WorksheetPageAnswer,
  WorksheetPageStatus,
  WorksheetTeacherPage,
} from "./types";

const STORAGE_BUCKET = "classroom-files";
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Row = Record<string, unknown>;

function text(row: Row, key: string, fallback = "") {
  const value = row[key];
  return typeof value === "string" ? value : fallback;
}

function optionalText(row: Row, key: string) {
  const value = text(row, key).trim();
  return value || undefined;
}

function mapWorksheet(row: Row): Worksheet {
  const links = Array.isArray(row.worksheet_classrooms)
    ? (row.worksheet_classrooms as Row[])
    : [];
  return {
    id: text(row, "id"),
    title: text(row, "title", "สมุดงาน"),
    description: text(row, "description"),
    filePath: text(row, "file_path"),
    originalFileName: text(row, "original_file_name", "worksheet.pdf"),
    pageCount: Number(row.page_count) || 1,
    acceptingSubmissions: row.accepting_submissions !== false,
    opensAt: optionalText(row, "opens_at"),
    closesAt: optionalText(row, "closes_at"),
    classroomIds: links
      .map((link) => text(link, "classroom_id"))
      .filter(Boolean),
    createdAt: text(row, "created_at", new Date().toISOString()),
  };
}

function isWorksheetStatus(value: unknown): value is WorksheetPageStatus {
  return (
    value === "draft" ||
    value === "submitted" ||
    value === "returned" ||
    value === "reviewed"
  );
}

function mapAnswer(row: Row): WorksheetPageAnswer {
  const rawAnnotations = Array.isArray(row.annotations) ? row.annotations : [];
  return {
    id: text(row, "id"),
    worksheetId: text(row, "worksheet_id"),
    classroomId: text(row, "classroom_id"),
    studentId: text(row, "student_id"),
    studentCode: text(row, "student_code"),
    studentName: text(row, "student_name", "นักเรียน"),
    pageNumber: Number(row.page_number) || 1,
    annotations: rawAnnotations as WorksheetAnnotation[],
    rotation: normalizeRotation(row.rotation),
    status: isWorksheetStatus(row.status) ? row.status : "draft",
    submittedAt: optionalText(row, "submitted_at"),
    reviewedAt: optionalText(row, "reviewed_at"),
    updatedAt: text(row, "updated_at", new Date().toISOString()),
  };
}

function normalizeRotation(value: unknown) {
  const rotation = Number(value) || 0;
  return rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;
}

function mapTeacherPage(row: Row): WorksheetTeacherPage {
  const rawAnnotations = Array.isArray(row.annotations) ? row.annotations : [];
  return {
    id: text(row, "id"),
    worksheetId: text(row, "worksheet_id"),
    pageNumber: Number(row.page_number) || 1,
    annotations: rawAnnotations as WorksheetAnnotation[],
    rotation: normalizeRotation(row.rotation),
    updatedAt: text(row, "updated_at", new Date().toISOString()),
  };
}

export async function fetchWorksheets() {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  const result = await supabase
    .from("worksheets")
    .select("*, worksheet_classrooms(classroom_id)")
    .order("created_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => mapWorksheet(row as Row));
}

export async function fetchWorksheetAnswers() {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  const result = await supabase
    .from("worksheet_page_answers")
    .select("*")
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => mapAnswer(row as Row));
}

export async function fetchTeacherWorksheetPages() {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  const result = await supabase
    .from("worksheet_teacher_pages")
    .select("*")
    .order("updated_at", { ascending: false });
  if (result.error) throw result.error;
  return (result.data ?? []).map((row) => mapTeacherPage(row as Row));
}

export async function countPdfPages(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data: bytes });
  try {
    const document = await loadingTask.promise;
    return document.numPages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function createWorksheet(draft: WorksheetDraft) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  if (!draft.title.trim()) throw new Error("กรอกชื่อสมุดงานก่อน");
  if (!draft.file) throw new Error("เลือกไฟล์ PDF ก่อน");
  if (
    draft.file.type !== "application/pdf" &&
    !draft.file.name.toLowerCase().endsWith(".pdf")
  )
    throw new Error("สมุดงานรองรับเฉพาะไฟล์ PDF");
  if (draft.file.size <= 0 || draft.file.size > 30 * 1024 * 1024)
    throw new Error("ไฟล์ PDF ต้องมีขนาดไม่เกิน 30MB");
  if (!draft.classroomIds.length)
    throw new Error("เลือกห้องเรียนอย่างน้อย 1 ห้อง");
  if (
    draft.opensAt &&
    draft.closesAt &&
    new Date(draft.opensAt) >= new Date(draft.closesAt)
  )
    throw new Error("เวลาเปิดรับต้องมาก่อนเวลาปิดรับ");

  const pageCount = await countPdfPages(draft.file);
  const folderId = crypto.randomUUID();
  const filePath = `worksheets/templates/${folderId}/${storageSafeFileName(draft.file.name)}`;
  const upload = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePath, draft.file, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upload.error) throw upload.error;

  try {
    const inserted = await supabase
      .from("worksheets")
      .insert({
        title: draft.title.trim(),
        description: draft.description.trim(),
        file_path: filePath,
        original_file_name: draft.file.name,
        page_count: pageCount,
        accepting_submissions: draft.acceptingSubmissions,
        opens_at: draft.opensAt ? new Date(draft.opensAt).toISOString() : null,
        closes_at: draft.closesAt
          ? new Date(draft.closesAt).toISOString()
          : null,
      })
      .select("*")
      .single();
    if (inserted.error || !inserted.data)
      throw inserted.error || new Error("สร้างสมุดงานไม่สำเร็จ");

    const worksheetId = String(inserted.data.id);
    const linked = await supabase
      .from("worksheet_classrooms")
      .insert(
        draft.classroomIds.map((classroomId) => ({
          worksheet_id: worksheetId,
          classroom_id: classroomId,
        })),
      );
    if (linked.error) {
      await supabase.from("worksheets").delete().eq("id", worksheetId);
      throw linked.error;
    }
    return {
      ...mapWorksheet(inserted.data as Row),
      classroomIds: [...draft.classroomIds],
    };
  } catch (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
    throw error;
  }
}

export async function deleteWorksheet(worksheet: Worksheet) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  const removed = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([worksheet.filePath]);
  if (removed.error) throw removed.error;
  const deleted = await supabase
    .from("worksheets")
    .delete()
    .eq("id", worksheet.id);
  if (deleted.error) throw deleted.error;
}

export async function getWorksheetUrl(worksheet: Worksheet) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  const result = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(worksheet.filePath, 60 * 60);
  if (result.error || !result.data?.signedUrl)
    throw result.error || new Error("เปิดไฟล์สมุดงานไม่สำเร็จ");
  return result.data.signedUrl;
}

export async function saveWorksheetPage(
  worksheetId: string,
  pageNumber: number,
  annotations: WorksheetAnnotation[],
  rotation: number,
  submit = false,
) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  const result = await supabase.rpc("save_worksheet_page", {
    p_worksheet_id: worksheetId,
    p_page_number: pageNumber,
    p_annotations: annotations,
    p_rotation: rotation,
    p_submit: submit,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error("บันทึกหน้าสมุดงานไม่สำเร็จ");
  return mapAnswer(row as Row);
}

export async function saveTeacherWorksheetPage(
  worksheetId: string,
  pageNumber: number,
  annotations: WorksheetAnnotation[],
  rotation: number,
) {
  if (!supabase) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase");
  const result = await supabase.rpc("save_teacher_worksheet_page", {
    p_worksheet_id: worksheetId,
    p_page_number: pageNumber,
    p_annotations: annotations,
    p_rotation: rotation,
  });
  if (result.error) throw result.error;
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row) throw new Error("บันทึกสมุดงานฉบับครูไม่สำเร็จ");
  return mapTeacherPage(row as Row);
}

export function worksheetError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/WORKSHEET_NOT_OPEN/i.test(message)) return "สมุดงานนี้ยังไม่เปิดให้ทำ";
  if (/WORKSHEET_EXPIRED|WORKSHEET_CLOSED/i.test(message))
    return "สมุดงานนี้ปิดรับแล้ว";
  if (/WORKSHEET_PAGE_LOCKED/i.test(message))
    return "หน้านี้ส่งแล้วและถูกล็อก กรุณาติดต่อครูหากต้องการแก้ไข";
  if (/WORKSHEET_NOT_FOUND/i.test(message))
    return "ไม่พบสมุดงานในห้องเรียนของคุณ";
  return message && !/^\[object Object\]$/.test(message) ? message : fallback;
}
