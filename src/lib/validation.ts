import type { MaterialType } from "../types";

const MB = 1024 * 1024;
const MATERIAL_LIMIT = 100 * MB;
const ROSTER_LIMIT = 5 * MB;
const SUBMISSION_LIMIT = 25 * MB;
const STUDENT_CODE_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const materialExtensions: Record<MaterialType, string[]> = {
  PDF: ["pdf"],
  VIDEO: ["mp4", "m4v", "mov", "webm"],
  IMG: ["jpg", "jpeg", "png", "webp"]
};
const rosterExtensions = ["csv", "xls", "xlsx"];
const submissionExtensions = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "webp", "mp4", "mov"];

function extensionOf(name: string) {
  return name.trim().split(".").pop()?.toLowerCase() || "";
}

function sizeLabel(bytes: number) {
  return `${Math.round(bytes / MB)} MB`;
}

export function validateStudentCode(value: string) {
  const code = value.trim();
  if (!code) return "กรอกรหัสนักเรียนก่อน";
  if (!STUDENT_CODE_PATTERN.test(code)) return "รหัสนักเรียนใช้ได้เฉพาะตัวอักษร ตัวเลข ขีดกลาง และขีดล่าง";
  return "";
}

export function validateStudentPassword(value: string) {
  return value.trim().length >= 6 ? "" : "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
}

export function validateMaterialFile(file: File, type: MaterialType) {
  if (!materialExtensions[type].includes(extensionOf(file.name))) return `ชนิดไฟล์ไม่ตรงกับประเภท ${type}`;
  if (file.size > MATERIAL_LIMIT) return `ไฟล์สื่อต้องมีขนาดไม่เกิน ${sizeLabel(MATERIAL_LIMIT)}`;
  return "";
}

export function validateRosterFile(file: File) {
  if (!rosterExtensions.includes(extensionOf(file.name))) return "รองรับไฟล์รายชื่อ .csv, .xls และ .xlsx เท่านั้น";
  if (file.size > ROSTER_LIMIT) return `ไฟล์รายชื่อต้องมีขนาดไม่เกิน ${sizeLabel(ROSTER_LIMIT)}`;
  return "";
}

export function validateSubmissionFile(file: File) {
  if (!submissionExtensions.includes(extensionOf(file.name))) return "ชนิดไฟล์งานไม่รองรับ";
  if (file.size > SUBMISSION_LIMIT) return `ไฟล์งานต้องมีขนาดไม่เกิน ${sizeLabel(SUBMISSION_LIMIT)}`;
  return "";
}

export function normalizeExternalUrl(value: string) {
  const input = value.trim();
  if (!input) return { url: "", error: "กรอก URL เว็บไซต์ก่อน" };
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { url: "", error: "รองรับเฉพาะ URL แบบ http หรือ https" };
    return { url: parsed.toString(), error: "" };
  } catch {
    return { url: "", error: "URL เว็บไซต์ไม่ถูกต้อง" };
  }
}

export function safeStorageSegment(value: string) {
  return value.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function storageSafeFileName(name: string) {
  const trimmed = name.trim();
  const extensionMatch = trimmed.match(/\.[A-Za-z0-9]{1,10}$/);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : "";
  const base = trimmed
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return `${base || "file"}${extension}`;
}

export function userFacingError(error: unknown, fallback: string) {
  const source = error as { message?: unknown; error_description?: unknown; details?: unknown; hint?: unknown; code?: unknown } | null | undefined;
  const parts = [
    error instanceof Error ? error.message : source?.message,
    source?.error_description,
    source?.details,
    source?.hint
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const message = parts[0] || (typeof error === "string" ? error : "");
  const debugCode = source?.code ? ` (${String(source.code)})` : "";
  if (/row-level security|permission denied|not allowed/i.test(message)) return "คุณไม่มีสิทธิ์ดำเนินการนี้";
  if (/jwt|session|refresh token/i.test(message)) return "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่";
  if (/duplicate|unique constraint/i.test(message)) return "ข้อมูลนี้มีอยู่ในระบบแล้ว";
  if (/invalid key/i.test(message)) return "ชื่อหรือเส้นทางไฟล์ไม่ถูกต้อง";
  if (/ASSIGNMENT_NOT_FOUND_FOR_SUBMISSION/i.test(message)) return "รายการส่งงานนี้ยังไม่พบงานคะแนนที่ตรงกัน กรุณาตรวจชื่องานหรือสร้างงานคะแนนก่อน";
  if (/ASSIGNMENT_SUBMISSIONS_NOT_OPEN/i.test(message)) return "งานนี้ยังไม่เปิดรับการส่ง กรุณาตรวจวันเวลาเริ่มรับงาน";
  if (/ASSIGNMENT_SUBMISSIONS_EXPIRED/i.test(message)) return "งานนี้หมดเวลาส่งแล้ว";
  if (/ASSIGNMENT_SUBMISSIONS_CLOSED/i.test(message)) return "ครูปิดรับการส่งงานนี้แล้ว";
  if (/INVALID_SUBMISSION_WINDOW/i.test(message)) return "วันเวลาปิดรับงานต้องอยู่หลังเวลาเริ่มรับ";
  if (/STUDENT_NOT_FOUND_FOR_SCORE/i.test(message)) return "ไม่พบรายชื่อนักเรียนสำหรับบันทึกคะแนน กรุณาตรวจรายชื่อในห้องเรียน";
  if (/TEACHER_REQUIRED/i.test(message)) return "ต้องเข้าสู่ระบบด้วยบัญชีครูเพื่อบันทึกผลตรวจงาน";
  return message ? `${message}${debugCode}` : fallback;
}
