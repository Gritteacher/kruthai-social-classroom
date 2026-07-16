import type { Classroom, ScoreAssignment, ScoreEntry, StudentRecord } from "../types";
import type { jsPDF as JsPdfDocument } from "jspdf";

type ScoreExportPayload = {
  schoolName: string;
  classroom: Classroom | undefined;
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  entries: ScoreEntry[];
};

const FONT_NAME = "PromptPdf";
const FONT_FILE = "Prompt-Regular.ttf";
const ASSIGNMENTS_PER_TABLE = 5;

let fontReady: Promise<void> | null = null;

export async function exportClassroomScorePdf(payload: ScoreExportPayload) {
  if (!payload.classroom) throw new Error("เลือกห้องเรียนก่อนส่งออก PDF");
  if (!payload.students.length) throw new Error("ยังไม่มีรายชื่อนักเรียนในห้องนี้");
  if (!payload.assignments.length) throw new Error("ยังไม่มีงานคะแนนในห้องนี้");

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable")
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await ensurePromptFont(doc);
  doc.setFont(FONT_NAME, "normal");

  const generatedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const totalMax = payload.assignments.reduce((sum, assignment) => sum + assignment.finalMax, 0);
  const classroomName = payload.classroom.displayName;

  doc.setFontSize(18);
  doc.text("รายงานคะแนนนักเรียนรายห้อง", 14, 16);
  doc.setFontSize(11);
  doc.text(payload.schoolName, 14, 24);
  doc.text(`${classroomName} · ปีการศึกษา ${payload.classroom.academicYear}`, 14, 30);
  doc.text(`ส่งออกเมื่อ ${generatedAt}`, 14, 36);
  doc.text(`นักเรียน ${payload.students.length} คน · งาน ${payload.assignments.length} งาน · คะแนนเต็มรวม ${formatPdfScore(totalMax)} คะแนน`, 14, 42);

  const assignmentChunks = chunkAssignments(payload.assignments);
  let startY = 50;

  assignmentChunks.forEach((assignmentChunk, index) => {
    if (index > 0) {
      doc.addPage("a4", "landscape");
      doc.setFont(FONT_NAME, "normal");
      doc.setFontSize(13);
      doc.text(`รายงานคะแนนนักเรียนรายห้อง - ${classroomName}`, 14, 16);
      doc.setFontSize(10);
      doc.text(`ชุดตารางที่ ${index + 1} จาก ${assignmentChunks.length}`, 14, 23);
      startY = 30;
    }

    const head = [
      [
        "เลขที่",
        "รหัสนักเรียน",
        "ชื่อ-นามสกุล",
        ...assignmentChunk.map((assignment) => `${assignment.title}\n${assignment.assignmentType || "ทั่วไป"} · เต็ม ${formatPdfScore(assignment.finalMax)}`),
        "รวม"
      ]
    ];
    const body = payload.students.map((student) => buildStudentScoreRow(student, assignmentChunk, payload.assignments, payload.entries));

    autoTable(doc, {
      head,
      body,
      startY,
      theme: "grid",
      styles: {
        font: FONT_NAME,
        fontStyle: "normal",
        fontSize: 8.4,
        cellPadding: 2,
        lineColor: [220, 226, 232],
        lineWidth: 0.18,
        minCellHeight: 7,
        valign: "middle",
        overflow: "linebreak"
      },
      headStyles: {
        fillColor: [247, 248, 250],
        textColor: [24, 24, 27],
        fontStyle: "normal",
        halign: "center"
      },
      bodyStyles: {
        textColor: [39, 39, 42]
      },
      alternateRowStyles: {
        fillColor: [252, 252, 253]
      },
      columnStyles: {
        0: { cellWidth: 13, halign: "center" },
        1: { cellWidth: 25, halign: "center" },
        2: { cellWidth: 58 },
        [assignmentChunk.length + 3]: { cellWidth: 22, halign: "center", fillColor: [250, 250, 250] }
      },
      margin: { left: 14, right: 14 },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        doc.setFont(FONT_NAME, "normal");
        doc.setFontSize(8);
        doc.setTextColor(113, 113, 122);
        doc.text(`หน้า ${pageCount}`, 280, 200, { align: "right" });
        doc.setTextColor(39, 39, 42);
      }
    });
  });

  doc.save(`คะแนน-${safePdfFileName(classroomName)}.pdf`);
}

async function ensurePromptFont(doc: JsPdfDocument) {
  if (!fontReady) {
    fontReady = fetch(`${import.meta.env.BASE_URL}fonts/${FONT_FILE}`)
      .then((response) => {
        if (!response.ok) throw new Error("โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        doc.addFileToVFS(FONT_FILE, arrayBufferToBase64(buffer));
        doc.addFont(FONT_FILE, FONT_NAME, "normal");
      });
  } else if (!doc.getFontList()[FONT_NAME]) {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/${FONT_FILE}`);
    if (!response.ok) throw new Error("โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ");
    doc.addFileToVFS(FONT_FILE, arrayBufferToBase64(await response.arrayBuffer()));
    doc.addFont(FONT_FILE, FONT_NAME, "normal");
    return;
  }
  await fontReady;
}

function buildStudentScoreRow(student: StudentRecord, visibleAssignments: ScoreAssignment[], allAssignments: ScoreAssignment[], entries: ScoreEntry[]) {
  const visibleScores = visibleAssignments.map((assignment) => scoreCellLabel(findScoreEntry(entries, assignment.id, student.id), assignment));
  const allStudentEntries = allAssignments.map((assignment) => findScoreEntry(entries, assignment.id, student.id));
  const total = allStudentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry?.finalScore ?? 0 : 0), 0);
  const totalMax = allAssignments.reduce((sum, assignment, index) => sum + (scoreEntryCountsTowardTotal(allStudentEntries[index]) ? assignment.finalMax : 0), 0);
  return [
    String(student.no || ""),
    student.studentId,
    student.name,
    ...visibleScores,
    `${formatPdfScore(total)} / ${formatPdfScore(totalMax)}`
  ];
}

function findScoreEntry(entries: ScoreEntry[], assignmentId: string, studentRecordId: string) {
  return entries.find((entry) => entry.assignmentId === assignmentId && entry.studentRecordId === studentRecordId);
}

function scoreEntryCountsTowardTotal(entry: ScoreEntry | undefined) {
  return entry?.status === "scored" || entry?.status === "expired" || entry?.status === "no_score";
}

function scoreCellLabel(entry: ScoreEntry | undefined, assignment: ScoreAssignment) {
  if (!entry || entry.status === "ungraded") return "-";
  if (entry.status === "leave") return "ลา";
  if (entry.status === "expired") return `0 / ${formatPdfScore(assignment.finalMax)}\nหมดเวลาส่ง`;
  if (entry.status === "no_score") return `0 / ${formatPdfScore(assignment.finalMax)}\nไม่มีคะแนน`;
  return `${formatPdfScore(entry.finalScore)} / ${formatPdfScore(assignment.finalMax)}`;
}

function chunkAssignments(assignments: ScoreAssignment[]) {
  const chunks: ScoreAssignment[][] = [];
  for (let index = 0; index < assignments.length; index += ASSIGNMENTS_PER_TABLE) {
    chunks.push(assignments.slice(index, index + ASSIGNMENTS_PER_TABLE));
  }
  return chunks;
}

function formatPdfScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function safePdfFileName(name: string) {
  return name.replace(/[^\w.\-\u0E00-\u0E7F]+/g, "-");
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}
