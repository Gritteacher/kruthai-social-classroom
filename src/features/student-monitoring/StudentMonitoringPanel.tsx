import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, MessageCircle, Send, Users, X } from "lucide-react";
import type { Classroom, ScoreAssignment, ScoreEntry, StudentRecord, SubmissionRecord } from "../../types";
import { exportStudentMonitoringExcel } from "../../services/studentMonitoringExportService";
import {
  buildStudentMonitorRows,
  DEFAULT_STUDENT_MONITOR_CRITERIA,
  DEFAULT_STUDENT_MONITOR_MESSAGE,
  formatStudentMonitorMessage,
  monitorGroupLabel,
  type StudentMonitorGroup,
  type StudentNotificationMessage
} from "./monitoring";

type StudentMonitoringPanelProps = {
  classrooms: Classroom[];
  selectedClassroomId: string;
  onClassroomChange: (id: string) => void;
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  entries: ScoreEntry[];
  submissions: SubmissionRecord[];
  busy: boolean;
  flash: (message: string) => void;
  onSendMessages: (messages: StudentNotificationMessage[]) => Promise<boolean>;
};

const GROUP_ORDER: StudentMonitorGroup[] = ["both", "missing-work", "low-score"];

export default function StudentMonitoringPanel({
  classrooms,
  selectedClassroomId,
  onClassroomChange,
  students,
  assignments,
  entries,
  submissions,
  busy,
  flash,
  onSendMessages
}: StudentMonitoringPanelProps) {
  const [criteria, setCriteria] = useState(DEFAULT_STUDENT_MONITOR_CRITERIA);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [messageTemplate, setMessageTemplate] = useState(DEFAULT_STUDENT_MONITOR_MESSAGE);
  const [messageOpen, setMessageOpen] = useState(false);
  const selectedClassroom = classrooms.find((classroom) => classroom.id === selectedClassroomId);
  const rows = useMemo(
    () => buildStudentMonitorRows(students, assignments, entries, submissions, criteria),
    [assignments, criteria, entries, students, submissions]
  );
  const selectedRows = rows.filter((row) => selectedStudentIds.has(row.student.id));
  const groupedRows = GROUP_ORDER.map((group) => ({ group, rows: rows.filter((row) => row.group === group) })).filter((section) => section.rows.length);

  useEffect(() => {
    const visibleIds = new Set(rows.map((row) => row.student.id));
    setSelectedStudentIds((current) => new Set([...current].filter((id) => visibleIds.has(id))));
  }, [rows]);

  useEffect(() => {
    if (!messageOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setMessageOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, messageOpen]);

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function toggleAll() {
    if (selectedStudentIds.size === rows.length) {
      setSelectedStudentIds(new Set());
      return;
    }
    setSelectedStudentIds(new Set(rows.map((row) => row.student.id)));
  }

  function exportRows() {
    try {
      exportStudentMonitoringExcel(selectedClassroom, rows);
    } catch (error) {
      flash(error instanceof Error ? error.message : "ส่งออกรายชื่อไม่สำเร็จ");
    }
  }

  async function sendSelectedMessages() {
    const messages = selectedRows.map((row) => ({
      student: row.student,
      body: formatStudentMonitorMessage(messageTemplate, row)
    })).filter((message) => message.body);
    if (!messages.length) return flash("เลือกนักเรียนและพิมพ์ข้อความก่อนส่ง");
    const sent = await onSendMessages(messages);
    if (!sent) return;
    setMessageOpen(false);
    setSelectedStudentIds(new Set());
  }

  const preview = selectedRows[0] ? formatStudentMonitorMessage(messageTemplate, selectedRows[0]) : "";

  return (
    <section className="panel student-monitor-panel">
      <div className="student-monitor-heading">
        <div><span className="student-monitor-eyebrow"><AlertTriangle aria-hidden />ระบบคัดกรอง</span><h2>ติดตามนักเรียน</h2><p>รายชื่อจะเปลี่ยนอัตโนมัติเมื่อคะแนนหรือการส่งงานเปลี่ยน โดยระบบจะไม่แก้ไขคะแนนและสถานะงาน</p></div>
        <span className="student-monitor-count"><Users aria-hidden /><strong>{rows.length}</strong> คน</span>
      </div>

      <div className="student-monitor-filters">
        <label className="field student-monitor-classroom">ห้องเรียน
          <select value={selectedClassroomId} onChange={(event) => onClassroomChange(event.target.value)}>
            {classrooms.map((classroom) => <option value={classroom.id} key={classroom.id}>{classroom.displayName}</option>)}
          </select>
        </label>
        <fieldset className="student-monitor-mode"><legend>วัดคะแนนจาก</legend><div>
          <button className={criteria.scoreMode === "percentage" ? "active" : ""} type="button" onClick={() => setCriteria((current) => ({ ...current, scoreMode: "percentage" }))}>ร้อยละ</button>
          <button className={criteria.scoreMode === "score" ? "active" : ""} type="button" onClick={() => setCriteria((current) => ({ ...current, scoreMode: "score" }))}>คะแนนรวม</button>
        </div></fieldset>
        <label className="field">คะแนนต่ำกว่า
          <div className="student-monitor-number"><input type="number" min="0" max={criteria.scoreMode === "percentage" ? 100 : undefined} value={criteria.threshold} onChange={(event) => setCriteria((current) => ({ ...current, threshold: Number(event.target.value) }))} /><span>{criteria.scoreMode === "percentage" ? "%" : "คะแนน"}</span></div>
        </label>
        <label className="field">งานค้างอย่างน้อย
          <div className="student-monitor-number"><input type="number" min="1" value={criteria.minimumMissing} disabled={Boolean(criteria.assignmentId)} onChange={(event) => setCriteria((current) => ({ ...current, minimumMissing: Number(event.target.value) }))} /><span>งาน</span></div>
        </label>
        <label className="field student-monitor-assignment">ตรวจงานที่ยังไม่ส่ง
          <select value={criteria.assignmentId} onChange={(event) => setCriteria((current) => ({ ...current, assignmentId: event.target.value, minimumMissing: 1 }))}>
            <option value="">ทุกงาน</option>
            {assignments.filter((assignment) => assignment.acceptingSubmissions).map((assignment) => <option value={assignment.id} key={assignment.id}>{assignment.title}</option>)}
          </select>
        </label>
        <fieldset className="student-monitor-mode"><legend>เงื่อนไขรายชื่อ</legend><div>
          <button className={criteria.matchMode === "any" ? "active" : ""} type="button" onClick={() => setCriteria((current) => ({ ...current, matchMode: "any" }))}>อย่างใดอย่างหนึ่ง</button>
          <button className={criteria.matchMode === "both" ? "active" : ""} type="button" onClick={() => setCriteria((current) => ({ ...current, matchMode: "both" }))}>ตรงทั้งสองข้อ</button>
        </div></fieldset>
      </div>

      <div className="student-monitor-summary" aria-label="สรุปผลการคัดกรอง">
        {GROUP_ORDER.map((group) => {
          const count = rows.filter((row) => row.group === group).length;
          return <div className={`student-monitor-summary-item ${group}`} key={group}><span>{monitorGroupLabel(group)}</span><strong>{count}</strong><small>คน</small></div>;
        })}
      </div>

      <div className="student-monitor-toolbar">
        <label className="student-monitor-select-all"><input type="checkbox" checked={Boolean(rows.length) && selectedStudentIds.size === rows.length} onChange={toggleAll} disabled={!rows.length} /><span>{selectedStudentIds.size ? `เลือกแล้ว ${selectedStudentIds.size} คน` : "เลือกทั้งหมด"}</span></label>
        <div>
          <button className="template-button" type="button" disabled={!rows.length} onClick={exportRows}><FileSpreadsheet aria-hidden />ส่งออก Excel</button>
          <button className="primary-button" type="button" disabled={!selectedStudentIds.size || busy} onClick={() => setMessageOpen(true)}><MessageCircle aria-hidden />แจ้งเตือนที่เลือก</button>
        </div>
      </div>

      {groupedRows.length ? <div className="student-monitor-groups">{groupedRows.map((section) => <section className={`student-monitor-group ${section.group}`} key={section.group}>
        <header><div><span className="student-monitor-group-dot" /><h3>{monitorGroupLabel(section.group)}</h3></div><strong>{section.rows.length} คน</strong></header>
        <div className="student-monitor-list"><div className="student-monitor-list-head"><span /><span>นักเรียน</span><span>คะแนน</span><span>งานค้าง</span></div>{section.rows.map((row) => <label className={`student-monitor-row ${selectedStudentIds.has(row.student.id) ? "selected" : ""}`} key={row.student.id}>
          <input type="checkbox" checked={selectedStudentIds.has(row.student.id)} onChange={() => toggleStudent(row.student.id)} />
          <span className="student-monitor-identity"><strong>{row.student.name}</strong><small>เลขที่ {row.student.no} · รหัส {row.student.studentId}</small></span>
          <span className="student-monitor-score"><strong>{formatScore(row.earned)} / {formatScore(row.total)}</strong><small>{formatScore(row.percentage)}%</small></span>
          <span className="student-monitor-missing"><strong>{row.missingAssignments.length} งาน</strong><small>{row.missingAssignments.map((assignment) => assignment.title).join(" · ") || "ไม่มีงานค้าง"}</small></span>
        </label>)}</div>
      </section>)}</div> : <div className="student-monitor-empty"><Check aria-hidden /><strong>ไม่พบนักเรียนตามเงื่อนไข</strong><span>ลองปรับเกณฑ์ หรือห้องนี้อาจไม่มีนักเรียนที่ต้องติดตามแล้ว</span></div>}

      {messageOpen && <div className="modal-backdrop student-monitor-message-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setMessageOpen(false); }}>
        <section className="student-monitor-message-modal" role="dialog" aria-modal="true" aria-labelledby="student-monitor-message-title">
          <header><div><span>แจ้งผ่านแชทของระบบ</span><h2 id="student-monitor-message-title">ส่งข้อความถึง {selectedRows.length} คน</h2></div><button className="icon-button" type="button" disabled={busy} onClick={() => setMessageOpen(false)} aria-label="ปิด"><X aria-hidden /></button></header>
          <div className="student-monitor-message-body">
            <label className="field">ข้อความ<textarea rows={6} value={messageTemplate} onChange={(event) => setMessageTemplate(event.target.value)} /></label>
            <small className="student-monitor-tokens">ใช้ตัวแปรได้: {"{ชื่อ}"} {"{คะแนน}"} {"{คะแนนเต็ม}"} {"{เปอร์เซ็นต์}"} {"{จำนวนงานค้าง}"} {"{งานค้าง}"}</small>
            {preview && <div className="student-monitor-message-preview"><span>ตัวอย่างสำหรับ {selectedRows[0].student.name}</span><p>{preview}</p></div>}
          </div>
          <footer><button className="template-button" type="button" disabled={busy} onClick={() => setMessageOpen(false)}>ยกเลิก</button><button className="primary-button" type="button" disabled={busy || !messageTemplate.trim()} onClick={() => void sendSelectedMessages()}><Send aria-hidden />{busy ? "กำลังส่ง" : `ยืนยันส่ง ${selectedRows.length} คน`}</button></footer>
        </section>
      </div>}
    </section>
  );
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
