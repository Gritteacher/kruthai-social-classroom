import type {
  Announcement,
  Classroom,
  Material,
  MaterialDownloadLog,
  MaterialType,
  ScoreAssignment,
  ScoreEntry,
  StudentHomeCard,
  StudentRecord,
  SubmissionRecord,
  SubmissionStatus
} from "../types";

type DatabaseRow = Record<string, unknown>;

const NO_CLASS_LABEL = "ยังไม่ได้เลือกห้องเรียน";
const materialTypes = new Set<MaterialType>(["PDF", "VIDEO", "IMG"]);
const submissionStatuses = new Set<SubmissionStatus>(["ยังไม่ส่ง", "ส่งแล้ว", "รอตรวจ", "ตรวจแล้ว", "ให้แก้ไข", "ส่งช้า"]);

function value(row: DatabaseRow, ...keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function text(row: DatabaseRow, keys: string[], fallback = "") {
  const found = value(row, ...keys);
  return found === undefined ? fallback : String(found);
}

function optionalText(row: DatabaseRow, keys: string[]) {
  const found = text(row, keys).trim();
  return found || undefined;
}

function number(row: DatabaseRow, keys: string[], fallback: number) {
  const parsed = Number(value(row, ...keys));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(row: DatabaseRow, keys: string[]) {
  const found = value(row, ...keys);
  return Array.isArray(found) ? found.map(String).filter(Boolean) : [];
}

function formatDate(input: unknown) {
  const source = String(input || new Date().toISOString());
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function accentForType(type: MaterialType): Material["accent"] {
  if (type === "VIDEO") return "blue";
  if (type === "IMG") return "coral";
  return "green";
}

function scaledScore(rawScore: number, rawMax: number, finalMax: number) {
  if (rawMax <= 0) return 0;
  return Math.round((rawScore / rawMax) * finalMax * 100) / 100;
}

export function mapClassroomRow(row: DatabaseRow): Classroom {
  const academicYear = text(row, ["academic_year", "academicYear"]);
  const level = text(row, ["level"]);
  const room = text(row, ["room"]);
  const subject = text(row, ["subject"]);
  return {
    id: text(row, ["id"]),
    academicYear,
    level,
    room,
    subject,
    displayName: text(row, ["display_name", "displayName"], `${level} ห้อง ${room} - ${subject}`)
  };
}

export function mapMaterialRow(row: DatabaseRow): Material {
  const rawType = text(row, ["material_type", "type"], "PDF") as MaterialType;
  const type = materialTypes.has(rawType) ? rawType : "PDF";
  return {
    id: text(row, ["id"]),
    title: text(row, ["title"], "สื่อการสอน"),
    unit: text(row, ["unit"], "สื่อเสริม"),
    level: text(row, ["level"], "ม.1"),
    type,
    date: formatDate(value(row, "published_at", "date")),
    filePath: text(row, ["file_path", "filePath"]),
    className: text(row, ["class_name", "className"], NO_CLASS_LABEL),
    classroomId: optionalText(row, ["classroom_id", "classroomId"]),
    accent: accentForType(type)
  };
}

export function mapAnnouncementRow(row: DatabaseRow): Announcement {
  return {
    id: text(row, ["id"]),
    title: text(row, ["title"], "ประกาศ"),
    body: text(row, ["body"]),
    className: text(row, ["class_name", "className"], NO_CLASS_LABEL),
    classroomId: optionalText(row, ["classroom_id", "classroomId"]),
    publishedAt: formatDate(value(row, "published_at", "publishedAt"))
  };
}

export function mapStudentHomeCardRow(row: DatabaseRow): StudentHomeCard {
  return {
    id: text(row, ["id"]),
    title: text(row, ["title"], "เว็บไซต์สำหรับนักเรียน"),
    description: text(row, ["description"]),
    url: text(row, ["url"]),
    classroomIds: stringArray(row, ["classroom_ids", "classroomIds"]),
    isActive: value(row, "is_active", "isActive") !== false,
    sortOrder: number(row, ["sort_order", "sortOrder"], 0),
    createdAt: text(row, ["created_at", "createdAt"], new Date().toISOString())
  };
}

export function mapMaterialDownloadLogRow(row: DatabaseRow): MaterialDownloadLog {
  return {
    id: text(row, ["id"]),
    materialId: text(row, ["material_id", "materialId"]),
    materialTitle: text(row, ["material_title", "materialTitle"], "สื่อการสอน"),
    studentId: text(row, ["student_code", "studentId"]),
    studentName: text(row, ["student_name", "studentName"], "นักเรียน"),
    className: text(row, ["class_name", "className"], NO_CLASS_LABEL),
    classroomId: optionalText(row, ["classroom_id", "classroomId"]),
    downloadedAt: formatDate(value(row, "downloaded_at", "downloadedAt"))
  };
}

export function mapStudentRow(row: DatabaseRow): StudentRecord {
  return {
    id: text(row, ["id"]),
    no: number(row, ["student_no", "no"], 0),
    studentId: text(row, ["student_code", "studentId"]),
    name: text(row, ["full_name", "name"]),
    gender: text(row, ["gender"]),
    className: text(row, ["class_name", "className"], NO_CLASS_LABEL),
    classroomId: optionalText(row, ["classroom_id", "classroomId"]),
    authEmail: optionalText(row, ["auth_email", "authEmail"]),
    accountCreatedAt: optionalText(row, ["account_created_at", "accountCreatedAt"])
  };
}

export function mapAssignmentRow(row: DatabaseRow): ScoreAssignment {
  return {
    id: text(row, ["id"]),
    assignmentGroupId: optionalText(row, ["assignment_group_id", "assignmentGroupId"]),
    title: text(row, ["title"], "งานคะแนน"),
    className: text(row, ["class_name", "className"], NO_CLASS_LABEL),
    classroomId: optionalText(row, ["classroom_id", "classroomId"]),
    rawMax: number(row, ["raw_max", "rawMax"], 10),
    finalMax: number(row, ["final_max", "finalMax"], 10),
    createdAt: text(row, ["created_at", "createdAt"], new Date().toISOString())
  };
}

export function mapScoreEntryRow(row: DatabaseRow): ScoreEntry {
  return {
    id: text(row, ["id"]),
    assignmentId: text(row, ["assignment_id", "assignmentId"]),
    studentRecordId: text(row, ["student_id", "studentRecordId"]),
    studentId: text(row, ["student_code", "studentId"]),
    rawScore: number(row, ["raw_score", "rawScore"], 0),
    rawMax: number(row, ["raw_max", "rawMax"], 10),
    finalScore: number(row, ["final_score", "finalScore"], 0),
    finalMax: number(row, ["final_max", "finalMax"], 10)
  };
}

export function mapSubmissionRow(row: DatabaseRow): SubmissionRecord {
  const rawScore = number(row, ["raw_score", "rawScore"], 0);
  const rawMax = number(row, ["raw_max", "rawMax"], 10);
  const finalMax = number(row, ["final_max", "finalMax"], 10);
  const rawStatus = text(row, ["status"], "รอตรวจ") as SubmissionStatus;
  return {
    id: text(row, ["id"]),
    assignmentId: optionalText(row, ["assignment_id", "assignmentId"]),
    assignmentTitle: text(row, ["assignment_title", "assignmentTitle"], "งานที่ส่ง"),
    studentName: text(row, ["student_name", "studentName"], "นักเรียน"),
    studentId: text(row, ["student_code", "studentId"]),
    classroomId: optionalText(row, ["classroom_id", "classroomId"]),
    filePath: optionalText(row, ["file_path", "filePath"]),
    status: submissionStatuses.has(rawStatus) ? rawStatus : "รอตรวจ",
    submittedAt: formatDate(value(row, "submitted_at", "submittedAt")),
    rawScore,
    rawMax,
    finalScore: number(row, ["final_score", "finalScore"], scaledScore(rawScore, rawMax, finalMax)),
    finalMax
  };
}

export function isLegacyDemoSubmission(item: SubmissionRecord) {
  return item.studentName.replace(/\s+/g, "") === "สมชายดีมาก" && item.studentId.trim().toLowerCase() === "student";
}
