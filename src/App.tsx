import { FormEvent, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CloudUpload,
  Download,
  Eye,
  FileSpreadsheet,
  GraduationCap,
  Home,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Search,
  ShieldCheck,
  Upload,
  User,
  Users
} from "lucide-react";
import { materials, rosterPreview, scoreRows as baseScoreRows, studentScores, submissions } from "./data/mockData";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type { AppSession, Material, MaterialType, NavItem, Role, ScoreRow, ViewKey } from "./types";

type MaterialUpload = { file: File | null; title: string; unit: string; level: string; type: MaterialType };

const SCHOOL_LOGO = "/kruthai-logo.png";
const sessions: Record<Role, AppSession> = {
  teacher: { role: "teacher", name: "คุณครูไต๋", room: "โรงเรียนวัดสามัคคีธรรม", school: "ห้องเรียนสังคมศึกษา" },
  student: { role: "student", name: "สมชาย ดีมาก", room: "ชั้นมัธยมศึกษาปีที่ 3/1", school: "โรงเรียนวัดสามัคคีธรรม" }
};
const teacherNav: NavItem[] = [
  { key: "home", label: "หน้าหลัก", icon: Home },
  { key: "materials", label: "สื่อการสอน", icon: BookOpen },
  { key: "scores", label: "คะแนน", icon: BarChart3 },
  { key: "work", label: "ตรวจงาน", icon: ClipboardCheck },
  { key: "students", label: "รายชื่อ", icon: Users }
];
const studentNav: NavItem[] = [
  { key: "home", label: "หน้าหลัก", icon: Home },
  { key: "materials", label: "สื่อการสอน", icon: BookOpen },
  { key: "work", label: "ส่งงาน", icon: CloudUpload },
  { key: "scores", label: "คะแนน", icon: BarChart3 },
  { key: "profile", label: "โปรไฟล์", icon: User }
];
const filters: Array<"ทั้งหมด" | MaterialType | "ม.1" | "ม.2" | "ม.3"> = ["ทั้งหมด", "ม.1", "ม.2", "ม.3", "VIDEO", "PDF"];
const materialTypes: MaterialType[] = ["PDF", "VIDEO", "IMG"];

function App() {
  const [role, setRole] = useState<Role>("teacher");
  const [session, setSession] = useState<AppSession | null>(null);
  const [view, setView] = useState<ViewKey>("home");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ScoreRow[]>(baseScoreRows);
  const [materialItems, setMaterialItems] = useState<Material[]>(materials);
  const nav = session?.role === "student" ? studentNav : teacherNav;
  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  async function login(email: string, password: string) {
    setBusy(true);
    if (isSupabaseConfigured && email.includes("@")) {
      const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return flash(error.message);
      setSession({ ...sessions[role], name: (data.user?.user_metadata?.full_name as string) || sessions[role].name });
    } else {
      setBusy(false);
      setSession(sessions[role]);
      flash("เข้าสู่โหมดทดลองใช้งาน");
    }
    setView("home");
  }

  async function requestPasswordReset(email: string) {
    if (!email.includes("@")) return flash("กรอกอีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง");
    if (!isSupabaseConfigured) return flash("โหมดทดลองยังไม่ส่งอีเมลรีเซ็ตรหัสผ่าน");
    setBusy(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setBusy(false);
    if (error) return flash(error.message);
    flash(`ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${email} แล้ว`);
  }

  async function logout() {
    if (isSupabaseConfigured) await supabase!.auth.signOut();
    setSession(null);
    setView("home");
  }

  async function saveScores() {
    setBusy(true);
    if (isSupabaseConfigured) {
      const payload = rows.map((row) => ({
        student_code: row.studentId,
        assessment_title: "สอบบทที่ 4",
        score: row.score,
        max_score: row.maxScore,
        passed: row.score >= 15
      }));
      const { error } = await supabase!.from("scores").upsert(payload, { onConflict: "student_code,assessment_title" });
      setBusy(false);
      if (error) return flash(error.message);
    } else {
      localStorage.setItem("kruthai-score-draft", JSON.stringify(rows));
      setBusy(false);
    }
    flash("บันทึกคะแนนเรียบร้อย");
  }

  async function uploadFile(kind: "roster" | "submission", file: File | null) {
    if (!file) return flash(kind === "roster" ? "กรุณาเลือกไฟล์รายชื่อนักเรียน" : "กรุณาเลือกไฟล์งาน");
    setBusy(true);
    if (isSupabaseConfigured) {
      const folder = kind === "roster" ? "rosters" : "submissions";
      const path = `${folder}/${Date.now()}-${file.name}`;
      const upload = await supabase!.storage.from("classroom-files").upload(path, file);
      if (upload.error) {
        setBusy(false);
        return flash(upload.error.message);
      }
      const table = kind === "roster" ? "student_roster_uploads" : "submissions";
      const record =
        kind === "roster"
          ? { class_name: "ม.1/1 - สังคมศึกษา", file_path: path, file_name: file.name, file_size: file.size }
          : { assignment_title: "ใบงานบทที่ 4", student_name: sessions.student.name, student_code: "65010", file_path: path, status: "รอตรวจ" };
      const { error } = await supabase!.from(table).insert(record);
      setBusy(false);
      if (error) return flash(error.message);
    } else {
      setBusy(false);
    }
    flash(kind === "roster" ? `รับไฟล์ ${file.name} แล้ว` : `ส่งงาน ${file.name} เรียบร้อย`);
  }

  async function uploadMaterial({ file, title, unit, level, type }: MaterialUpload) {
    if (!title.trim()) {
      flash("กรุณาใส่ชื่อสื่อการสอน");
      return false;
    }
    if (!file) {
      flash("กรุณาเลือกไฟล์สื่อการสอน");
      return false;
    }
    setBusy(true);
    const storagePath = `materials/${Date.now()}-${file.name}`;
    if (isSupabaseConfigured) {
      const upload = await supabase!.storage.from("classroom-files").upload(storagePath, file);
      if (upload.error) {
        setBusy(false);
        flash(upload.error.message);
        return false;
      }
      const { error } = await supabase!.from("materials").insert({
        title: title.trim(),
        unit: unit.trim() || "สื่อเสริม",
        level,
        material_type: type,
        file_path: storagePath
      });
      if (error) {
        setBusy(false);
        flash(error.message);
        return false;
      }
    }
    setMaterialItems((current) => [
      {
        id: `uploaded-${Date.now()}`,
        title: title.trim(),
        unit: unit.trim() || "สื่อเสริม",
        level,
        type,
        filePath: storagePath,
        date: new Date().toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }),
        accent: "green"
      },
      ...current
    ]);
    setBusy(false);
    flash(`อัปโหลดสื่อ ${title.trim()} เรียบร้อย`);
    return true;
  }

  async function openMaterial(item: Material) {
    if (item.filePath && isSupabaseConfigured) {
      const { data, error } = await supabase!.storage.from("classroom-files").createSignedUrl(item.filePath, 60 * 10);
      if (error || !data?.signedUrl) return flash(error?.message || "เปิดไฟล์ไม่ได้");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return flash(`เปิดไฟล์ ${item.title} ในแท็บใหม่`);
    }
    if (item.image) {
      window.open(item.image, "_blank", "noopener,noreferrer");
      return flash(`เปิดภาพประกอบ ${item.title}`);
    }
    const html = `<!doctype html><html lang="th"><meta charset="utf-8"><title>${item.title}</title><body style="font-family:sans-serif;line-height:1.7;max-width:760px;margin:40px auto;padding:0 20px"><h1>${item.title}</h1><p><strong>${item.unit}</strong> ระดับ ${item.level}</p><p>เอกสารตัวอย่างนี้สร้างจากระบบห้องเรียน เพื่อให้ปุ่มเปิดสื่อใช้งานได้ระหว่างรออัปโหลดไฟล์จริง</p><ul><li>อ่านหัวข้อสำคัญ</li><li>จดคำถามท้ายบท</li><li>ส่งสรุปในคาบถัดไป</li></ul></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank", "noopener,noreferrer");
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    flash(`เปิดตัวอย่างบทเรียน ${item.title}`);
  }

  if (!session) {
    return <Auth role={role} busy={busy} onRole={setRole} onLogin={login} onResetPassword={requestPasswordReset} toast={toast} />;
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="side-brand">
          <img className="side-logo" src={SCHOOL_LOGO} alt="โลโก้โรงเรียน" />
          <div>
            <strong>ห้องเรียนสังคมครูไต๋</strong>
            <small>{session.role === "teacher" ? "พื้นที่ครู" : "พื้นที่นักเรียน"}</small>
          </div>
        </div>
        <nav>{nav.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
        <button className="logout-button" onClick={logout}><LogOut aria-hidden />ออกจากระบบ</button>
      </aside>
      <main className="workspace">
        <header className="top-bar">
          <div>
            <p className="eyebrow">สวัสดี {session.name}</p>
            <h2>{session.room}</h2>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="ค้นหา" onClick={() => { setView("materials"); flash("เปิดคลังสื่อแล้ว ใช้ช่องค้นหาด้านบนได้เลย"); }}><Search aria-hidden /></button>
            <button className="icon-button" title="การแจ้งเตือน" onClick={() => flash("ประกาศล่าสุด: สอบเก็บคะแนนบทที่ 4 วันศุกร์นี้")}><Bell aria-hidden /></button>
            <button className="avatar-button" onClick={logout}>{session.role === "teacher" ? "ค" : "ส"}</button>
          </div>
        </header>
        <section className="content-area">
          {view === "home" && <HomeView session={session} setView={setView} flash={flash} />}
          {view === "materials" && <MaterialsView role={session.role} materials={materialItems} busy={busy} flash={flash} onOpen={openMaterial} onUpload={uploadMaterial} />}
          {view === "scores" && <ScoresView role={session.role} rows={rows} setRows={setRows} busy={busy} saveScores={saveScores} flash={flash} />}
          {view === "work" && <WorkView role={session.role} busy={busy} uploadFile={uploadFile} flash={flash} />}
          {view === "students" && <StudentsView busy={busy} uploadFile={uploadFile} flash={flash} />}
          {view === "profile" && <ProfileView session={session} />}
        </section>
      </main>
      <nav className="bottom-nav">{nav.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Auth({ role, busy, toast, onRole, onLogin, onResetPassword }: { role: Role; busy: boolean; toast: string; onRole: (role: Role) => void; onLogin: (email: string, password: string) => void; onResetPassword: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin(email, password);
  };
  return (
    <main className="auth-page">
      <section className="brand-panel">
        <div className="brand-mark"><img className="brand-logo" src={SCHOOL_LOGO} alt="โลโก้โรงเรียน" /></div>
        <h1>ห้องเรียนสังคมครูไต๋</h1>
        <p>ระบบห้องเรียนออนไลน์วิชาสังคมศึกษา</p>
        <span>v1.2.2</span>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">เข้าสู่ระบบ</p>
          <h2>เลือกบทบาทของคุณ</h2>
          <div className="role-grid">
            <RoleCard selected={role === "teacher"} icon={ShieldCheck} title="ครูผู้สอน" body="อัปโหลดสื่อ จัดการคะแนน ตรวจงาน" onClick={() => onRole("teacher")} />
            <RoleCard selected={role === "student"} icon={GraduationCap} title="นักเรียน" body="เรียนออนไลน์ ส่งงาน ดูคะแนน" onClick={() => onRole("student")} />
          </div>
          <form className="login-form" onSubmit={submit}>
            <label>อีเมล / รหัสนักเรียน<div className="input-shell"><Mail aria-hidden /><input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" /></div></label>
            <label>รหัสผ่าน<div className="input-shell"><Lock aria-hidden /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></div></label>
            <button className="primary-button" disabled={busy}><LogOut aria-hidden />{busy ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"}</button>
          </form>
          <button className="text-button" type="button" onClick={() => onResetPassword(email)}>ลืมรหัสผ่าน?</button>
        </div>
        {toast && <div className="toast auth-toast">{toast}</div>}
      </section>
    </main>
  );
}

function RoleCard({ selected, icon: Icon, title, body, onClick }: { selected: boolean; icon: NavItem["icon"]; title: string; body: string; onClick: () => void }) {
  return <button className={`role-card ${selected ? "selected" : ""}`} onClick={onClick} type="button"><Icon aria-hidden /><span><strong>{title}</strong><small>{body}</small></span>{selected && <CheckCircle2 aria-hidden />}</button>;
}
function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={active ? "active" : ""} onClick={onClick} title={item.label} type="button"><Icon aria-hidden /><span>{item.label}</span></button>;
}

function HomeView({ session, setView, flash }: { session: AppSession; setView: (view: ViewKey) => void; flash: (message: string) => void }) {
  const isTeacher = session.role === "teacher";
  const stats = isTeacher ? [["นักเรียนทั้งหมด", "124", "green"], ["งานรอตรวจ", "18", "coral"], ["ประกาศ", "5", "amber"]] : [["คะแนนรวม", "88/100", "amber"], ["เฉลี่ยห้อง", "78%", "blue"], ["ส่งงาน", "12/12", "green"]];
  return <div className="page-stack"><section className="hero-strip"><div><p className="eyebrow">{session.school}</p><h1>{isTeacher ? "เมนูหลัก" : "บทเรียนล่าสุด"}</h1></div>{!isTeacher && <div className="grade-badge"><strong>A</strong><span>88 / 100</span></div>}</section><div className="stat-grid">{stats.map(([label, value, tone]) => <article className={`stat-card tone-${tone}`} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>{isTeacher ? <TeacherHome setView={setView} /> : <StudentHome setView={setView} flash={flash} />}</div>;
}
function TeacherHome({ setView }: { setView: (view: ViewKey) => void }) {
  const tools = [["อัปโหลดสื่อการสอน", Upload, "materials"], ["จัดการคะแนน", BarChart3, "scores"], ["ตรวจงานนักเรียน", ClipboardCheck, "work"], ["อัปโหลดรายชื่อ", FileSpreadsheet, "students"]] as const;
  return <div className="two-column"><section className="panel"><SectionTitle title="งานของครูวันนี้" note="ม.3/1 - สังคมศึกษา" /><div className="action-grid">{tools.map(([label, Icon, view]) => <button className="tool-tile" key={label} onClick={() => setView(view)}><Icon aria-hidden /><span>{label}</span></button>)}</div></section><section className="panel"><SectionTitle title="งานรอตรวจ" note="ดูทั้งหมด" /><SubmissionList compact /></section></div>;
}
function StudentHome({ setView, flash }: { setView: (view: ViewKey) => void; flash: (message: string) => void }) {
  const quick = [["สื่อการสอน", BookOpen, "materials"], ["ส่งงาน", CloudUpload, "work"], ["คะแนนของฉัน", BarChart3, "scores"], ["ประกาศ", Megaphone, "home"]] as const;
  return <div className="two-column"><section className="panel"><SectionTitle title="ทางลัด" note="อัปเดตเมื่อ 2 ชม. ที่แล้ว" /><div className="quick-grid">{quick.map(([label, Icon, view]) => <button className="quick-button" key={label} onClick={() => view === "home" ? flash("ประกาศล่าสุดอยู่ในหน้านี้แล้ว") : setView(view)}><Icon aria-hidden /><span>{label}</span></button>)}</div></section><section className="panel"><SectionTitle title="ประกาศล่าสุด" note="ศุกร์นี้" /><article className="announcement-card"><Megaphone aria-hidden /><div><strong>สอบเก็บคะแนนบทที่ 4</strong><p>เตรียมอ่านหัวข้อประวัติศาสตร์รัตนโกสินทร์ และนำสมุดมาทบทวนในคาบ</p></div></article></section><section className="panel wide-panel"><SectionTitle title="บทเรียนล่าสุด" note="ดูทั้งหมด" /><div className="lesson-strip">{materials.filter((item) => item.image).slice(0, 2).map((item) => <LessonCard key={item.id} item={item} />)}</div></section></div>;
}

function MaterialsView({ role, materials: items, busy, flash, onOpen, onUpload }: { role: Role; materials: Material[]; busy: boolean; flash: (message: string) => void; onOpen: (item: Material) => void; onUpload: (input: MaterialUpload) => Promise<boolean> }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("ทั้งหมด");
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("สื่อเสริม");
  const [level, setLevel] = useState("ม.3");
  const [type, setType] = useState<MaterialType>("PDF");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchFilter = filter === "ทั้งหมด" || (filter === "PDF" || filter === "VIDEO" ? item.type === filter : item.level === filter);
      const matchQuery = !q || `${item.title} ${item.unit} ${item.level}`.toLowerCase().includes(q);
      return matchFilter && matchQuery;
    });
  }, [filter, items, query]);
  async function saveMaterial() {
    const ok = await onUpload({ file, title, unit, level, type });
    if (!ok) return;
    setFile(null);
    setTitle("");
    setUnit("สื่อเสริม");
    setLevel("ม.3");
    setType("PDF");
  }
  return (
    <div className="page-stack">
      <PageHeader title="สื่อการสอน" eyebrow="คลังบทเรียน" />
      <div className="material-tools">
        <div className="input-shell material-search"><Search aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อบทเรียน หน่วย หรือระดับชั้น" /></div>
        <button className="select-button" type="button" onClick={() => flash(`พบสื่อ ${filtered.length} รายการ`)}>ค้นหา</button>
      </div>
      <div className="filter-row">{filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
      {role === "teacher" && (
        <section className="panel material-uploader">
          <SectionTitle title="อัปโหลดสื่อการสอน" note="บันทึกเข้า Supabase Storage" />
          <div className="form-grid">
            <label className="field">ชื่อสื่อ<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ใบงานประชาธิปไตย" /></label>
            <label className="field">หน่วยการเรียน<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="บทที่ 1" /></label>
            <label className="field">ระดับชั้น<select value={level} onChange={(event) => setLevel(event.target.value)}><option>ม.1</option><option>ม.2</option><option>ม.3</option></select></label>
            <label className="field">ประเภท<select value={type} onChange={(event) => setType(event.target.value as MaterialType)}>{materialTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <UploadPanel file={file} setFile={setFile} accept=".pdf,.mp4,.mov,.png,.jpg,.jpeg" label="เลือกไฟล์สื่อการสอน" help="รองรับ PDF, วิดีโอ, PNG, JPG" />
          <button className="primary-button full-button" disabled={busy} onClick={saveMaterial}><Upload aria-hidden />{busy ? "กำลังอัปโหลด" : "อัปโหลดสื่อการสอน"}</button>
        </section>
      )}
      <div className="material-grid">{filtered.map((item) => <MaterialCard key={item.id} item={item} onOpen={onOpen} />)}</div>
      {filtered.length === 0 && <section className="panel"><SectionTitle title="ไม่พบสื่อที่ค้นหา" note="ลองเปลี่ยนคำค้นหรือระดับชั้น" /></section>}
    </div>
  );
}

function ScoresView({ role, rows, setRows, busy, saveScores, flash }: { role: Role; rows: ScoreRow[]; setRows: (rows: ScoreRow[]) => void; busy: boolean; saveScores: () => void; flash: (message: string) => void }) {
  if (role === "student") return <div className="page-stack"><PageHeader title="คะแนนของฉัน" eyebrow="สมชาย ดีมาก (ม.3/1)" /><section className="score-hero"><div><strong>3.85 / 4.0</strong><span>อัปเดตเมื่อ วันนี้ 09:00 น.</span></div><b>A</b></section><section className="panel"><SectionTitle title="คะแนนรายวิชา" note="3 รายการ" /><div className="score-list">{studentScores.map((item) => <article className="score-card" key={item.title}><div><strong>{item.title}</strong><span>วันที่: {item.date}</span></div><div className="score-progress"><span>{item.score} / {item.max}</span><progress value={item.score} max={item.max} /><small>ผ่าน</small></div></article>)}</div></section></div>;
  const update = (id: string, value: string) => setRows(rows.map((row) => row.id === id ? { ...row, score: Math.max(0, Math.min(20, Number(value) || 0)) } : row));
  return <div className="page-stack"><PageHeader title="จัดการคะแนน" eyebrow="ชั้น ม.3/1 - สอบบทที่ 4" /><div className="control-row"><button className="select-button" onClick={() => flash("ตอนนี้เลือกห้อง ม.3/1")}>ม.3/1 <ChevronDown aria-hidden /></button><button className="select-button" onClick={() => flash("ตอนนี้เลือกแบบประเมิน: สอบบทที่ 4")}>สอบบทที่ 4 <ChevronDown aria-hidden /></button></div><section className="panel score-manager"><SectionTitle title="คะแนนเฉลี่ยห้อง" note="16.4 / 20" /><div className="score-table">{rows.map((row) => <article className="score-row" key={row.id}><div className="student-initial">{row.name.slice(0, 1)}</div><div><strong>{row.name}</strong><span>ID: {row.studentId}</span></div><span className={`status-pill ${row.score >= 15 ? "pass" : "fail"}`}>{row.score >= 15 ? "ผ่าน" : "ไม่ผ่าน"}</span><label className="score-input"><input type="number" min="0" max={row.maxScore} value={row.score} onChange={(event) => update(row.id, event.target.value)} /><span>/ {row.maxScore}</span></label></article>)}</div><button className="primary-button full-button" disabled={busy} onClick={saveScores}><CheckCircle2 aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกคะแนน"}</button></section></div>;
}
function WorkView({ role, busy, uploadFile, flash }: { role: Role; busy: boolean; uploadFile: (kind: "roster" | "submission", file: File | null) => void; flash: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  if (role === "teacher") return <div className="page-stack"><PageHeader title="ตรวจงาน" eyebrow="งานที่นักเรียนส่งเข้าระบบ" /><section className="panel"><SubmissionList onAction={(title) => flash(`ทำเครื่องหมายตรวจงาน "${title}" แล้ว`)} /></section></div>;
  return <div className="page-stack"><PageHeader title="ส่งงาน" eyebrow="ใบงานบทที่ 4" /><UploadPanel file={file} setFile={setFile} accept=".pdf,.docx,.png,.jpg" label="เลือกไฟล์งานของคุณ" help="รองรับ PDF, DOCX, PNG, JPG ขนาดไม่เกิน 10MB" /><button className="primary-button full-button" disabled={busy} onClick={() => uploadFile("submission", file)}><CloudUpload aria-hidden />{busy ? "กำลังส่งงาน" : "ส่งงาน"}</button><section className="panel"><SectionTitle title="ประวัติการส่งงาน" note="3 รายการล่าสุด" /><SubmissionList compact /></section></div>;
}
function StudentsView({ busy, uploadFile, flash }: { busy: boolean; uploadFile: (kind: "roster" | "submission", file: File | null) => void; flash: (message: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  return <div className="page-stack"><PageHeader title="อัปโหลดรายชื่อนักเรียน" eyebrow="ม.1/1 - สังคมศึกษา" /><div className="control-row"><button className="select-button wide-select" onClick={() => flash("ตอนนี้เลือก ม.1/1 - สังคมศึกษา")}>ม.1/1 - สังคมศึกษา <ChevronDown aria-hidden /></button></div><UploadPanel file={file} setFile={setFile} accept=".xlsx,.csv,.xls" label="ลากไฟล์มาวางที่นี่" help="รองรับไฟล์ .xlsx, .csv, .xls ขนาดไม่เกิน 5MB" /><section className="panel"><SectionTitle title="รูปแบบไฟล์ที่รองรับ" /><div className="template-row"><button className="template-button active" onClick={() => downloadRosterTemplate("excel")}><Download aria-hidden />Excel Template</button><button className="template-button" onClick={() => downloadRosterTemplate("csv")}><Download aria-hidden />CSV Template</button></div><div className="student-preview"><div className="student-preview-head"><span>เลขที่</span><span>รหัสนักเรียน</span><span>ชื่อ-นามสกุล</span><span>เพศ</span></div>{rosterPreview.map((student) => <div className="student-preview-row" key={student.id}><span>{student.no}</span><span>{student.id}</span><strong>{student.name}</strong><span>{student.gender}</span></div>)}</div></section><button className="primary-button full-button" disabled={busy} onClick={() => uploadFile("roster", file)}><CheckCircle2 aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกรายชื่อนักเรียน"}</button></div>;
}
function UploadPanel({ file, setFile, accept, label, help }: { file: File | null; setFile: (file: File | null) => void; accept: string; label: string; help: string }) {
  return <section className="upload-panel"><CloudUpload aria-hidden /><strong>{label}</strong><span>หรือ</span><label className="outline-file-button"><Upload aria-hidden /><input accept={accept} type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file ? file.name : "เลือกไฟล์จากเครื่อง"}</label><small>{help}</small></section>;
}
function ProfileView({ session }: { session: AppSession }) {
  return <div className="page-stack"><PageHeader title="โปรไฟล์" eyebrow={session.room} /><section className="profile-panel"><div className="profile-avatar">{session.name.slice(0, 1)}</div><div><h2>{session.name}</h2><p>{session.school}</p></div></section></div>;
}
function PageHeader({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></div>;
}
function SectionTitle({ title, note }: { title: string; note?: string }) {
  return <div className="section-heading"><h2>{title}</h2>{note && <span>{note}</span>}</div>;
}
function MaterialCard({ item, onOpen }: { item: Material; onOpen: (item: Material) => void }) {
  return <article className={`material-card tone-border-${item.accent}`}>{item.image ? <img src={item.image} alt="" /> : <div className={`material-icon tone-${item.accent}`}><BookOpen aria-hidden /></div>}<div className="material-body"><div className="material-meta"><span className={`type-pill ${item.type.toLowerCase()}`}>{item.type}</span><span>{item.date}</span></div><h2>{item.title}</h2><p>{item.unit} · ระดับ: {item.level}</p><button className="small-primary" onClick={() => onOpen(item)}><Eye aria-hidden />เปิดดู</button></div></article>;
}
function LessonCard({ item }: { item: Material }) {
  return <article className="lesson-card"><img src={item.image} alt="" /><div><span>{item.unit}</span><strong>{item.title}</strong></div></article>;
}
function SubmissionList({ compact = false, onAction }: { compact?: boolean; onAction?: (title: string) => void }) {
  return <div className="submission-list">{submissions.slice(0, compact ? 2 : submissions.length).map((item) => <article className="submission-card" key={item.title}><div><strong>{item.title}</strong><span>{item.student} · ID: {item.id}</span></div><div className="submission-state"><small>{item.date}</small><span className={`status-pill ${item.status === "ตรวจแล้ว" ? "pass" : "pending"}`}>{item.status}</span>{onAction && <button className="small-primary" onClick={() => onAction(item.title)}><CheckCircle2 aria-hidden />ตรวจแล้ว</button>}</div></article>)}</div>;
}
function downloadRosterTemplate(kind: "excel" | "csv") {
  const csv = "เลขที่,รหัสนักเรียน,ชื่อ-นามสกุล,เพศ,ชั้นเรียน\n1,65001,กฤษฎา มาดี,ชาย,ม.1/1\n2,65002,จิรนันท์ รักเรียน,หญิง,ม.1/1\n";
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = kind === "excel" ? "student-roster-template-excel.csv" : "student-roster-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
export default App;
