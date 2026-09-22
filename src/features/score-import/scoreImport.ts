import type { Classroom, ScoreAssignment, ScoreEntry, ScoreEntryStatus, StudentRecord } from "../../types";

const TEMPLATE_VERSION = "kruthai-score-import-v1";
const SCORE_SHEET = "คะแนนดิบ";
const META_SHEET = "_ระบบ";
const TECHNICAL_ROW_MARKER = "__score_import_ids__";
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export type ScoreImportIssue = {
  level: "error" | "warning";
  message: string;
  row?: number;
};

export type ScoreImportChange = {
  assignmentId: string;
  assignmentTitle: string;
  studentRecordId: string;
  studentCode: string;
  studentName: string;
  status: ScoreEntryStatus;
  rawScore: number;
  rawMax: number;
  finalScore: number;
  finalMax: number;
  previousLabel: string;
  nextLabel: string;
  replacesLinkedScore: boolean;
};

export type ScoreImportPreview = {
  fileName: string;
  classroomName: string;
  changes: ScoreImportChange[];
  issues: ScoreImportIssue[];
  matchedStudentCount: number;
  matchedAssignmentCount: number;
};

type ParsedScoreValue = { status: ScoreEntryStatus; rawScore: number } | null;

export async function downloadScoreImportTemplate(input: {
  classroom: Classroom;
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  entries: ScoreEntry[];
}) {
  const XLSX = await import("xlsx");
  const { classroom, students, assignments, entries } = input;
  const rows: Array<Array<string | number>> = [
    ["แบบฟอร์มนำเข้าคะแนน"],
    ["ห้องเรียน", classroom.displayName],
    ["คำแนะนำ", "กรอกคะแนนดิบ หรือใช้คำว่า ลา / หมดเวลาส่ง / ไม่มีคะแนน / ยังไม่กรอก ช่องว่างจะไม่แก้ข้อมูลเดิม"],
    ["เลขที่", "รหัสนักเรียน", "ชื่อ-นามสกุล", ...assignments.map((item) => `${item.title} (เต็ม ${formatScore(item.rawMax)})`)],
    [TECHNICAL_ROW_MARKER, "__student_code__", "__student_name__", ...assignments.map((item) => item.id)],
    ...students.map((student) => [
      student.no,
      student.studentId,
      student.name,
      ...assignments.map((assignment) => templateScoreValue(findEntry(entries, assignment.id, student.id)))
    ])
  ];
  const scoreSheet = XLSX.utils.aoa_to_sheet(rows);
  scoreSheet["!cols"] = [
    { wch: 9 },
    { wch: 17 },
    { wch: 34 },
    ...assignments.map(() => ({ wch: 22 }))
  ];
  scoreSheet["!rows"] = [{ hpt: 26 }, {}, { hpt: 32 }, { hpt: 28 }, { hidden: true }];
  scoreSheet["!autofilter"] = { ref: `A4:${columnName(assignments.length + 3)}${students.length + 5}` };

  const metaSheet = XLSX.utils.aoa_to_sheet([
    ["schema", TEMPLATE_VERSION],
    ["classroom_id", classroom.id],
    ["classroom_name", classroom.displayName],
    ["generated_at", new Date().toISOString()]
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, scoreSheet, SCORE_SHEET);
  XLSX.utils.book_append_sheet(workbook, metaSheet, META_SHEET);
  workbook.Workbook = {
    Sheets: [
      { name: SCORE_SHEET, Hidden: 0 },
      { name: META_SHEET, Hidden: 2 }
    ]
  };
  XLSX.writeFile(workbook, `แบบฟอร์มคะแนน-${safeFileName(classroom.displayName)}.xlsx`, {
    bookType: "xlsx",
    compression: true
  });
}

export async function parseScoreImportFile(file: File, input: {
  classroom: Classroom;
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  entries: ScoreEntry[];
}): Promise<ScoreImportPreview> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("รองรับไฟล์ต้นแบบ .xlsx เท่านั้น");
  if (file.size > MAX_FILE_SIZE) throw new Error("ไฟล์คะแนนต้องมีขนาดไม่เกิน 5 MB");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const meta = workbook.Sheets[META_SHEET];
  const scoreSheet = workbook.Sheets[SCORE_SHEET];
  if (!meta || !scoreSheet) throw new Error("ไฟล์นี้ไม่ใช่ไฟล์ต้นแบบนำเข้าคะแนนของระบบ");

  const metaRows = XLSX.utils.sheet_to_json<Array<unknown>>(meta, { header: 1, raw: false });
  const metadata = new Map(metaRows.map((row) => [String(row[0] ?? ""), String(row[1] ?? "")]));
  if (metadata.get("schema") !== TEMPLATE_VERSION) throw new Error("ไฟล์ต้นแบบเป็นคนละเวอร์ชัน กรุณาดาวน์โหลดไฟล์ใหม่");
  if (metadata.get("classroom_id") !== input.classroom.id) {
    throw new Error(`ไฟล์นี้เป็นของ ${metadata.get("classroom_name") || "ห้องเรียนอื่น"} กรุณาเลือกห้องให้ตรงกับไฟล์`);
  }

  const rows = XLSX.utils.sheet_to_json<Array<unknown>>(scoreSheet, { header: 1, raw: true, defval: "" });
  const technicalIndex = rows.findIndex((row) => String(row[0] ?? "").trim() === TECHNICAL_ROW_MARKER);
  if (technicalIndex < 0) throw new Error("ไม่พบรหัสงานในไฟล์ กรุณาดาวน์โหลดไฟล์ต้นแบบใหม่");

  const issues: ScoreImportIssue[] = [];
  const changes: ScoreImportChange[] = [];
  const studentsByCode = new Map(input.students.map((student) => [student.studentId.trim(), student]));
  const assignmentsById = new Map(input.assignments.map((assignment) => [assignment.id, assignment]));
  const technicalRow = rows[technicalIndex];
  const assignmentColumns = technicalRow.slice(3).map((value, offset) => {
    const assignmentId = String(value ?? "").trim();
    const assignment = assignmentsById.get(assignmentId);
    if (assignmentId && !assignment) issues.push({ level: "error", message: `คอลัมน์ ${offset + 4} อ้างถึงงานที่ไม่มีอยู่ในห้องนี้` });
    return assignment;
  });
  const assignmentIds = assignmentColumns.filter(Boolean).map((assignment) => assignment!.id);
  if (new Set(assignmentIds).size !== assignmentIds.length) {
    issues.push({ level: "error", message: "ไฟล์มีคอลัมน์งานซ้ำกัน กรุณาดาวน์โหลดไฟล์ต้นแบบใหม่" });
  }

  const seenCodes = new Set<string>();
  const matchedStudents = new Set<string>();
  for (let rowIndex = technicalIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const values = row.slice(3, 3 + assignmentColumns.length);
    const hasScoreValue = values.some((value) => String(value ?? "").trim() !== "");
    const studentCode = String(row[1] ?? "").trim();
    if (!studentCode && !hasScoreValue) continue;
    if (!studentCode) {
      issues.push({ level: "error", row: rowIndex + 1, message: "ไม่พบรหัสนักเรียน" });
      continue;
    }
    if (seenCodes.has(studentCode)) {
      issues.push({ level: "error", row: rowIndex + 1, message: `รหัสนักเรียน ${studentCode} ซ้ำในไฟล์` });
      continue;
    }
    seenCodes.add(studentCode);
    const student = studentsByCode.get(studentCode);
    if (!student) {
      if (hasScoreValue) issues.push({ level: "error", row: rowIndex + 1, message: `ไม่พบรหัสนักเรียน ${studentCode} ในห้องนี้` });
      continue;
    }
    matchedStudents.add(student.id);
    const fileName = String(row[2] ?? "").trim();
    if (fileName && normalizeName(fileName) !== normalizeName(student.name)) {
      issues.push({ level: "warning", row: rowIndex + 1, message: `ชื่อในไฟล์ “${fileName}” ไม่ตรงกับระบบ แต่จะจับคู่ด้วยรหัส ${studentCode}` });
    }

    assignmentColumns.forEach((assignment, assignmentOffset) => {
      if (!assignment) return;
      const cell = values[assignmentOffset];
      let parsed: ParsedScoreValue;
      try {
        parsed = parseScoreImportValue(cell, assignment.rawMax);
      } catch (error) {
        issues.push({
          level: "error",
          row: rowIndex + 1,
          message: `${assignment.title}: ${error instanceof Error ? error.message : "คะแนนไม่ถูกต้อง"}`
        });
        return;
      }
      if (!parsed) return;
      const existing = findEntry(input.entries, assignment.id, student.id);
      if (sameScore(existing, parsed)) return;
      const finalScore = parsed.status === "scored" ? scaledScore(parsed.rawScore, assignment.rawMax, assignment.finalMax) : 0;
      changes.push({
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        studentRecordId: student.id,
        studentCode,
        studentName: student.name,
        status: parsed.status,
        rawScore: parsed.rawScore,
        rawMax: assignment.rawMax,
        finalScore,
        finalMax: assignment.finalMax,
        previousLabel: scoreLabel(existing),
        nextLabel: parsed.status === "scored" ? formatScore(parsed.rawScore) : statusLabel(parsed.status),
        replacesLinkedScore: Boolean(existing?.sourceType && existing.sourceType !== "manual")
      });
    });
  }

  const linkedCount = changes.filter((change) => change.replacesLinkedScore).length;
  if (linkedCount) {
    issues.push({ level: "warning", message: `${linkedCount} ช่องจะเปลี่ยนคะแนนที่มาจากการตรวจงานหรือใบงานเป็นคะแนนที่ครูนำเข้า` });
  }
  if (!changes.length && !issues.some((issue) => issue.level === "error")) {
    issues.push({ level: "warning", message: "ไม่พบคะแนนที่เปลี่ยนแปลงจากข้อมูลปัจจุบัน" });
  }
  return {
    fileName: file.name,
    classroomName: input.classroom.displayName,
    changes,
    issues,
    matchedStudentCount: matchedStudents.size,
    matchedAssignmentCount: new Set(assignmentIds).size
  };
}

export function parseScoreImportValue(value: unknown, rawMax: number): ParsedScoreValue {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value).trim().replace(/\s+/g, "").toLocaleLowerCase("th");
  const statuses: Record<string, ScoreEntryStatus> = {
    "ลา": "leave",
    "leave": "leave",
    "หมดเวลาส่ง": "expired",
    "expired": "expired",
    "ไม่มีคะแนน": "no_score",
    "no_score": "no_score",
    "ยังไม่กรอก": "ungraded",
    "ungraded": "ungraded",
    "-": "ungraded"
  };
  if (statuses[normalized]) return { status: statuses[normalized], rawScore: 0 };
  const score = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(score)) throw new Error("ใช้ตัวเลข หรือสถานะ ลา / หมดเวลาส่ง / ไม่มีคะแนน / ยังไม่กรอก");
  if (score < 0) throw new Error("คะแนนต้องไม่ติดลบ");
  if (score > rawMax) throw new Error(`คะแนนต้องไม่เกิน ${formatScore(rawMax)}`);
  return { status: "scored", rawScore: score };
}

function findEntry(entries: ScoreEntry[], assignmentId: string, studentId: string) {
  return entries.find((entry) => entry.assignmentId === assignmentId && entry.studentRecordId === studentId);
}

function sameScore(entry: ScoreEntry | undefined, next: Exclude<ParsedScoreValue, null>) {
  if (!entry) return next.status === "ungraded";
  if (entry.status !== next.status) return false;
  return next.status !== "scored" || Math.abs(entry.rawScore - next.rawScore) < 0.000001;
}

function templateScoreValue(entry: ScoreEntry | undefined) {
  if (!entry || entry.status === "ungraded") return "";
  if (entry.status === "scored") return entry.rawScore;
  return statusLabel(entry.status);
}

function scoreLabel(entry: ScoreEntry | undefined) {
  if (!entry || entry.status === "ungraded") return "ยังไม่กรอก";
  return entry.status === "scored" ? formatScore(entry.rawScore) : statusLabel(entry.status);
}

function statusLabel(status: ScoreEntryStatus) {
  if (status === "leave") return "ลา";
  if (status === "expired") return "หมดเวลาส่ง";
  if (status === "no_score") return "ไม่มีคะแนน";
  if (status === "ungraded") return "ยังไม่กรอก";
  return "คะแนน";
}

function scaledScore(rawScore: number, rawMax: number, finalMax: number) {
  return rawMax > 0 ? Math.round((rawScore / rawMax) * finalMax) : 0;
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("th");
}

function safeFileName(value: string) {
  return value.trim().replace(/[^A-Za-z0-9ก-๙_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "ห้องเรียน";
}

function columnName(columnNumber: number) {
  let current = columnNumber;
  let result = "";
  while (current > 0) {
    current--;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}
