import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CheckCircle2, Clock3, FileX2, History, RefreshCw, Search, Send, Trash2 } from "lucide-react";
import type { Classroom, Role } from "../../types";
import { fetchSubmissionHistory } from "../../services/submissionHistoryService";
import type { SubmissionHistoryCursor, SubmissionHistoryEvent, SubmissionHistoryItem, SubmissionHistoryState } from "./types";
import "./submission-history.css";

const eventLabels: Record<SubmissionHistoryEvent, string> = {
  baseline: "ข้อมูลเดิมในระบบ",
  submitted: "ส่งงาน",
  reviewed: "ตรวจและให้คะแนน",
  score_changed: "แก้ไขคะแนน",
  status_changed: "เปลี่ยนสถานะ",
  attachment_removed: "ลบไฟล์ตามกำหนด",
  deleted: "ลบรายการส่งงาน"
};

const dateFormat = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Bangkok"
});

function eventIcon(event: SubmissionHistoryEvent) {
  if (event === "submitted" || event === "baseline") return <Send aria-hidden />;
  if (event === "reviewed" || event === "score_changed") return <CheckCircle2 aria-hidden />;
  if (event === "attachment_removed") return <FileX2 aria-hidden />;
  if (event === "deleted") return <Trash2 aria-hidden />;
  return <Clock3 aria-hidden />;
}

function stateFor(item: SubmissionHistoryItem) {
  return item.after_state || item.before_state;
}

function resultText(item: SubmissionHistoryItem) {
  const before = item.before_state;
  const after = item.after_state;
  if (item.event_type === "score_changed" && before && after) {
    return `คะแนน ${before.final_score}/${before.final_max} → ${after.final_score}/${after.final_max}`;
  }
  if (item.event_type === "status_changed" && before && after) return `${before.status} → ${after.status}`;
  const state = after || before;
  if (!state || state.status !== "ตรวจแล้ว") return "";
  return `${state.final_score} / ${state.final_max} คะแนน`;
}

function attachmentText(item: SubmissionHistoryItem, state: SubmissionHistoryState | null) {
  if (!state || state.attachment_type === "none") return "";
  if (state.attachment_type === "link") return "แนบลิงก์";
  return item.attachment_name ? `ไฟล์ ${item.attachment_name}` : "แนบไฟล์";
}

function actorText(item: SubmissionHistoryItem) {
  if (item.actor_type === "baseline") return "ข้อมูลที่มีอยู่ก่อนเริ่มเก็บประวัติ";
  if (item.actor_type === "system") return "ดำเนินการโดยระบบ";
  if (item.actor_type === "teacher") return `ครู ${item.actor_name || "ผู้สอน"}`;
  return item.actor_name || item.student_name;
}

export default function SubmissionHistoryPanel({ role, classrooms }: { role: Role; classrooms: Classroom[] }) {
  const [classroomId, setClassroomId] = useState("");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<SubmissionHistoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const inFlight = useRef(false);

  async function load(cursor?: SubmissionHistoryCursor) {
    if (cursor && inFlight.current) return;
    const id = ++requestId.current;
    inFlight.current = true;
    setBusy(true);
    setError("");
    if (!cursor) {
      setItems([]);
      setHasMore(false);
    }
    try {
      const result = await fetchSubmissionHistory({ classroomId: role === "teacher" ? classroomId : "", category }, cursor);
      if (id !== requestId.current) return;
      setItems((current) => cursor
        ? [...current, ...result.items.filter((row) => !current.some((old) => old.id === row.id))]
        : result.items);
      setHasMore(result.hasMore);
    } catch (cause) {
      if (id === requestId.current) setError(cause instanceof Error ? cause.message : "โหลดประวัติไม่สำเร็จ");
    } finally {
      if (id === requestId.current) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }

  useEffect(() => {
    void load();
    return () => {
      requestId.current += 1;
      inFlight.current = false;
    };
  }, [role, classroomId, category]);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th");
    if (!query) return items;
    return items.filter((item) => [
      item.assignment_title,
      item.student_name,
      item.student_code,
      item.classroom_name,
      ...item.group_member_names,
      ...item.group_member_codes
    ].some((value) => value.toLocaleLowerCase("th").includes(query)));
  }, [items, search]);

  const tabs = role === "teacher"
    ? [["all", "ทั้งหมด"], ["submitted", "การส่งงาน"], ["reviewed", "การตรวจ"], ["status", "สถานะ"], ["deleted", "การลบ"]]
    : [["all", "ทั้งหมด"], ["submitted", "การส่งงาน"], ["reviewed", "ผลการตรวจ"], ["status", "สถานะ"]];

  return <section className="submission-history-panel panel" aria-label="ประวัติการส่งงานและตรวจงาน">
    <header className="submission-history-heading">
      <div><span>กิจกรรมย้อนหลัง</span><h2><History aria-hidden />ประวัติการส่งงานและตรวจงาน</h2></div>
      <button className="icon-button submission-history-refresh" type="button" onClick={() => void load()} disabled={busy} title="โหลดประวัติใหม่" aria-label="โหลดประวัติใหม่"><RefreshCw aria-hidden /></button>
    </header>

    <div className="submission-history-tabs" role="tablist" aria-label="ประเภทประวัติ">
      {tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={category === value} className={category === value ? "active" : ""} onClick={() => setCategory(value)}>{label}</button>)}
    </div>

    <div className={`submission-history-filters ${role === "student" ? "student" : ""}`}>
      {role === "teacher" && <label className="field">ห้องเรียน<select value={classroomId} onChange={(event) => setClassroomId(event.target.value)}><option value="">ทุกห้องเรียน</option>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.displayName}</option>)}</select></label>}
      <label className="field submission-history-search">ค้นหาในรายการที่โหลด<div><Search aria-hidden /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={role === "teacher" ? "ชื่อ รหัสนักเรียน หรืองาน" : "ค้นหาชื่องาน"} /></div></label>
    </div>

    {error && <p className="submission-history-error" role="alert">{error}</p>}
    {visibleItems.length > 0 && <div className="submission-history-list">{visibleItems.map((item) => {
      const state = stateFor(item);
      const result = resultText(item);
      const attachment = attachmentText(item, state);
      return <article className={`submission-history-item event-${item.event_type}`} key={item.id}>
        <div className="submission-history-icon">{eventIcon(item.event_type)}</div>
        <div className="submission-history-main">
          <div className="submission-history-title"><strong>{item.assignment_title || "งานที่ถูกลบ"}</strong><span>{eventLabels[item.event_type]}</span></div>
          {role === "teacher" && <p>{item.student_name || item.student_code}<small>รหัส {item.student_code}</small></p>}
          <div className="submission-history-meta">
            {item.classroom_name && <span>{item.classroom_name}</span>}
            <span>{item.submission_kind === "group" ? `งานกลุ่ม ${item.group_member_codes.length} คน` : "งานเดี่ยว"}</span>
            {state?.status && <span>สถานะ {state.status}</span>}
            {attachment && <span>{attachment}</span>}
            {result && <strong>{result}</strong>}
          </div>
          {item.submission_kind === "group" && item.group_member_names.length > 0 && <small className="submission-history-members">สมาชิก: {item.group_member_names.join(", ")}</small>}
          {item.event_type === "attachment_removed" && <small className="submission-history-note">ข้อมูลการส่งและคะแนนยังคงอยู่ แม้ไฟล์หมดระยะเวลาเก็บรักษา</small>}
        </div>
        <div className="submission-history-time"><time dateTime={item.occurred_at}>{dateFormat.format(new Date(item.occurred_at))}</time><span>{actorText(item)}</span></div>
      </article>;
    })}</div>}
    {!visibleItems.length && !busy && !error && <div className="submission-history-empty"><History aria-hidden /><strong>{search.trim() ? "ไม่พบรายการที่ค้นหา" : "ยังไม่มีประวัติในหมวดนี้"}</strong><span>กิจกรรมใหม่จะปรากฏที่นี่โดยอัตโนมัติ</span></div>}

    <footer className="submission-history-footer">
      <span role="status">{busy ? "กำลังโหลดประวัติ..." : `แสดง ${visibleItems.length} รายการ`}</span>
      {hasMore && <button className="template-button" type="button" disabled={busy} onClick={() => void load(items[items.length - 1])}><ArrowDown aria-hidden />โหลดเพิ่มเติม</button>}
    </footer>
  </section>;
}
