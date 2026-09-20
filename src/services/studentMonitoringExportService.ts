import type { Classroom } from "../types";
import type { StudentMonitorRow } from "../features/student-monitoring/monitoring";
import { monitorGroupLabel } from "../features/student-monitoring/monitoring";

export function exportStudentMonitoringExcel(classroom: Classroom | undefined, rows: StudentMonitorRow[]) {
  if (!classroom) throw new Error("กรุณาเลือกห้องเรียนก่อนส่งออก");
  if (!rows.length) throw new Error("ไม่มีรายชื่อนักเรียนตามเงื่อนไขที่กำหนด");

  const generatedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const html = `<!doctype html>
<html><head><meta charset="utf-8" /><style>
body{font-family:Prompt,Tahoma,sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d9dde3;padding:7px;font-size:12px}th{background:#edf5ee;text-align:center}.center{text-align:center}.meta td{border:0;font-size:14px}.name{min-width:220px}
</style></head><body>
<table class="meta"><tr><td colspan="9"><strong>รายชื่อนักเรียนที่ต้องติดตาม</strong></td></tr><tr><td colspan="9">${escapeHtml(classroom.displayName)} · ปีการศึกษา ${escapeHtml(classroom.academicYear)}</td></tr><tr><td colspan="9">ส่งออกเมื่อ ${escapeHtml(generatedAt)} · ${rows.length} คน</td></tr></table>
<table><thead><tr><th>เลขที่</th><th>รหัสนักเรียน</th><th class="name">ชื่อ-นามสกุล</th><th>คะแนนที่ได้</th><th>คะแนนเต็ม</th><th>ร้อยละ</th><th>กลุ่มติดตาม</th><th>งานค้าง</th><th>ชื่องานที่ค้าง</th></tr></thead>
<tbody>${rows.map((row) => `<tr><td class="center">${row.student.no}</td><td class="center">${escapeHtml(row.student.studentId)}</td><td>${escapeHtml(row.student.name)}</td><td class="center">${formatScore(row.earned)}</td><td class="center">${formatScore(row.total)}</td><td class="center">${formatScore(row.percentage)}</td><td>${escapeHtml(monitorGroupLabel(row.group))}</td><td class="center">${row.missingAssignments.length}</td><td>${escapeHtml(row.missingAssignments.map((assignment) => assignment.title).join(", ") || "-")}</td></tr>`).join("")}</tbody></table>
</body></html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `ติดตามนักเรียน-${safeFileName(classroom.displayName)}.xls`);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] || character);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "ห้องเรียน";
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
