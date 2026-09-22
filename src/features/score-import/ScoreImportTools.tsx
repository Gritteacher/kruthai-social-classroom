import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { useModalDismiss } from "../../components/dialogs/AppDialogProvider";
import type { Classroom, ScoreAssignment, ScoreEntry, StudentRecord } from "../../types";
import {
  downloadScoreImportTemplate,
  parseScoreImportFile,
  type ScoreImportChange,
  type ScoreImportPreview
} from "./scoreImport";
import "./scoreImport.css";

export default function ScoreImportTools({
  classroom,
  students,
  assignments,
  entries,
  busy,
  flash,
  onImport
}: {
  classroom?: Classroom;
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  entries: ScoreEntry[];
  busy: boolean;
  flash: (message: string) => void;
  onImport: (classroomId: string, changes: ScoreImportChange[]) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ScoreImportPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const locked = busy || parsing;
  useModalDismiss(Boolean(preview), () => setPreview(null), locked);

  const ready = Boolean(classroom && students.length && assignments.length);
  async function downloadTemplate() {
    if (!classroom) return flash("เลือกห้องเรียนก่อนดาวน์โหลดไฟล์ต้นแบบ");
    if (!students.length) return flash("ห้องนี้ยังไม่มีรายชื่อนักเรียน");
    if (!assignments.length) return flash("ห้องนี้ยังไม่มีงานคะแนน");
    setParsing(true);
    try {
      await downloadScoreImportTemplate({ classroom, students, assignments, entries });
      flash("ดาวน์โหลดไฟล์ต้นแบบแล้ว");
    } catch (error) {
      flash(error instanceof Error ? error.message : "สร้างไฟล์ต้นแบบไม่สำเร็จ");
    } finally {
      setParsing(false);
    }
  }

  async function chooseFile(file: File | null) {
    if (!file || !classroom) return;
    setParsing(true);
    try {
      setPreview(await parseScoreImportFile(file, { classroom, students, assignments, entries }));
    } catch (error) {
      flash(error instanceof Error ? error.message : "อ่านไฟล์คะแนนไม่สำเร็จ");
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!preview || !classroom || preview.issues.some((issue) => issue.level === "error") || !preview.changes.length) return;
    const saved = await onImport(classroom.id, preview.changes);
    if (saved) setPreview(null);
  }

  const errorCount = preview?.issues.filter((issue) => issue.level === "error").length ?? 0;
  const warningCount = preview?.issues.filter((issue) => issue.level === "warning").length ?? 0;
  return <>
    <div className="score-import-toolbar">
      <div><strong>นำเข้าคะแนนจาก Excel</strong><span>ดาวน์โหลดไฟล์ของห้องนี้ แก้คะแนน แล้วนำกลับเข้าระบบ</span></div>
      <div>
        <button className="template-button" type="button" disabled={locked || !ready} onClick={() => void downloadTemplate()}><Download aria-hidden />ไฟล์ต้นแบบ</button>
        <button className="primary-button" type="button" disabled={locked || !ready} onClick={() => inputRef.current?.click()}><Upload aria-hidden />{parsing ? "กำลังอ่านไฟล์" : "เลือกไฟล์คะแนน"}</button>
        <input ref={inputRef} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
      </div>
    </div>
    {preview && <div className="modal-backdrop score-import-backdrop" role="presentation" onPointerDown={(event) => { if (event.currentTarget === event.target && !locked) setPreview(null); }}>
      <section className="score-import-modal" role="dialog" aria-modal="true" aria-labelledby="score-import-title">
        <header className="app-dialog-header">
          <span className="app-dialog-icon"><FileSpreadsheet aria-hidden /></span>
          <div><span>ตรวจสอบก่อนบันทึก</span><h2 id="score-import-title">นำเข้าคะแนน {preview.classroomName}</h2></div>
          <button className="app-dialog-close" type="button" disabled={locked} onClick={() => setPreview(null)} aria-label="ปิด"><X aria-hidden /></button>
        </header>
        <div className="app-dialog-body score-import-body">
          <div className="score-import-summary">
            <div><span>นักเรียนที่พบ</span><strong>{preview.matchedStudentCount}</strong></div>
            <div><span>งานที่พบ</span><strong>{preview.matchedAssignmentCount}</strong></div>
            <div><span>ช่องที่จะเปลี่ยน</span><strong>{preview.changes.length}</strong></div>
          </div>
          <p className="score-import-file"><FileSpreadsheet aria-hidden />{preview.fileName}</p>
          {preview.issues.length > 0 && <div className="score-import-issues">
            {preview.issues.map((issue, index) => <div className={issue.level} key={`${issue.message}-${index}`}>{issue.level === "error" ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden />}<span>{issue.row ? `แถว ${issue.row}: ` : ""}{issue.message}</span></div>)}
          </div>}
          {preview.changes.length > 0 && <div className="score-import-table-wrap"><table className="score-import-table">
            <thead><tr><th>นักเรียน</th><th>งาน</th><th>ค่าเดิม</th><th>ค่าใหม่</th></tr></thead>
            <tbody>{preview.changes.slice(0, 100).map((change) => <tr key={`${change.studentRecordId}-${change.assignmentId}`}><td><strong>{change.studentName}</strong><small>{change.studentCode}</small></td><td>{change.assignmentTitle}</td><td>{change.previousLabel}</td><td><strong>{change.nextLabel}</strong>{change.status === "scored" && <small>เก็บ {change.finalScore} / {change.finalMax}</small>}</td></tr>)}</tbody>
          </table>{preview.changes.length > 100 && <p>แสดง 100 จาก {preview.changes.length} รายการ</p>}</div>}
        </div>
        <footer className="app-dialog-actions">
          <button className="template-button" type="button" disabled={locked} onClick={() => setPreview(null)}>ยกเลิก</button>
          <button className="primary-button" type="button" disabled={locked || errorCount > 0 || !preview.changes.length} onClick={() => void confirmImport()}><Upload aria-hidden />{busy ? "กำลังบันทึก" : errorCount ? `แก้ข้อผิดพลาด ${errorCount} จุด` : `ยืนยัน ${preview.changes.length} ช่อง${warningCount ? ` · เตือน ${warningCount}` : ""}`}</button>
        </footer>
      </section>
    </div>}
  </>;
}
