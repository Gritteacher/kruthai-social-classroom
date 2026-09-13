import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, History, RefreshCw } from "lucide-react";
import type { Classroom, ScoreAssignment, StudentRecord } from "../../types";
import { fetchScoreHistory } from "../../services/scoreHistoryService";
import { rawLabel, scoreLabel } from "./format";
import type { HistoryCursor, ScoreHistoryItem } from "./types";
import "./score-history.css";

const operations = { baseline:"ข้อมูลเริ่มต้น", insert:"เพิ่มคะแนน", update:"แก้ไขคะแนน", delete:"ลบคะแนน" };
const dateFormat = new Intl.DateTimeFormat("th-TH",{dateStyle:"medium",timeStyle:"medium",timeZone:"Asia/Bangkok"});

export default function ScoreHistoryPanel({ classrooms, classroomId, onClassroomChange, students, assignments }: {
  classrooms: Classroom[]; classroomId: string; onClassroomChange: (id: string) => void;
  students: StudentRecord[]; assignments: ScoreAssignment[];
}) {
  const [studentId,setStudentId] = useState("");
  const [assignmentId,setAssignmentId] = useState("");
  const [includeBaseline,setIncludeBaseline] = useState(false);
  const [items,setItems] = useState<ScoreHistoryItem[]>([]);
  const [hasMore,setHasMore] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const filters = { classroomId,studentId,assignmentId,includeBaseline };

  async function load(cursor?: HistoryCursor) {
    if (cursor && inFlight.current) return;
    const id = ++requestId.current;
    inFlight.current = true;
    setBusy(true); setError("");
    if (!cursor) { setItems([]); setHasMore(false); }
    try {
      const result = await fetchScoreHistory(filters,cursor);
      if (id !== requestId.current) return;
      setItems(current => cursor ? [...current,...result.items.filter(row=>!current.some(old=>old.id===row.id))] : result.items);
      setHasMore(result.hasMore);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "โหลดประวัติไม่สำเร็จ");
    } finally {
      if (id === requestId.current) { inFlight.current=false; setBusy(false); }
    }
  }
  useEffect(() => {
    void load();
    return () => { requestId.current++; inFlight.current=false; };
  },[classroomId,studentId,assignmentId,includeBaseline]);

  return <section className="score-history" aria-label="ประวัติการแก้คะแนน">
    <header className="score-history-heading">
      <h2><History aria-hidden />ประวัติการแก้คะแนน</h2>
      <button className="icon-button history-refresh" type="button" onClick={()=>void load()} disabled={busy} title="โหลดประวัติใหม่" aria-label="โหลดประวัติใหม่"><RefreshCw aria-hidden /></button>
    </header>
    <div className="score-history-filters">
      <label className="field">ห้องเรียน<select value={classroomId} onChange={e=>onClassroomChange(e.target.value)}><option value="">เลือกห้องเรียน</option>{classrooms.map(room=><option key={room.id} value={room.id}>{room.displayName}</option>)}</select></label>
      <label className="field">นักเรียน<select value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">ทุกคน</option>{students.map(student=><option key={student.id} value={student.id}>{student.no}. {student.name}</option>)}</select></label>
      <label className="field">งานคะแนน<select value={assignmentId} onChange={e=>setAssignmentId(e.target.value)}><option value="">ทุกงาน</option>{assignments.map(work=><option key={work.id} value={work.id}>{work.title}</option>)}</select></label>
    </div>
    <label className="score-history-baseline"><input type="checkbox" checked={includeBaseline} onChange={e=>setIncludeBaseline(e.target.checked)} />รวมข้อมูลเริ่มต้น</label>
    {error && <p className="score-history-error" role="alert">{error}</p>}
    {items.length > 0 && <div className="score-history-table">
      <div className="score-history-columns" aria-hidden="true"><span>นักเรียน / งาน</span><span>ก่อน</span><span /><span>หลัง</span><span>ผู้ดำเนินการ / เวลา</span></div>
      {items.map(item=><article className="score-history-row" key={item.id}>
        <div className="history-identity"><strong>{item.student_name || item.student_code}</strong><span>{item.assignment_title || "งานที่ถูกลบ"}</span><small>{operations[item.operation]}</small></div>
        <div className="history-before"><small className="history-mobile-label">ก่อน</small><strong>{scoreLabel(item.before_score)}</strong><small>{rawLabel(item.before_score)}</small></div>
        <ArrowRight className="history-arrow" aria-hidden />
        <div className="history-after"><small className="history-mobile-label">หลัง</small><strong>{scoreLabel(item.after_score)}</strong><small>{rawLabel(item.after_score)}</small></div>
        <div className="history-actor"><span>{item.actor_type === "baseline" ? "เริ่มเก็บข้อมูล" : item.actor_name || (item.actor_type === "system" ? "ระบบ / ผู้ดูแลฐานข้อมูล" : "ผู้ใช้ที่ไม่พบชื่อ")}</span><time dateTime={item.changed_at}>{dateFormat.format(new Date(item.changed_at))}</time></div>
      </article>)}
    </div>}
    {!items.length && !busy && !error && <p className="score-history-empty">{classroomId ? "ยังไม่มีประวัติการเปลี่ยนคะแนน" : "ยังไม่ได้เลือกห้องเรียน"}</p>}
    <footer className="score-history-footer">
      <span role="status">{busy ? "กำลังโหลดประวัติ..." : `แสดง ${items.length} รายการ`}</span>
      {hasMore && <button type="button" className="template-button" disabled={busy} onClick={()=>void load(items[items.length-1])}><ArrowDown aria-hidden />โหลดเพิ่มเติม</button>}
    </footer>
  </section>;
}
