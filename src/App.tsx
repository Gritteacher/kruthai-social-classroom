import { createClient } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CloudUpload,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileSpreadsheet,
  GraduationCap,
  Home,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  Moon,
  Sun
} from "lucide-react";
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from "./lib/supabase";
import type {
  Announcement,
  AppSession,
  Classroom,
  Material,
  MaterialDownloadLog,
  MaterialType,
  NavItem,
  Role,
  ScoreAssignment,
  ScoreEntry,
  StudentRecord,
  SubmissionRecord,
  SubmissionStatus,
  ViewKey
} from "./types";

type MaterialUpload = { file: File | null; title: string; unit: string; level: string; type: MaterialType };
type ClassroomDraft = { academicYear: string; level: string; room: string; subject: string };
type StudentDraft = { no: string; studentId: string; name: string; gender: string };
type RosterStudent = { no: number; studentId: string; name: string; gender: string };
type AnnouncementDraft = { title: string; body: string };
type AssignmentDraft = { title: string; rawMax: string; finalMax: string };
type ThemeMode = "light" | "dark";

const SCHOOL_LOGO = "/kruthai-logo.png";
const SCHOOL_NAME = "โรงเรียนเทพศิรินทร์ นนทบุรี";
const NO_CLASS_LABEL = "ยังไม่ได้เลือกห้องเรียน";
const STORAGE_BUCKET = "classroom-files";
const STUDENT_EMAIL_DOMAIN = "students.kruthai.local";
const gradeLevels = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"] as const;
const filters: Array<"ทั้งหมด" | MaterialType | (typeof gradeLevels)[number]> = ["ทั้งหมด", ...gradeLevels, "VIDEO", "PDF"];
const materialTypes: MaterialType[] = ["PDF", "VIDEO", "IMG"];
const submissionStatuses: SubmissionStatus[] = ["ยังไม่ส่ง", "ส่งแล้ว", "รอตรวจ", "ตรวจแล้ว", "ให้แก้ไข", "ส่งช้า"];

const sessions: Record<Role, AppSession> = {
  teacher: { role: "teacher", name: "คุณครูไต๋", room: SCHOOL_NAME, school: "ห้องเรียนสังคมศึกษา" },
  student: { role: "student", name: "นักเรียน", room: "ชั้นมัธยมศึกษา", school: SCHOOL_NAME }
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

function isRole(value: unknown): value is Role {
  return value === "teacher" || value === "student";
}

async function resolveAppSession(user: any, fallbackRole: Role): Promise<AppSession> {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  let profile: any = null;

  if (isSupabaseConfigured && user?.id) {
    const result = await (supabase as any)
      .from("profiles")
      .select("full_name, role, class_name, school_name, student_code")
      .eq("id", user.id)
      .maybeSingle();
    if (!result.error) profile = result.data;
  }

  const profileRole = profile?.role;
  const metadataRole = metadata.role;
  const resolvedRole: Role = isRole(profileRole) ? profileRole : isRole(metadataRole) ? metadataRole : fallbackRole;
  const base = sessions[resolvedRole];
  const school = String(profile?.school_name || metadata.school_name || base.school);
  const name = String(profile?.full_name || metadata.full_name || metadata.name || base.name);
  const studentCode = String(profile?.student_code || metadata.student_code || studentCodeFromEmail(user?.email) || "");
  const room = resolvedRole === "teacher" ? school : String(profile?.class_name || metadata.class_name || base.room);

  return { role: resolvedRole, name, room, school, studentCode: studentCode || undefined };
}

function App() {
  const [role, setRole] = useState<Role>("teacher");
  const [session, setSession] = useState<AppSession | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => window.localStorage.getItem("classroom-theme") === "dark" ? "dark" : "light");
  const [view, setView] = useState<ViewKey>("home");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [classroomItems, setClassroomItems] = useState<Classroom[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");
  const [materialItems, setMaterialItems] = useState<Material[]>([]);
  const [announcementItems, setAnnouncementItems] = useState<Announcement[]>([]);
  const [materialDownloadLogs, setMaterialDownloadLogs] = useState<MaterialDownloadLog[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [assignments, setAssignments] = useState<ScoreAssignment[]>([]);
  const [scoreEntries, setScoreEntries] = useState<ScoreEntry[]>([]);
  const [submissionItems, setSubmissionItems] = useState<SubmissionRecord[]>([]);
  const nav = session?.role === "student" ? studentNav : teacherNav;
  const effectiveSelectedClassroomId = selectedClassroomId || classroomItems[0]?.id || "";
  const selectedClassroom = classroomItems.find((item) => item.id === effectiveSelectedClassroomId);
  const currentStudent = session?.studentCode ? students.find((student) => student.studentId === session.studentCode) : undefined;
  const studentClassroom = session?.role === "student"
    ? classroomItems.find((item) => item.id === currentStudent?.classroomId || item.displayName === currentStudent?.className || item.displayName === session.room)
    : undefined;
  const workingClassroom = session?.role === "teacher" ? selectedClassroom : studentClassroom;
  const activeClassName = workingClassroom?.displayName || (session?.role === "student" ? session.room : NO_CLASS_LABEL);
  const activeStudents = session?.role === "teacher"
    ? (workingClassroom ? students.filter((student) => belongsToClass(student, workingClassroom)) : [])
    : currentStudent ? [currentStudent] : [];
  const activeAssignments = session?.role === "teacher"
    ? (workingClassroom ? assignments.filter((assignment) => belongsToClass(assignment, workingClassroom)) : [])
    : studentScopedItems(assignments, workingClassroom, currentStudent, session).length
      ? studentScopedItems(assignments, workingClassroom, currentStudent, session)
      : assignments;
  const activeMaterials = materialItems;
  const activeSubmissions = session?.role === "teacher"
    ? (workingClassroom ? submissionItems.filter((submission) => belongsToClass(submission, workingClassroom)) : [])
    : submissionItems.filter((submission) => submission.studentId === session?.studentCode);
  const activeAnnouncements = workingClassroom ? announcementItems.filter((item) => belongsToClass(item, workingClassroom)) : [];
  const activeDownloadLogs = session?.role === "teacher" ? materialDownloadLogs : materialDownloadLogs.filter((item) => item.studentId === session?.studentCode);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("classroom-theme", theme);
  }, [theme]);

  async function loadClassroomData(showToast = false) {
    setLoadingData(true);
    if (!isSupabaseConfigured) {
      setLoadingData(false);
      if (showToast) flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return;
    }

    const client = supabase as any;
    const [classroomsResult, materialsResult, announcementsResult, downloadLogsResult, studentsResult, assignmentsResult, entriesResult, submissionsResult] = await Promise.all([
      client.from("classrooms").select("*").order("created_at", { ascending: false }),
      client.from("materials").select("*").order("published_at", { ascending: false }),
      client.from("announcements").select("*").order("published_at", { ascending: false }),
      client.from("material_download_logs").select("*").order("downloaded_at", { ascending: false }),
      client.from("students").select("*").order("student_no", { ascending: true }),
      client.from("score_assignments").select("*").order("created_at", { ascending: false }),
      client.from("score_entries").select("*").order("updated_at", { ascending: false }),
      client.from("submissions").select("*").order("submitted_at", { ascending: false })
    ]);

    const errors = [classroomsResult, materialsResult, announcementsResult, downloadLogsResult, studentsResult, assignmentsResult, entriesResult, submissionsResult].filter((result) => result.error);
    if (errors.length) {
      flash("บางตารางใน Supabase ยังไม่พร้อม กรุณาตรวจ schema แล้วลองโหลดใหม่");
    }

    const nextClassrooms = ((classroomsResult.data ?? []) as any[]).map(mapClassroomRow);
    setClassroomItems(nextClassrooms);
    setSelectedClassroomId((current) => {
      if (current && nextClassrooms.some((item) => item.id === current)) return current;
      if (session?.role === "student") {
        const studentRoom = String(session.room || "");
        return nextClassrooms.find((item) => item.displayName === studentRoom)?.id || nextClassrooms[0]?.id || "";
      }
      return nextClassrooms[0]?.id || "";
    });
    setMaterialItems(((materialsResult.data ?? []) as any[]).filter((row) => row.file_path).map(mapMaterialRow));
    setAnnouncementItems(((announcementsResult.data ?? []) as any[]).map(mapAnnouncementRow));
    setMaterialDownloadLogs(((downloadLogsResult.data ?? []) as any[]).map(mapMaterialDownloadLogRow));
    setStudents(((studentsResult.data ?? []) as any[]).map(mapStudentRow));
    setAssignments(((assignmentsResult.data ?? []) as any[]).map(mapAssignmentRow));
    setScoreEntries(((entriesResult.data ?? []) as any[]).map(mapScoreEntryRow));
    setSubmissionItems(((submissionsResult.data ?? []) as any[]).map(mapSubmissionRow));
    setLoadingData(false);
    if (showToast && errors.length === 0) flash("โหลดข้อมูลล่าสุดจาก Supabase แล้ว");
  }

  useEffect(() => {
    if (!session) return;
    void loadClassroomData();
  }, [session?.role]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    void supabase!.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session?.user) return;
      const restored = await resolveAppSession(data.session.user, role);
      if (!active) return;
      setRole(restored.role);
      setSession(restored);
    });

    return () => {
      active = false;
    };
  }, []);

  async function login(identifier: string, password: string) {
    if (!isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase กรุณาตรวจค่า Environment Variables");
      return;
    }
    const email = normalizeLoginIdentifier(identifier, role);
    if (!email.includes("@")) {
      flash(role === "student" ? "กรอกรหัสประจำตัวนักเรียน หรืออีเมลนักเรียน" : "กรุณาเข้าสู่ระบบด้วยอีเมลที่ลงทะเบียนไว้");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return flash(error.message);
    }
    const nextSession = data.user ? await resolveAppSession(data.user, role) : sessions[role];
    setBusy(false);
    setRole(nextSession.role);
    setSession(nextSession);
    setView("home");
  }

  async function requestPasswordReset(identifier: string) {
    const email = normalizeLoginIdentifier(identifier, role);
    if (!identifier.includes("@")) return flash(role === "student" ? "นักเรียนเข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านได้ในหน้าโปรไฟล์ หรือให้ครูรีเซ็ตรหัสให้" : "กรอกอีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
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

  async function changePassword(newPassword: string) {
    if (!newPassword.trim()) return flash("กรอกรหัสผ่านใหม่ก่อน");
    if (newPassword.trim().length < 6) return flash("รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password: newPassword.trim() });
    setBusy(false);
    if (error) return flash(error.message);
    flash("เปลี่ยนรหัสผ่านเรียบร้อย");
  }

  async function uploadMaterial({ file, title, unit, level, type }: MaterialUpload) {
    if (!title.trim()) return flashAndFail("กรุณาใส่ชื่อสื่อการสอน", flash);
    if (!file) return flashAndFail("กรุณาเลือกไฟล์สื่อการสอน", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    setBusy(true);
    const storagePath = `materials/${Date.now()}-${storageSafeFileName(file.name)}`;
    const client = supabase as any;
    const upload = await client.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
      contentType: file.type || mimeForMaterial(file.name, type),
      upsert: false
    });
    if (upload.error) {
      setBusy(false);
      flash(upload.error.message);
      return false;
    }
    const insert = await client
      .from("materials")
      .insert({
        title: title.trim(),
        unit: unit.trim() || "สื่อเสริม",
        level,
        material_type: type,
        class_name: "ทุกห้อง",
        classroom_id: null,
        file_path: storagePath
      })
      .select("*")
      .single();
    setBusy(false);
    if (insert.error) {
      await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
      flash(insert.error.message);
      return false;
    }
    setMaterialItems((current) => [mapMaterialRow(insert.data), ...current]);
    flash(`อัปโหลดสื่อ ${title.trim()} เรียบร้อย`);
    return true;
  }

  async function deleteMaterial(item: Material) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    const client = supabase as any;
    if (item.filePath) await client.storage.from(STORAGE_BUCKET).remove([item.filePath]);
    const result = await client.from("materials").delete().eq("id", item.id);
    setBusy(false);
    if (result.error) return flash(result.error.message);
    const next = materialItems.filter((material) => material.id !== item.id);
    setMaterialItems(next);
    flash(`ลบสื่อ "${item.title}" แล้ว`);
  }

  async function openMaterial(item: Material) {
    if (!item.filePath) return flash("สื่อนี้ยังไม่มีไฟล์แนบ จึงเปิดไม่ได้");
    if (isSupabaseConfigured) {
      const { data, error } = await (supabase as any).storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
      if (error || !data?.signedUrl) return flash(error?.message || "เปิดไฟล์ไม่ได้");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return flash(`เปิดไฟล์ ${item.title} ในแท็บใหม่`);
    }
    flash("ระบบยังไม่ได้เชื่อมต่อ Supabase จึงยังเปิดไฟล์ไม่ได้");
  }

  async function openSubmissionFile(item: SubmissionRecord) {
    if (!item.filePath) return flash("งานนี้ยังไม่มีไฟล์แนบ");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase จึงยังเปิดไฟล์ไม่ได้");
    const { data, error } = await (supabase as any).storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
    if (error || !data?.signedUrl) return flash(error?.message || "เปิดไฟล์งานไม่ได้");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    flash(`เปิดไฟล์งาน ${item.assignmentTitle} ในแท็บใหม่`);
  }

  async function addAnnouncement(draft: AnnouncementDraft) {
    if (!selectedClassroom) return flashAndFail("เลือกห้องเรียนก่อนประกาศ", flash);
    if (!draft.title.trim()) return flashAndFail("กรอกหัวข้อประกาศก่อน", flash);
    if (!draft.body.trim()) return flashAndFail("กรอกรายละเอียดประกาศก่อน", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    const payload = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      class_name: selectedClassroom.displayName,
      classroom_id: selectedClassroom.id
    };
    setBusy(true);
    const result = await (supabase as any).from("announcements").insert(payload).select("*").single();
    setBusy(false);
    if (result.error) {
      flash(result.error.message);
      return false;
    }
    setAnnouncementItems((current) => [mapAnnouncementRow(result.data), ...current]);
    flash(`ประกาศสำหรับ ${selectedClassroom.displayName} ถูกเผยแพร่แล้ว`);
    return true;
  }

  async function deleteAnnouncement(item: Announcement) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    const result = await (supabase as any).from("announcements").delete().eq("id", item.id);
    setBusy(false);
    if (result.error) return flash(result.error.message);
    setAnnouncementItems((current) => current.filter((entry) => entry.id !== item.id));
    flash(`ลบประกาศ "${item.title}" แล้ว`);
  }

  async function downloadMaterial(item: Material, studentCode: string, password: string) {
    if (!item.filePath) {
      flash("สื่อนี้ยังไม่มีไฟล์สำหรับดาวน์โหลด");
      return false;
    }
    if (!supabaseUrl || !supabaseAnonKey || !isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }
    if (!studentCode.trim() || !password.trim()) {
      flash("กรอกรหัสนักเรียนและรหัสผ่านก่อนดาวน์โหลด");
      return false;
    }

    setBusy(true);
    const authClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = normalizeLoginIdentifier(studentCode, "student");
    const auth = await authClient.auth.signInWithPassword({ email, password });
    if (auth.error || !auth.data.user) {
      setBusy(false);
      flash(auth.error?.message || "ตรวจสอบตัวตนไม่สำเร็จ");
      return false;
    }

    const verifiedStudentId = String(auth.data.user.user_metadata?.student_code || studentCodeFromEmail(auth.data.user.email) || studentCode).trim();
    const verifiedStudentName = String(auth.data.user.user_metadata?.full_name || "นักเรียน");
    const linkedStudent = students.find((student) => student.studentId === verifiedStudentId);
    const classroomId = linkedStudent?.classroomId || workingClassroom?.id;

    const { data, error } = await (supabase as any).storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
    if (error || !data?.signedUrl) {
      setBusy(false);
      flash(error?.message || "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ");
      return false;
    }

    const logResult = await (authClient as any).from("material_download_logs").insert({
      material_id: item.id,
      material_title: item.title,
      student_code: verifiedStudentId,
      student_name: verifiedStudentName,
      class_name: linkedStudent?.className || item.className || activeClassName,
      classroom_id: classroomId || null
    }).select("*").single();
    if (logResult.error) {
      setBusy(false);
      flash(logResult.error.message);
      return false;
    }

    setMaterialDownloadLogs((current) => [mapMaterialDownloadLogRow(logResult.data), ...current]);
    await triggerFileDownload(data.signedUrl, item);
    setBusy(false);
    flash(`บันทึกการดาวน์โหลด ${item.title} แล้ว หากไฟล์ยังไม่ขึ้นให้ดูที่แถบดาวน์โหลดของเบราว์เซอร์`);
    return true;
  }

  async function addClassroom(draft: ClassroomDraft) {
    if (!draft.academicYear.trim()) return flashAndFail("กรอกปีการศึกษาก่อน", flash);
    if (!draft.level.trim()) return flashAndFail("กรอกระดับชั้นก่อน", flash);
    if (!draft.room.trim()) return flashAndFail("กรอกห้องก่อน", flash);
    if (!draft.subject.trim()) return flashAndFail("กรอกรายวิชาก่อน", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    const displayName = formatClassroomName(draft);
    const payload = {
      academic_year: draft.academicYear.trim(),
      level: draft.level.trim(),
      room: draft.room.trim(),
      subject: draft.subject.trim(),
      display_name: displayName
    };
    setBusy(true);
    const result = await (supabase as any).from("classrooms").insert(payload).select("*").single();
    setBusy(false);
    if (result.error) {
      flash(result.error.message);
      return false;
    }
    const nextClassroom = mapClassroomRow(result.data);
    setClassroomItems((current) => [nextClassroom, ...current]);
    setSelectedClassroomId(nextClassroom.id);
    flash(`เพิ่มห้องเรียน ${displayName} แล้ว`);
    return true;
  }

  async function deleteClassroom(classroom: Classroom) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    const client = supabase as any;
    await client.from("announcements").delete().eq("classroom_id", classroom.id);
    await client.from("material_download_logs").delete().eq("classroom_id", classroom.id);
    await client.from("materials").delete().eq("classroom_id", classroom.id);
    await client.from("score_assignments").delete().eq("classroom_id", classroom.id);
    await client.from("students").delete().eq("classroom_id", classroom.id);
    await client.from("submissions").delete().eq("classroom_id", classroom.id);
    const result = await client.from("classrooms").delete().eq("id", classroom.id);
    setBusy(false);
    if (result.error) return flash(result.error.message);
    const nextClassrooms = classroomItems.filter((item) => item.id !== classroom.id);
    const nextMaterials = materialItems.filter((item) => item.classroomId !== classroom.id);
    const nextAnnouncements = announcementItems.filter((item) => item.classroomId !== classroom.id);
    const nextDownloadLogs = materialDownloadLogs.filter((item) => item.classroomId !== classroom.id);
    const nextStudents = students.filter((item) => item.classroomId !== classroom.id);
    const nextAssignments = assignments.filter((item) => item.classroomId !== classroom.id);
    const removedStudentIds = new Set(students.filter((item) => item.classroomId === classroom.id).map((item) => item.id));
    const removedAssignmentIds = new Set(assignments.filter((item) => item.classroomId === classroom.id).map((item) => item.id));
    const nextScores = scoreEntries.filter((item) => !removedStudentIds.has(item.studentRecordId) && !removedAssignmentIds.has(item.assignmentId));
    const nextSubmissions = submissionItems.filter((item) => item.classroomId !== classroom.id);
    setClassroomItems(nextClassrooms);
    setMaterialItems(nextMaterials);
    setAnnouncementItems(nextAnnouncements);
    setMaterialDownloadLogs(nextDownloadLogs);
    setStudents(nextStudents);
    setAssignments(nextAssignments);
    setScoreEntries(nextScores);
    setSubmissionItems(nextSubmissions);
    setSelectedClassroomId((current) => current === classroom.id ? nextClassrooms[0]?.id || "" : current);
    flash(`ลบห้องเรียน ${classroom.displayName} แล้ว`);
  }

  async function addStudent(draft: StudentDraft) {
    if (!selectedClassroom) return flashAndFail("เพิ่มหรือเลือกห้องเรียนก่อนเพิ่มรายชื่อ", flash);
    if (!draft.studentId.trim()) return flashAndFail("กรอกรหัสนักเรียนก่อน", flash);
    if (!draft.name.trim()) return flashAndFail("กรอกชื่อ-นามสกุลก่อน", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    const payload = {
      student_no: Number(draft.no) || activeStudents.length + 1,
      student_code: draft.studentId.trim(),
      full_name: draft.name.trim(),
      gender: draft.gender.trim(),
      class_name: selectedClassroom.displayName,
      classroom_id: selectedClassroom.id
    };
    setBusy(true);
    const result = await (supabase as any).from("students").insert(payload).select("*").single();
    setBusy(false);
    if (result.error) {
      flash(result.error.message);
      return false;
    }
    setStudents((current) => [...current, mapStudentRow(result.data)].sort(sortStudents));
    flash(`เพิ่มรายชื่อ ${draft.name.trim()} แล้ว`);
    return true;
  }

  async function createStudentAccount(student: StudentRecord, password: string, options?: { silent?: boolean }) {
    if (!isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }
    const initialPassword = password.trim() || defaultStudentPassword(student.studentId);
    if (initialPassword.length < 6) {
      flash("รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 6 ตัวอักษร");
      return false;
    }
    setBusy(true);
    const client = supabase as any;
    const rpcPayload = {
      p_student_record_id: student.id,
      p_student_code: student.studentId,
      p_full_name: student.name,
      p_class_name: student.className,
      p_classroom_id: student.classroomId || null,
      p_password: initialPassword
    };
    const rpcResult = await client.rpc("create_student_account", rpcPayload);
    let payload = rpcResult.data;

    if (rpcResult.error) {
      const auth = await supabase!.auth.getSession();
      const accessToken = auth.data.session?.access_token;
      if (!accessToken) {
        setBusy(false);
        flash("กรุณาเข้าสู่ระบบครูใหม่อีกครั้งก่อนสร้างบัญชีนักเรียน");
        return false;
      }

      const response = await fetch("/.netlify/functions/create-student-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          studentRecordId: student.id,
          studentCode: student.studentId,
          fullName: student.name,
          className: student.className,
          classroomId: student.classroomId,
          password: initialPassword
        })
      });
      payload = await response.json().catch(() => ({}));
      setBusy(false);
      if (!response.ok || !payload?.ok) {
        flash(payload?.message || "ระบบยังไม่พร้อมสร้างบัญชีนักเรียน กรุณารัน schema ล่าสุดใน Supabase แล้วลองอีกครั้ง");
        return false;
      }
    } else {
      setBusy(false);
      if (payload?.ok === false) {
        flash(payload.message || "สร้างบัญชีนักเรียนไม่สำเร็จ");
        return false;
      }
    }

    const authEmail = payload?.email || studentCodeToEmail(student.studentId);
    setStudents((current) => current.map((item) => item.id === student.id ? { ...item, authEmail, accountCreatedAt: new Date().toISOString() } : item));
    if (!options?.silent) flash(`สร้างบัญชี ${student.studentId} แล้ว รหัสผ่านเริ่มต้น: ${initialPassword}`);
    return true;
  }

  async function deleteStudentsBatch(targetStudents: StudentRecord[]) {
    if (!targetStudents.length) return false;
    if (!isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }
    const ids = targetStudents.map((student) => student.id);
    const idSet = new Set(ids);
    setBusy(true);
    const result = await (supabase as any).from("students").delete().in("id", ids);
    setBusy(false);
    if (result.error) {
      flash(result.error.message);
      return false;
    }
    setStudents((current) => current.filter((item) => !idSet.has(item.id)));
    setScoreEntries((current) => current.filter((item) => !idSet.has(item.studentRecordId)));
    flash(targetStudents.length === 1 ? `ลบรายชื่อ ${targetStudents[0].name} แล้ว` : `ลบรายชื่อ ${targetStudents.length} คนแล้ว`);
    return true;
  }

  async function deleteStudent(student: StudentRecord) {
    await deleteStudentsBatch([student]);
  }

  async function uploadRosterFile(file: File | null) {
    if (!selectedClassroom) {
      flash("เพิ่มหรือเลือกห้องเรียนก่อนบันทึกไฟล์รายชื่อ");
      return false;
    }
    if (!file) {
      flash("กรุณาเลือกไฟล์รายชื่อนักเรียน");
      return false;
    }
    if (!isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }

    let rosterStudents: RosterStudent[];
    try {
      rosterStudents = await parseRosterFile(file);
    } catch (error) {
      flash(error instanceof Error ? error.message : "อ่านไฟล์รายชื่อนักเรียนไม่สำเร็จ");
      return false;
    }
    if (!rosterStudents.length) {
      flash("ไม่พบรายชื่อที่พร้อมใช้งานในไฟล์นี้");
      return false;
    }

    setBusy(true);
    const storagePath = `rosters/${Date.now()}-${storageSafeFileName(file.name)}`;
    const upload = await (supabase as any).storage.from(STORAGE_BUCKET).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
    if (upload.error) {
      setBusy(false);
      flash(upload.error.message);
      return false;
    }

    const payload = rosterStudents.map((student) => ({
      student_no: student.no,
      student_code: student.studentId,
      full_name: student.name,
      gender: student.gender,
      class_name: selectedClassroom.displayName,
      classroom_id: selectedClassroom.id
    }));

    const uploadRecord = await (supabase as any).from("student_roster_uploads").insert({ class_name: selectedClassroom.displayName, classroom_id: selectedClassroom.id, file_path: storagePath, file_name: file.name, file_size: file.size });
    if (uploadRecord.error) {
      setBusy(false);
      await (supabase as any).storage.from(STORAGE_BUCKET).remove([storagePath]);
      flash(uploadRecord.error.message);
      return false;
    }
    const upsertStudents = await (supabase as any).from("students").upsert(payload, { onConflict: "student_code" });
    setBusy(false);
    if (upsertStudents.error) {
      flash(upsertStudents.error.message);
      return false;
    }

    await loadClassroomData();
    flash(`นำเข้ารายชื่อ ${rosterStudents.length} คนจาก ${file.name} แล้ว พร้อมใช้งาน`);
    return true;
  }

  async function addAssignment(draft: AssignmentDraft) {
    if (!selectedClassroom) return flashAndFail("เพิ่มหรือเลือกห้องเรียนก่อนสร้างงานคะแนน", flash);
    if (!draft.title.trim()) return flashAndFail("กรอกชื่องานหรือแบบประเมินก่อน", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    const rawMax = positiveNumber(draft.rawMax, 10);
    const finalMax = positiveNumber(draft.finalMax, rawMax);
    const payload = { title: draft.title.trim(), class_name: selectedClassroom.displayName, classroom_id: selectedClassroom.id, raw_max: rawMax, final_max: finalMax };
    setBusy(true);
    const result = await (supabase as any).from("score_assignments").insert(payload).select("*").single();
    setBusy(false);
    if (result.error) {
      flash(result.error.message);
      return false;
    }
    setAssignments((current) => [mapAssignmentRow(result.data), ...current]);
    flash(`เพิ่มงานคะแนน "${draft.title.trim()}" แล้ว`);
    return true;
  }

  async function deleteAssignment(assignment: ScoreAssignment) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    const result = await (supabase as any).from("score_assignments").delete().eq("id", assignment.id);
    setBusy(false);
    if (result.error) return flash(result.error.message);
    const nextAssignments = assignments.filter((item) => item.id !== assignment.id);
    const nextEntries = scoreEntries.filter((item) => item.assignmentId !== assignment.id);
    setAssignments(nextAssignments);
    setScoreEntries(nextEntries);
    flash(`ลบงานคะแนน "${assignment.title}" แล้ว`);
  }

  function updateScoreDraft(assignment: ScoreAssignment, student: StudentRecord, value: string) {
    const rawScore = clampScore(value, assignment.rawMax);
    const nextEntry = buildScoreEntry(assignment, student, rawScore);
    setScoreEntries((current) => {
      const exists = current.some((entry) => entry.assignmentId === assignment.id && entry.studentRecordId === student.id);
      const next = exists
        ? current.map((entry) => entry.assignmentId === assignment.id && entry.studentRecordId === student.id ? { ...entry, ...nextEntry, id: entry.id } : entry)
        : [...current, nextEntry];
      return next;
    });
  }

  async function saveScoreSheet(assignment: ScoreAssignment) {
    if (!activeStudents.length) return flash("ยังไม่มีรายชื่อนักเรียนในห้องนี้");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    const payload = activeStudents.map((student) => {
      const entry = findScoreEntry(scoreEntries, assignment.id, student.id);
      const rawScore = entry?.rawScore ?? 0;
      return {
        assignment_id: assignment.id,
        student_id: student.id,
        student_code: student.studentId,
        raw_score: rawScore,
        raw_max: assignment.rawMax,
        final_score: scaledScore(rawScore, assignment.rawMax, assignment.finalMax),
        final_max: assignment.finalMax
      };
    });
    setBusy(true);
    const result = await (supabase as any).from("score_entries").upsert(payload, { onConflict: "assignment_id,student_id" });
    setBusy(false);
    if (result.error) return flash(result.error.message);
    await loadClassroomData();
    flash(`บันทึกคะแนน "${assignment.title}" แล้ว`);
  }

  function updateSubmissionDraft(id: string, patch: Partial<SubmissionRecord>) {
    setSubmissionItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const merged = { ...item, ...patch };
      return { ...merged, finalScore: scaledScore(merged.rawScore, merged.rawMax, merged.finalMax) };
    }));
  }

  async function saveSubmissionReview(item: SubmissionRecord) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    const result = await (supabase as any)
      .from("submissions")
      .update({
        status: item.status,
        raw_score: item.rawScore,
        raw_max: item.rawMax,
        final_score: scaledScore(item.rawScore, item.rawMax, item.finalMax),
        final_max: item.finalMax
      })
      .eq("id", item.id);
    setBusy(false);
    if (result.error) return flash(result.error.message);
    flash(`บันทึกผลตรวจงานของ ${item.studentName} แล้ว`);
  }

  async function submitWork(file: File | null, assignmentId: string) {
    const assignment = activeAssignments.find((item) => item.id === assignmentId);
    if (!assignment) return flash("เลือกงานที่คุณต้องการส่งก่อน");
    if (!file) return flash("กรุณาเลือกไฟล์งาน");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    const storagePath = `submissions/${Date.now()}-${storageSafeFileName(file.name)}`;
    const record = {
      assignment_id: assignment.id,
      assignment_title: assignment.title,
      student_name: currentStudent?.name || session?.name || "นักเรียน",
      student_code: currentStudent?.studentId || session?.studentCode || "student",
      classroom_id: assignment.classroomId || workingClassroom?.id || currentStudent?.classroomId || null,
      file_path: storagePath,
      status: "รอตรวจ",
      raw_score: 0,
      raw_max: assignment.rawMax,
      final_score: 0,
      final_max: assignment.finalMax
    };
    const client = supabase as any;
    const upload = await client.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false
    });
    if (upload.error) {
      setBusy(false);
      return flash(upload.error.message);
    }
    const result = await client.from("submissions").insert(record).select("*").single();
    setBusy(false);
    if (result.error) return flash(result.error.message);
    setSubmissionItems((current) => [mapSubmissionRow(result.data), ...current]);
    flash(`ส่งงาน ${file.name} เรียบร้อย`);
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
            <small>{session.role === "teacher" ? "พื้นที่ครู" : session.name}</small>
          </div>
        </div>
        <nav>{nav.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
        <button className="logout-button" onClick={logout}><LogOut aria-hidden />ออกจากระบบ</button>
      </aside>
      <main className="workspace">
        <header className="top-bar">
          <div className="top-title-block">
            <div className="mobile-head-brand">
                <img src={SCHOOL_LOGO} alt="โลโก้โรงเรียน" />
              <div>
                <strong>ห้องเรียนสังคมครูไต๋</strong>
                <small>{session.role === "teacher" ? "พื้นที่ครู" : session.name}</small>
              </div>
            </div>
            <p className="eyebrow">{session.role === "teacher" ? session.school : `สวัสดี ${session.name}`}</p>
            <h2>{session.role === "teacher" ? activeClassName : session.room}</h2>
          </div>
          <div className="top-actions">
            {session.role === "teacher" && <TeacherClassroomSelector classrooms={classroomItems} selectedClassroomId={effectiveSelectedClassroomId} onChange={setSelectedClassroomId} />}
            <button className="icon-button" title="ค้นหา" onClick={() => { setView("materials"); flash("เปิดคลังสื่อแล้ว ใช้ช่องค้นหาด้านบนได้เลย"); }}><Search aria-hidden /></button>
            <button className="icon-button" title="โหลดข้อมูลใหม่" onClick={() => void loadClassroomData(true)}><Bell aria-hidden /></button>
            <button className="theme-toggle-button" type="button" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} title="เปลี่ยนธีม">{theme === "light" ? <Moon aria-hidden /> : <Sun aria-hidden />}<span>{theme === "light" ? "โทนมืด" : "โทนสว่าง"}</span></button>
            <button className="mobile-logout-button" onClick={logout} title="ออกจากระบบ"><LogOut aria-hidden /><span>ออกจากระบบ</span></button>
            <button className="avatar-button" onClick={logout}>{session.role === "teacher" ? "ค" : "น"}</button>
          </div>
        </header>
        <section className="content-area">
          {loadingData && <div className="toast">กำลังโหลดข้อมูล...</div>}
          {view === "home" && <HomeView session={session} setView={setView} flash={flash} materials={activeMaterials} students={activeStudents} submissions={activeSubmissions} assignments={activeAssignments} entries={scoreEntries} announcements={activeAnnouncements} activeClassName={activeClassName} selectedClassroom={workingClassroom} busy={busy} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} />}
          {view === "materials" && <MaterialsView role={session.role} session={session} currentStudent={currentStudent} materials={activeMaterials} logs={activeDownloadLogs} busy={busy} flash={flash} onOpen={openMaterial} onDownload={downloadMaterial} onUpload={uploadMaterial} onDelete={deleteMaterial} />}
          {view === "scores" && <ScoresView role={session.role} students={activeStudents} assignments={activeAssignments} entries={scoreEntries} busy={busy} activeClassName={activeClassName} addAssignment={addAssignment} deleteAssignment={deleteAssignment} updateScoreDraft={updateScoreDraft} saveScoreSheet={saveScoreSheet} />}
          {view === "work" && <WorkView role={session.role} assignments={activeAssignments} submissions={activeSubmissions} busy={busy} activeClassName={activeClassName} submitWork={submitWork} updateSubmission={updateSubmissionDraft} saveSubmission={saveSubmissionReview} openSubmission={openSubmissionFile} />}
          {view === "students" && <StudentsView classrooms={classroomItems} selectedClassroom={selectedClassroom} selectedClassroomId={effectiveSelectedClassroomId} students={activeStudents} busy={busy} flash={flash} addClassroom={addClassroom} deleteClassroom={deleteClassroom} selectClassroom={setSelectedClassroomId} addStudent={addStudent} deleteStudent={deleteStudent} deleteStudents={deleteStudentsBatch} uploadRosterFile={uploadRosterFile} createStudentAccount={createStudentAccount} />}
          {view === "profile" && <ProfileView session={session} busy={busy} changePassword={changePassword} />}
        </section>
      </main>
      <nav className="bottom-nav">{nav.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Auth({ role, busy, toast, onRole, onLogin, onResetPassword }: { role: Role; busy: boolean; toast: string; onRole: (role: Role) => void; onLogin: (email: string, password: string) => void; onResetPassword: (email: string) => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin(identifier, password);
  };
  const identifierLabel = role === "student" ? "รหัสประจำตัวนักเรียน / อีเมล" : "อีเมล";
  const identifierPlaceholder = role === "student" ? "เช่น 65001" : "name@school.ac.th";
  return (
    <main className="auth-page">
      <section className="brand-panel">
        <div className="brand-mark"><img className="brand-logo" src={SCHOOL_LOGO} alt="โลโก้โรงเรียน" /></div>
        <h1>ห้องเรียนสังคมครูไต๋</h1>
        <p>{SCHOOL_NAME}</p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <p className="eyebrow">เข้าสู่ระบบ</p>
          <h2>เลือกบทบาทของคุณ</h2>
          <div className="role-grid">
            <RoleCard selected={role === "teacher"} icon={ShieldCheck} title="ครูผู้สอน" onClick={() => onRole("teacher")} />
            <RoleCard selected={role === "student"} icon={GraduationCap} title="นักเรียน" onClick={() => onRole("student")} />
          </div>
          <form className="login-form" onSubmit={submit}>
            <label>{identifierLabel}<div className="input-shell"><Mail aria-hidden /><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={identifierPlaceholder} /></div></label>
            <label>รหัสผ่าน<div className="input-shell"><Lock aria-hidden /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" /></div></label>
            <button className="primary-button" disabled={busy}><ShieldCheck aria-hidden />{busy ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"}</button>
          </form>
          <button className="text-button" type="button" onClick={() => onResetPassword(identifier)}>ลืมรหัสผ่าน?</button>
        </div>
        {toast && <div className="toast auth-toast">{toast}</div>}
      </section>
    </main>
  );
}

function RoleCard({ selected, icon: Icon, title, onClick }: { selected: boolean; icon: NavItem["icon"]; title: string; onClick: () => void }) {
  return <button className={`role-card ${selected ? "selected" : ""}`} onClick={onClick} type="button"><Icon aria-hidden /><span><strong>{title}</strong></span>{selected && <CheckCircle2 aria-hidden />}</button>;
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return <button className={active ? "active" : ""} onClick={onClick} title={item.label} type="button"><Icon aria-hidden /><span>{item.label}</span></button>;
}

function TeacherClassroomSelector({ classrooms, selectedClassroomId, onChange }: { classrooms: Classroom[]; selectedClassroomId: string; onChange: (id: string) => void }) {
  return (
    <label className="teacher-classroom-picker">
      <span>ห้องเรียน</span>
      <select value={selectedClassroomId} onChange={(event) => onChange(event.target.value)} disabled={!classrooms.length}>
        {classrooms.length ? classrooms.map((item) => <option key={item.id} value={item.id}>{item.displayName}</option>) : <option value="">ยังไม่มีห้องเรียน</option>}
      </select>
    </label>
  );
}

function HomeView({ session, setView, flash, materials, students, submissions, assignments, entries, announcements, activeClassName, selectedClassroom, busy, addAnnouncement, deleteAnnouncement }: { session: AppSession; setView: (view: ViewKey) => void; flash: (message: string) => void; materials: Material[]; students: StudentRecord[]; submissions: SubmissionRecord[]; assignments: ScoreAssignment[]; entries: ScoreEntry[]; announcements: Announcement[]; activeClassName: string; selectedClassroom?: Classroom; busy: boolean; addAnnouncement: (draft: AnnouncementDraft) => Promise<boolean>; deleteAnnouncement: (item: Announcement) => void }) {
  const isTeacher = session.role === "teacher";
  if (!isTeacher) {
    return <div className="page-stack"><StudentHome setView={setView} flash={flash} materials={materials} assignments={assignments} entries={entries} students={students} announcements={announcements} /></div>;
  }
  const waiting = submissions.filter((item) => item.status !== "ตรวจแล้ว").length;
  const stats = [["นักเรียนทั้งหมด", String(students.length), "green"], ["งานรอตรวจ", String(waiting), "coral"], ["สื่อการสอน", String(materials.length), "amber"]];
  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div><p className="eyebrow">{session.school}</p><h1>เมนูหลัก</h1></div>
      </section>
      <div className="stat-grid">{stats.map(([label, value, tone]) => <article className={`stat-card tone-${tone}`} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <TeacherHome setView={setView} submissions={submissions} announcements={announcements} activeClassName={activeClassName} selectedClassroom={selectedClassroom} busy={busy} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} />
    </div>
  );
}

function TeacherHome({ setView, submissions, announcements, activeClassName, selectedClassroom, busy, addAnnouncement, deleteAnnouncement }: { setView: (view: ViewKey) => void; submissions: SubmissionRecord[]; announcements: Announcement[]; activeClassName: string; selectedClassroom?: Classroom; busy: boolean; addAnnouncement: (draft: AnnouncementDraft) => Promise<boolean>; deleteAnnouncement: (item: Announcement) => void }) {
  const [draft, setDraft] = useState<AnnouncementDraft>({ title: "", body: "" });
  const tools = [["อัปโหลดสื่อการสอน", Upload, "materials"], ["จัดการคะแนน", BarChart3, "scores"], ["ตรวจงานนักเรียน", ClipboardCheck, "work"], ["เพิ่มรายชื่อ", FileSpreadsheet, "students"]] as const;

  async function publishAnnouncement() {
    const ok = await addAnnouncement(draft);
    if (!ok) return;
    setDraft({ title: "", body: "" });
  }

  return (
    <div className="teacher-home-layout">
      <section className="panel teacher-actions-panel">
        <SectionTitle title="งานของครู" note={activeClassName} />
        <div className="action-grid">
          {tools.map(([label, Icon, view]) => (
            <button className="tool-tile" key={label} onClick={() => setView(view)}>
              <Icon aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel announcement-compose-panel">
        {selectedClassroom ? (
          <>
            <SectionTitle title="ประกาศถึงห้องนี้" note={selectedClassroom.displayName} />
            <div className="form-grid announcement-compose-grid">
              <label className="field">
                หัวข้อประกาศ
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="เช่น แจ้งงานสัปดาห์นี้" />
              </label>
              <label className="field full-span">
                รายละเอียด
                <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="พิมพ์ข้อความประกาศถึงนักเรียนในห้องนี้" rows={5} />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={busy} onClick={publishAnnouncement}>
                <Megaphone aria-hidden />
                เผยแพร่ประกาศ
              </button>
            </div>
          </>
        ) : (
          <EmptyState title="ยังไม่ได้เลือกห้องเรียน" body="เลือกห้องเรียนด้านบนก่อนจึงจะประกาศได้" />
        )}
      </section>

      <section className="panel teacher-overview-panel">
        <SectionTitle title="งานรอตรวจ" note={`${submissions.length} รายการ`} />
        {submissions.length ? <SubmissionList items={submissions.slice(0, 3)} compact /> : <EmptyState title="ยังไม่มีงานส่ง" body="เมื่อนักเรียนส่งงาน รายการจะมาแสดงตรงนี้" />}
        <SectionTitle title="ประกาศล่าสุด" note={`${announcements.length} รายการ`} />
        {announcements.length ? (
          <div className="announcement-list">
            {announcements.slice(0, 4).map((item) => (
              <article className="announcement-card" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.publishedAt}</span>
                  <p>{item.body}</p>
                </div>
                <button className="icon-danger" disabled={busy} onClick={() => deleteAnnouncement(item)} title="ลบประกาศ">
                  <Trash2 aria-hidden />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="ยังไม่มีประกาศ" body="ประกาศของห้องที่เลือกจะแสดงตรงนี้" />
        )}
      </section>
    </div>
  );
}

function StudentHome({ setView, flash, materials, assignments, entries, students, announcements }: { setView: (view: ViewKey) => void; flash: (message: string) => void; materials: Material[]; assignments: ScoreAssignment[]; entries: ScoreEntry[]; students: StudentRecord[]; announcements: Announcement[] }) {
  const score = scoreSummaryForStudent(students[0], entries);
  const latestAnnouncement = announcements[0]?.title || "ยังไม่มีประกาศใหม่";
  return <><section className="student-home-grid"><button className="student-home-card score-home-card" onClick={() => setView("scores")}><div className="score-ring home-score-ring" style={{ background: `conic-gradient(var(--ring-fill) 0deg ${score.ringPercent * 3.6}deg, var(--ring-track) ${score.ringPercent * 3.6}deg 360deg)` }}><div><strong>{formatScore(score.totalFinal)}</strong><span>คะแนน</span></div></div></button><button className="student-home-card" onClick={() => setView("materials")}><BookOpen aria-hidden /><span>{materials.length} ไฟล์</span><strong>สื่อการสอน</strong><small>เปิดดูและดาวน์โหลดสื่อ</small></button><button className="student-home-card announcement-home-card" onClick={() => flash(announcements.length ? `มีประกาศ ${announcements.length} รายการ` : "ยังไม่มีประกาศใหม่")}><Megaphone aria-hidden /><span>{announcements.length} รายการ</span><strong>ประกาศ</strong><small>{latestAnnouncement}</small></button></section><div className="two-column student-home-lists"><section className="panel announcement-panel-red"><SectionTitle title="ประกาศ" note={`${announcements.length} รายการ`} />{announcements.length ? <div className="announcement-list">{announcements.slice(0, 4).map((item) => <article className="announcement-card announcement-card-student" key={item.id}><div><strong>{item.title}</strong><span>{item.publishedAt}</span><p>{item.body}</p></div></article>)}</div> : <EmptyState title="ยังไม่มีประกาศ" body="เมื่อคุณครูประกาศ ระบบจะแสดงที่นี่" />}</section><section className="panel"><SectionTitle title="สื่อล่าสุด" note={`${materials.length} รายการ`} />{materials.length ? <div className="mini-list">{materials.slice(0, 3).map((item) => <div key={item.id}><strong>{item.title}</strong><span>{item.level} · {item.type}</span></div>)}</div> : <EmptyState title="ยังไม่มีสื่อการสอน" body="รอคุณครูอัปโหลดสื่อ" />}</section></div></>;
}

function MaterialsView({ role, session, currentStudent, materials: items, logs, busy, flash, onOpen, onDownload, onUpload, onDelete }: { role: Role; session: AppSession; currentStudent?: StudentRecord; materials: Material[]; logs: MaterialDownloadLog[]; busy: boolean; flash: (message: string) => void; onOpen: (item: Material) => void; onDownload: (item: Material, studentCode: string, password: string) => Promise<boolean>; onUpload: (input: MaterialUpload) => Promise<boolean>; onDelete: (item: Material) => void }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("ทั้งหมด");
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("สื่อเสริม");
  const [level, setLevel] = useState("ม.1");
  const [type, setType] = useState<MaterialType>("PDF");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [downloadTargetId, setDownloadTargetId] = useState("");
  const [downloadStudentId, setDownloadStudentId] = useState(currentStudent?.studentId || session.studentCode || "");
  const [downloadPassword, setDownloadPassword] = useState("");
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
    setLevel("ม.1");
    setType("PDF");
  }

  function chooseMaterialFile(nextFile: File | null) {
    setFile(nextFile);
    if (!nextFile) return;
    setType(materialTypeFromFile(nextFile.name, nextFile.type));
    if (!title.trim()) setTitle(cleanFileTitle(nextFile.name));
  }

  useEffect(() => {
    setDownloadStudentId(currentStudent?.studentId || session.studentCode || "");
  }, [currentStudent?.studentId, session.studentCode]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void Promise.all(items.filter((item) => item.filePath).map(async (item) => {
      const existing = previewUrls[item.id];
      if (existing) return [item.id, existing] as const;
      const result = await (supabase as any).storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 60);
      return [item.id, result.data?.signedUrl || ""] as const;
    })).then((pairs) => {
      if (!active) return;
      setPreviewUrls((current) => {
        const next = { ...current };
        pairs.forEach(([id, url]) => {
          if (url) next[id] = url;
        });
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, [items]);

  async function directDownload(item: Material) {
    const url = previewUrls[item.id];
    if (!url) {
      onOpen(item);
      return;
    }
    await triggerFileDownload(url, item);
  }

  function chooseDownloadTarget(item: Material) {
    setDownloadTargetId(item.id);
  }

  async function submitDownload(item: Material) {
    if (role === "teacher") {
      void directDownload(item);
      return;
    }
    const ok = await onDownload(item, downloadStudentId, downloadPassword);
    if (!ok) return;
    setDownloadPassword("");
    setDownloadTargetId("");
  }

  const downloadTarget = items.find((entry) => entry.id === downloadTargetId);
  return (
    <div className="page-stack">
      <PageHeader title="สื่อการสอน" eyebrow="คลังสื่อการสอน" />
      <div className="material-tools">
        <div className="input-shell material-search"><Search aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อบทเรียน หน่วย หรือระดับชั้น" /></div>
        <button className="select-button" type="button" onClick={() => flash(`พบสื่อ ${filtered.length} รายการ`)}>ค้นหา</button>
      </div>
      <div className="filter-row">{filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
      {role === "teacher" && (
        <section className="panel material-uploader">
          <SectionTitle title="อัปโหลดสื่อการสอน" note="เก็บไฟล์ใน Supabase Storage" />
          <div className="form-grid">
            <label className="field">ชื่อสื่อ<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ใบงานประชาธิปไตย" /></label>
            <label className="field">หน่วยการเรียน<input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="บทที่ 1" /></label>
            <label className="field">ระดับชั้น<select value={level} onChange={(event) => setLevel(event.target.value)}>{gradeLevels.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="field">ประเภท<select value={type} onChange={(event) => setType(event.target.value as MaterialType)}>{materialTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <UploadPanel file={file} setFile={chooseMaterialFile} accept=".pdf,application/pdf,.mp4,video/mp4,.mov,video/quicktime,.png,image/png,.jpg,.jpeg,image/jpeg" label="เลือกไฟล์สื่อการสอน" help="รองรับ PDF, วิดีโอ, PNG, JPG" />
          <button className="primary-button full-button" disabled={busy} onClick={saveMaterial}><Upload aria-hidden />{busy ? "กำลังอัปโหลด" : "อัปโหลดสื่อการสอน"}</button>
        </section>
      )}
      {downloadTarget && role === "student" && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="download-dialog-title"><section id="material-download-confirm" className="panel compact-form download-confirm-panel"><SectionTitle title="ยืนยันการดาวน์โหลด" note={downloadTarget.title} /><p className="modal-copy">กรอกรหัสนักเรียนและรหัสผ่านก่อนดาวน์โหลด ระบบจะบันทึกประวัติการดาวน์โหลดให้ครูเห็น</p><div className="form-grid"><label className="field">รหัสนักเรียน<input value={downloadStudentId} onChange={(event) => setDownloadStudentId(event.target.value)} placeholder="เช่น 65001" /></label><label className="field">รหัสผ่าน<input type="password" value={downloadPassword} onChange={(event) => setDownloadPassword(event.target.value)} placeholder="รหัสผ่านนักเรียน" /></label></div><div className="form-actions"><button className="primary-button" disabled={busy} onClick={() => void submitDownload(downloadTarget)}><Download aria-hidden />{busy ? "กำลังดาวน์โหลด" : "ยืนยันดาวน์โหลด"}</button><button className="template-button" type="button" onClick={() => setDownloadTargetId("")}>ยกเลิก</button></div></section></div>}
      {filtered.length ? <div className="material-grid">{filtered.map((item) => <MaterialCard key={item.id} item={item} role={role} previewUrl={previewUrls[item.id]} downloadCount={logs.filter((log) => log.materialId === item.id).length} onOpen={() => onOpen(item)} onDownload={() => role === "student" ? chooseDownloadTarget(item) : void directDownload(item)} onDelete={() => onDelete(item)} />)}</div> : <EmptyState title="ยังไม่มีสื่อการสอน" body="เมื่ออัปโหลดไฟล์แล้ว รายการจะมาแสดงในหน้านี้" />}
      <section className="panel">
        <SectionTitle title={role === "teacher" ? "ประวัติดาวน์โหลดทั้งหมด" : "ประวัติดาวน์โหลดของฉัน"} note={`${logs.length} รายการ`} />
        {logs.length ? <div className="download-log-table"><div className="download-log-head"><span>สื่อ</span><span>นักเรียน</span><span>วันที่</span></div>{logs.map((log) => <div className="download-log-row" key={log.id}><strong>{log.materialTitle}</strong><span>{log.studentName} · {log.studentId}</span><span>{log.downloadedAt}</span></div>)}</div> : <EmptyState title="ยังไม่มีประวัติดาวน์โหลด" body="เมื่อมีการดาวน์โหลดสื่อ ระบบจะบันทึกไว้ที่นี่" />}
      </section>
    </div>
  );
}

function ScoresView({ role, students, assignments, entries, busy, activeClassName, addAssignment, deleteAssignment, updateScoreDraft, saveScoreSheet }: { role: Role; students: StudentRecord[]; assignments: ScoreAssignment[]; entries: ScoreEntry[]; busy: boolean; activeClassName: string; addAssignment: (draft: AssignmentDraft) => Promise<boolean>; deleteAssignment: (assignment: ScoreAssignment) => void; updateScoreDraft: (assignment: ScoreAssignment, student: StudentRecord, value: string) => void; saveScoreSheet: (assignment: ScoreAssignment) => void }) {
  const [draft, setDraft] = useState<AssignmentDraft>({ title: "", rawMax: "", finalMax: "" });
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"raw" | "scaled">("raw");
  const selected = assignments.find((assignment) => assignment.id === selectedId) || assignments[0];
  const note = selected ? `คะแนนดิบเต็ม ${formatScore(selected.rawMax)} หารเป็นคะแนนเก็บ ${formatScore(selected.finalMax)}` : "สร้างงานคะแนนก่อน";

  async function createAssignment() {
    const ok = await addAssignment(draft);
    if (!ok) return;
    setDraft({ title: "", rawMax: "", finalMax: "" });
  }

  if (role === "student") {
    return <StudentScoresView assignments={assignments} entries={entries} students={students} />;
  }

  return (
    <div className="page-stack">
      <PageHeader title="จัดการคะแนน" eyebrow={activeClassName} />
      <section className="panel compact-form">
        <SectionTitle title="เพิ่มงานคะแนน" note="คะแนนดิบ -> คะแนนที่หารแล้ว" />
        <div className="form-grid">
          <label className="field">ชื่องาน / แบบประเมิน<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="เช่น ใบงานที่ 1" /></label>
          <label className="field">คะแนนเต็มดิบ<input type="number" min="1" value={draft.rawMax} onChange={(event) => setDraft({ ...draft, rawMax: event.target.value })} placeholder="เช่น 10" /></label>
          <label className="field">คิดเป็นคะแนนเก็บ<input type="number" min="1" value={draft.finalMax} onChange={(event) => setDraft({ ...draft, finalMax: event.target.value })} placeholder="เช่น 5" /></label>
        </div>
        <button className="primary-button" disabled={busy} onClick={createAssignment}><Plus aria-hidden />เพิ่มงานคะแนน</button>
      </section>
      <section className="panel score-manager">
        <SectionTitle title="ตารางคะแนน" note={note} />
        {assignments.length ? (
          <>
            <div className="score-summary-table"><div className="score-summary-head"><span>งานคะแนน</span><span>คะแนนดิบ</span><span>คะแนนเก็บ</span><span>ผู้เรียน</span></div>{assignments.map((assignment) => <button className={`score-summary-row ${selected?.id === assignment.id ? "active" : ""}`} key={assignment.id} onClick={() => setSelectedId(assignment.id)}><strong>{assignment.title}</strong><span>{formatScore(assignment.rawMax)}</span><span>{formatScore(assignment.finalMax)}</span><span>{students.length} คน</span></button>)}</div>
            <div className="assignment-list">{assignments.map((assignment) => <button className={`assignment-chip ${selected?.id === assignment.id ? "active" : ""}`} key={assignment.id} onClick={() => setSelectedId(assignment.id)}>{assignment.title}<span>{formatScore(assignment.rawMax)}{" -> "}{formatScore(assignment.finalMax)}</span></button>)}</div>
            <div className="score-tabs"><button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>คะแนนดิบ</button><button className={mode === "scaled" ? "active" : ""} onClick={() => setMode("scaled")}>คะแนนที่หารแล้ว</button></div>
            {selected && students.length ? <div className="score-table">{students.map((student) => {
              const entry = findScoreEntry(entries, selected.id, student.id);
              const rawScore = entry?.rawScore ?? 0;
              const final = scaledScore(rawScore, selected.rawMax, selected.finalMax);
              return (
                <article className="score-row score-row-wide" key={student.id}>
                  <div className="student-initial">{student.name.slice(0, 1) || student.studentId.slice(0, 1)}</div>
                  <div><strong>{student.name}</strong><span>ID: {student.studentId}</span></div>
                  <span className={`status-pill ${final >= selected.finalMax * 0.5 ? "pass" : "pending"}`}>{final >= selected.finalMax * 0.5 ? "ผ่าน" : "รอปรับ"}</span>
                  {mode === "raw" ? <label className="score-input"><input type="number" min="0" max={selected.rawMax} value={entry ? numericInputValue(rawScore) : ""} onChange={(event) => updateScoreDraft(selected, student, event.target.value)} placeholder="0" /><span>/ {formatScore(selected.rawMax)}</span></label> : <div className="score-result"><strong>{formatScore(final)}</strong><span>/ {formatScore(selected.finalMax)}</span></div>}
                </article>
              );
            })}</div> : <EmptyState title="ยังไม่มีรายชื่อนักเรียน" body="ไปที่เมนูรายชื่อเพื่อเพิ่มนักเรียนก่อนกรอกคะแนน" />}
            <div className="form-actions">
              {selected && <button className="primary-button" disabled={busy || !students.length} onClick={() => saveScoreSheet(selected)}><Save aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกคะแนน"}</button>}
              {selected && <button className="danger-button" disabled={busy} onClick={() => deleteAssignment(selected)}><Trash2 aria-hidden />ลบงานนี้</button>}
            </div>
          </>
        ) : <EmptyState title="ยังไม่มีงานคะแนน" body="เพิ่มงานคะแนนแรก แล้วระบบจะสร้างตารางให้กรอกตามรายชื่อนักเรียน" />}
      </section>
    </div>
  );
}

function StudentScoresView({ assignments, entries, students }: { assignments: ScoreAssignment[]; entries: ScoreEntry[]; students: StudentRecord[] }) {
  const student = students[0];
  const studentEntries = student ? entries.filter((entry) => entry.studentRecordId === student.id) : [];
  const totalFinal = studentEntries.reduce((sum, entry) => sum + entry.finalScore, 0);
  const totalMax = studentEntries.reduce((sum, entry) => sum + entry.finalMax, 0);
  const ringPercent = totalMax > 0 ? Math.max(0, Math.min(100, (totalFinal / totalMax) * 100)) : 0;
  return <div className="page-stack"><PageHeader title="คะแนนของฉัน" eyebrow={student?.name || "ยังไม่มีข้อมูลนักเรียน"} />{studentEntries.length ? <><section className="panel score-overview student-score-simple"><SectionTitle title="คะแนนทั้งหมด" note={`รวม ${studentEntries.length} รายการ`} /><div className="score-overview-layout"><div className="score-ring" style={{ background: `conic-gradient(var(--ring-fill) 0deg ${ringPercent * 3.6}deg, var(--ring-track) ${ringPercent * 3.6}deg 360deg)` }}><div><strong>{formatScore(totalFinal)}</strong><span>คะแนน</span></div></div><div className="score-overview-copy"><p>คะแนนสะสมจากงานที่ครูบันทึกแล้ว</p></div></div></section><section className="panel"><SectionTitle title="คะแนนทั้งหมด" note={`${studentEntries.length} รายการ`} /><div className="score-summary-table student-score-table"><div className="score-summary-head"><span>งานคะแนน</span><span>คะแนนที่ได้</span></div>{studentEntries.map((entry) => {
    const assignment = assignments.find((item) => item.id === entry.assignmentId);
    return <div className="score-summary-row static" key={entry.id}><strong>{assignment?.title || "งานคะแนน"}</strong><span>{formatScore(entry.finalScore)} คะแนน</span></div>;
  })}</div></section></> : <EmptyState title="ยังไม่มีคะแนน" body="เมื่อคุณครูบันทึกคะแนนแล้วจะแสดงที่นี่" />}</div>;
}

function WorkView({ role, assignments, submissions, busy, activeClassName, submitWork, updateSubmission, saveSubmission, openSubmission }: { role: Role; assignments: ScoreAssignment[]; submissions: SubmissionRecord[]; busy: boolean; activeClassName: string; submitWork: (file: File | null, assignmentId: string) => void; updateSubmission: (id: string, patch: Partial<SubmissionRecord>) => void; saveSubmission: (item: SubmissionRecord) => void; openSubmission: (item: SubmissionRecord) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    void Promise.all(submissions.filter((item) => item.filePath).map(async (item) => {
      const result = await (supabase as any).storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 60);
      return [item.id, result.data?.signedUrl || ""] as const;
    })).then((pairs) => {
      if (!active) return;
      const next: Record<string, string> = {};
      pairs.forEach(([id, url]) => {
        if (url) next[id] = url;
      });
      setPreviewUrls(next);
    });
    return () => {
      active = false;
    };
  }, [submissions]);
  useEffect(() => {
    if (!assignmentId && assignments[0]?.id) setAssignmentId(assignments[0].id);
  }, [assignmentId, assignments]);
  if (role === "teacher") {
    return (
      <div className="page-stack">
        <PageHeader title="ตรวจงาน" eyebrow={activeClassName} />
        <section className="panel">
          <SectionTitle title="รายการงานส่ง" note={`${submissions.length} รายการ`} />
          {submissions.length ? <div className="submission-list">{submissions.map((item) => <ReviewCard key={item.id} item={item} previewUrl={previewUrls[item.id]} busy={busy} updateSubmission={updateSubmission} saveSubmission={saveSubmission} openSubmission={openSubmission} />)}</div> : <EmptyState title="ยังไม่มีงานส่ง" body="เมื่อนักเรียนอัปโหลดงานของห้องที่เลือก รายการจะปรากฏที่นี่" />}
        </section>
      </div>
    );
  }
  return (
    <div className="page-stack">
      <PageHeader title="ส่งงาน" eyebrow={activeClassName} />
      <section className="panel compact-form">
        {assignments.length ? (
          <>
            <label className="field">
              ชื่องาน
              <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
                {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title} ({formatScore(assignment.rawMax)} / {formatScore(assignment.finalMax)})</option>)}
              </select>
            </label>
            <UploadPanel file={file} setFile={setFile} accept=".pdf,.docx,.png,.jpg,.jpeg" label="เลือกไฟล์งานของคุณ" help="รองรับ PDF, DOCX, PNG, JPG ขนาดไม่เกิน 10MB" />
            <button className="primary-button full-button" disabled={busy} onClick={() => submitWork(file, assignmentId)}><CloudUpload aria-hidden />{busy ? "กำลังส่งงาน" : "ส่งงาน"}</button>
          </>
        ) : <EmptyState title="ยังไม่มีงานให้ส่ง" body="รอคุณครูกำหนดงานในหน้าจัดการคะแนนก่อน" />}
      </section>
      <section className="panel">
        <SectionTitle title="ประวัติการส่งงาน" note={`${submissions.length} รายการ`} />
        {submissions.length ? <SubmissionList items={submissions} previewUrls={previewUrls} onOpen={openSubmission} /> : <EmptyState title="ยังไม่มีประวัติ" body="เมื่อส่งงานแล้วจะแสดงรายการที่นี่" />}
      </section>
    </div>
  );
}

function ReviewCard({ item, previewUrl, busy, updateSubmission, saveSubmission, openSubmission }: { item: SubmissionRecord; previewUrl?: string; busy: boolean; updateSubmission: (id: string, patch: Partial<SubmissionRecord>) => void; saveSubmission: (item: SubmissionRecord) => void; openSubmission: (item: SubmissionRecord) => void }) {
  return (
    <article className="submission-card review-card">
      <div>
        <strong>{item.assignmentTitle}</strong>
        <span>{item.studentName} · ID: {item.studentId}</span>
        <small>{item.submittedAt}</small>
        <small>{item.filePath ? `ไฟล์: ${fileNameFromPath(item.filePath)}` : "ยังไม่มีไฟล์แนบ"}</small>
        <FilePreview itemType={materialTypeFromFile(item.filePath || "", "")} url={previewUrl} label={item.assignmentTitle} compact />
        <button className="text-button inline-link" type="button" onClick={() => openSubmission(item)} disabled={!item.filePath}><ExternalLink aria-hidden />เปิดไฟล์งานนักเรียน</button>
      </div>
      <div className="review-grid">
        <label className="field">สถานะ<select value={item.status} onChange={(event) => updateSubmission(item.id, { status: event.target.value as SubmissionStatus })}>{submissionStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="field">คะแนนดิบ<input type="number" min="0" value={numericInputValue(item.rawScore)} onChange={(event) => updateSubmission(item.id, { rawScore: clampScore(event.target.value, item.rawMax) })} placeholder="0" /></label>
        <label className="field">เต็มดิบ<input type="number" min="1" value={item.rawMax} onChange={(event) => updateSubmission(item.id, { rawMax: positiveNumber(event.target.value, item.rawMax) })} /></label>
        <label className="field">คะแนนเก็บเต็ม<input type="number" min="1" value={item.finalMax} onChange={(event) => updateSubmission(item.id, { finalMax: positiveNumber(event.target.value, item.finalMax) })} /></label>
        <div className="score-result"><strong>{formatScore(scaledScore(item.rawScore, item.rawMax, item.finalMax))}</strong><span>/ {formatScore(item.finalMax)}</span></div>
        <button className="small-primary" disabled={busy} onClick={() => saveSubmission(item)}><Save aria-hidden />บันทึก</button>
      </div>
    </article>
  );
}

function StudentsView({ classrooms, selectedClassroom, selectedClassroomId, students, busy, flash, addClassroom, deleteClassroom, selectClassroom, addStudent, deleteStudent, deleteStudents, uploadRosterFile, createStudentAccount }: { classrooms: Classroom[]; selectedClassroom?: Classroom; selectedClassroomId: string; students: StudentRecord[]; busy: boolean; flash: (message: string) => void; addClassroom: (draft: ClassroomDraft) => Promise<boolean>; deleteClassroom: (classroom: Classroom) => void; selectClassroom: (id: string) => void; addStudent: (draft: StudentDraft) => Promise<boolean>; deleteStudent: (student: StudentRecord) => void; deleteStudents: (students: StudentRecord[]) => Promise<boolean>; uploadRosterFile: (file: File | null) => Promise<boolean>; createStudentAccount: (student: StudentRecord, password: string, options?: { silent?: boolean }) => Promise<boolean> }) {
  const [file, setFile] = useState<File | null>(null);
  const [classDraft, setClassDraft] = useState<ClassroomDraft>({ academicYear: "2569", level: "ม.1", room: "", subject: "สังคมศึกษา" });
  const [draft, setDraft] = useState<StudentDraft>({ no: "", studentId: "", name: "", gender: "" });
  const [accountPassword, setAccountPassword] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const selectedStudents = students.filter((student) => selectedStudentIds.includes(student.id));
  const selectedStudentsWithoutAccounts = selectedStudents.filter((student) => !student.authEmail && !student.accountCreatedAt);
  const allStudentsChecked = students.length > 0 && students.every((student) => selectedStudentIds.includes(student.id));
  useEffect(() => {
    setSelectedStudentIds((current) => current.filter((id) => students.some((student) => student.id === id)));
  }, [students]);
  async function saveClassroom() {
    const ok = await addClassroom(classDraft);
    if (!ok) return;
    setClassDraft({ academicYear: classDraft.academicYear, level: classDraft.level, room: "", subject: classDraft.subject });
  }
  async function saveStudent() {
    const ok = await addStudent(draft);
    if (!ok) return;
    setDraft({ no: "", studentId: "", name: "", gender: "" });
  }
  async function saveRoster() {
    const ok = await uploadRosterFile(file);
    if (!ok) return;
    setFile(null);
  }
  function toggleStudentSelection(student: StudentRecord) {
    setSelectedStudentIds((current) => current.includes(student.id) ? current.filter((id) => id !== student.id) : [...current, student.id]);
  }
  function toggleAllStudents() {
    setSelectedStudentIds(allStudentsChecked ? [] : students.map((student) => student.id));
  }
  async function createSelectedStudentAccounts() {
    if (!selectedStudentsWithoutAccounts.length) {
      flash("เลือกนักเรียนที่ยังไม่สร้างบัญชีก่อน");
      return;
    }
    let successCount = 0;
    for (const student of selectedStudentsWithoutAccounts) {
      const ok = await createStudentAccount(student, accountPassword, { silent: true });
      if (ok) successCount += 1;
    }
    setSelectedStudentIds([]);
    flash(successCount === selectedStudentsWithoutAccounts.length ? `สร้างบัญชีนักเรียน ${successCount} คนเรียบร้อย` : `สร้างบัญชีสำเร็จ ${successCount} จาก ${selectedStudentsWithoutAccounts.length} คน`);
  }
  async function deleteSelectedStudents() {
    if (!selectedStudents.length) {
      flash("เลือกรายชื่อที่ต้องการลบก่อน");
      return;
    }
    if (!window.confirm(`ลบรายชื่อ ${selectedStudents.length} คนออกจากห้องนี้?`)) return;
    const ok = await deleteStudents(selectedStudents);
    if (ok) setSelectedStudentIds([]);
  }
  return (
    <div className="page-stack">
      <PageHeader title="รายชื่อนักเรียน" eyebrow={selectedClassroom?.displayName || NO_CLASS_LABEL} />
      <section className="panel compact-form">
        <SectionTitle title="ตั้งค่าห้องเรียน" note="ปีการศึกษา / ระดับชั้น / ห้อง / รายวิชา" />
        <div className="form-grid classroom-form-grid">
          <label className="field">ปีการศึกษา<input value={classDraft.academicYear} onChange={(event) => setClassDraft({ ...classDraft, academicYear: event.target.value })} placeholder="2569" /></label>
          <label className="field">ระดับชั้น<select value={classDraft.level} onChange={(event) => setClassDraft({ ...classDraft, level: event.target.value })}>{gradeLevels.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="field">ห้อง<input value={classDraft.room} onChange={(event) => setClassDraft({ ...classDraft, room: event.target.value })} placeholder="เช่น 1" /></label>
          <label className="field">รายวิชา<input value={classDraft.subject} onChange={(event) => setClassDraft({ ...classDraft, subject: event.target.value })} placeholder="สังคมศึกษา" /></label>
        </div>
        <button className="primary-button" disabled={busy} onClick={saveClassroom}><Plus aria-hidden />เพิ่มห้องเรียน</button>
        {classrooms.length ? <div className="classroom-list">{classrooms.map((classroom) => <div className={`classroom-chip ${selectedClassroomId === classroom.id ? "active" : ""}`} key={classroom.id}><button type="button" onClick={() => selectClassroom(classroom.id)}><strong>{classroom.displayName}</strong><span>ปีการศึกษา {classroom.academicYear}</span></button><button className="icon-danger" disabled={busy} onClick={() => deleteClassroom(classroom)} title="ลบห้องเรียน"><Trash2 aria-hidden /></button></div>)}</div> : <EmptyState title="ยังไม่มีห้องเรียน" body="เพิ่มห้องเรียนก่อน แล้วจึงเพิ่มรายชื่อหรือคะแนนของห้องนั้น" />}
      </section>
      <UploadPanel file={file} setFile={setFile} accept=".xlsx,.csv,.xls" label="อัปโหลดรายชื่อนักเรียน" help="รองรับคอลัมน์ เลขที่, เลขประจำตัว, คำนำหน้า, ชื่อ, สกุล และไฟล์ขนาดไม่เกิน 5MB" />
      <button className="primary-button full-button" disabled={busy} onClick={saveRoster}><CheckCircle2 aria-hidden />{busy ? "กำลังนำเข้ารายชื่อ" : "นำเข้ารายชื่อจากไฟล์"}</button>
      <section className="panel compact-form">
        <SectionTitle title="เพิ่มรายชื่อนักเรียน" note={selectedClassroom?.displayName || "เลือกห้องเรียนก่อน"} />
        <div className="form-grid">
          <label className="field">เลขที่<input type="number" min="1" value={draft.no} onChange={(event) => setDraft({ ...draft, no: event.target.value })} /></label>
          <label className="field">รหัสนักเรียน<input value={draft.studentId} onChange={(event) => setDraft({ ...draft, studentId: event.target.value })} /></label>
          <label className="field">ชื่อ-นามสกุล<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
          <label className="field">เพศ / หมายเหตุ<input value={draft.gender} onChange={(event) => setDraft({ ...draft, gender: event.target.value })} /></label>
        </div>
        <div className="form-actions"><button className="primary-button" disabled={busy} onClick={saveStudent}><Plus aria-hidden />เพิ่มรายชื่อ</button><button className="template-button" onClick={() => downloadRosterTemplate("csv")}><Download aria-hidden />ดาวน์โหลดแม่แบบ CSV</button></div>
      </section>
      <section className="panel">
        <SectionTitle title="รายชื่อในห้องนี้" note={`${students.length} คน`} />
        <div className="account-toolbar">
          <label className="field">รหัสผ่านเริ่มต้นสำหรับบัญชีใหม่<input type="text" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} placeholder="เว้นว่าง = รหัสนักเรียน@2569" /></label>
          <div className="bulk-account-row">
            <button className="template-button" type="button" disabled={busy || !students.length} onClick={toggleAllStudents}><CheckCircle2 aria-hidden />{allStudentsChecked ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}</button>
            <button className="small-primary" type="button" disabled={busy || !selectedStudentsWithoutAccounts.length} onClick={createSelectedStudentAccounts}><UserPlus aria-hidden />สร้างบัญชีที่เลือก ({selectedStudentsWithoutAccounts.length})</button>
            <button className="danger-button" type="button" disabled={busy || !selectedStudents.length} onClick={deleteSelectedStudents}><Trash2 aria-hidden />ลบที่เลือก ({selectedStudents.length})</button>
          </div>
        </div>
        {students.length ? <div className="student-preview"><div className="student-preview-head student-preview-head-action"><span className="check-cell"><input type="checkbox" aria-label="เลือกรายชื่อทั้งหมด" checked={allStudentsChecked} disabled={busy || !students.length} onChange={toggleAllStudents} /></span><span>เลขที่</span><span>รหัสนักเรียน</span><span>ชื่อ-นามสกุล</span><span>บัญชี</span><span></span><span></span></div>{students.map((student) => {
          const hasAccount = Boolean(student.authEmail || student.accountCreatedAt);
          return <div className="student-preview-row student-preview-row-action" key={student.id}><label className="check-cell"><input type="checkbox" aria-label={`เลือก ${student.name}`} checked={selectedStudentIds.includes(student.id)} disabled={busy} onChange={() => toggleStudentSelection(student)} /></label><span>{student.no}</span><span>{student.studentId}</span><strong>{student.name}</strong><span className={`status-pill ${hasAccount ? "pass" : "pending"}`}>{hasAccount ? "มีบัญชีแล้ว" : "ยังไม่สร้าง"}</span><button className="small-primary account-button" disabled={busy} onClick={() => createStudentAccount(student, accountPassword)} title="สร้างหรือรีเซ็ตรหัสบัญชีนักเรียน"><UserPlus aria-hidden />บัญชี</button><button className="icon-danger" disabled={busy} onClick={() => deleteStudent(student)} title="ลบรายชื่อ"><Trash2 aria-hidden /></button></div>;
        })}</div> : <EmptyState title="ยังไม่มีรายชื่อ" body="เพิ่มรายชื่อด้วยฟอร์มด้านบน หรืออัปโหลดไฟล์เก็บไว้ก่อน" />}
      </section>
    </div>
  );
}

function UploadPanel({ file, setFile, accept, label, help }: { file: File | null; setFile: (file: File | null) => void; accept: string; label: string; help: string }) {
  return <section className="upload-panel"><CloudUpload aria-hidden /><strong>{label}</strong><span>หรือ</span><label className="outline-file-button"><Upload aria-hidden /><input accept={accept} type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{file ? file.name : "เลือกไฟล์จากเครื่อง"}</label><small>{help}</small></section>;
}

function ProfileView({ session, busy, changePassword }: { session: AppSession; busy: boolean; changePassword: (newPassword: string) => void }) {
  const [newPassword, setNewPassword] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    changePassword(newPassword);
    setNewPassword("");
  }
  return (
    <div className="page-stack">
      <PageHeader title="โปรไฟล์" eyebrow={session.room} />
      <section className="profile-panel">
        <div className="profile-avatar">{session.name.slice(0, 1)}</div>
        <div><h2>{session.name}</h2><p>{session.school}{session.studentCode ? ` · รหัส ${session.studentCode}` : ""}</p></div>
      </section>
      <section className="panel compact-form">
        <SectionTitle title="เปลี่ยนรหัสผ่าน" />
        <form className="form-actions password-form" onSubmit={submit}>
          <label className="field">รหัสผ่านใหม่<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" /></label>
          <button className="primary-button" disabled={busy}><KeyRound aria-hidden />{busy ? "กำลังบันทึก" : "เปลี่ยนรหัสผ่าน"}</button>
        </form>
      </section>
    </div>
  );
}

function PageHeader({ title, eyebrow }: { title: string; eyebrow: string }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></div>;
}

function SectionTitle({ title, note }: { title: string; note?: string }) {
  return <div className="section-heading"><h2>{title}</h2>{note && <span>{note}</span>}</div>;
}

function FilePreview({ itemType, url, label, compact = false }: { itemType: MaterialType; url?: string; label: string; compact?: boolean }) {
  if (!url) return <div className={`file-preview ${compact ? "compact" : ""}`}><span>กำลังเตรียมพรีวิว {label}</span></div>;
  if (itemType === "VIDEO") return <video className={`file-preview ${compact ? "compact" : ""}`} controls preload="metadata" src={url} />;
  if (itemType === "IMG") return <img className={`file-preview ${compact ? "compact" : ""}`} src={url} alt={label} />;
  return (
    <div className={`file-preview pdf-preview ${compact ? "compact" : ""}`}>
      <iframe className="pdf-native-preview" src={url} title={label} />
      <div className="pdf-mobile-preview">
        <FileText aria-hidden />
        <div>
          <strong>{label}</strong>
          <span>PDF บางเครื่องไม่แสดงแบบฝังในมือถือ</span>
        </div>
        <button className="template-button" type="button" onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
          <ExternalLink aria-hidden />
          เปิดพรีวิว PDF
        </button>
      </div>
    </div>
  );
}

function MaterialCard({ item, role, previewUrl, downloadCount, onOpen, onDownload, onDelete }: { item: Material; role: Role; previewUrl?: string; downloadCount: number; onOpen: () => void; onDownload: () => void; onDelete: () => void }) {
  return <article className={`material-card tone-border-${item.accent}`}><div className={`material-icon tone-${item.accent}`}><BookOpen aria-hidden /></div><FilePreview itemType={item.type} url={previewUrl} label={item.title} /><div className="material-body"><div className="material-meta"><span className={`type-pill ${item.type.toLowerCase()}`}>{item.type}</span><span>{item.date}</span></div><h2>{item.title}</h2><p>{item.unit} · ระดับ: {item.level}</p><small>ดาวน์โหลดแล้ว {downloadCount} ครั้ง</small><div className="card-actions"><button className="small-primary" onClick={onOpen}><Eye aria-hidden />ดู</button><button className="template-button" onClick={onDownload}><Download aria-hidden />ดาวน์โหลด</button>{role === "teacher" && <button className="danger-button small-danger" onClick={onDelete}><Trash2 aria-hidden />ลบ</button>}</div></div></article>;
}

function SubmissionList({ items, previewUrls = {}, onOpen, compact = false }: { items: SubmissionRecord[]; previewUrls?: Record<string, string>; onOpen?: (item: SubmissionRecord) => void; compact?: boolean }) {
  return <div className="submission-list">{items.slice(0, compact ? 2 : items.length).map((item) => <article className="submission-card" key={item.id}><div><strong>{item.assignmentTitle}</strong><span>{item.studentName} · ID: {item.studentId}</span><FilePreview itemType={materialTypeFromFile(item.filePath || "", "")} url={previewUrls[item.id]} label={item.assignmentTitle} compact /></div><div className="submission-state"><small>{item.submittedAt}</small><span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span>{onOpen && <button className="small-primary" type="button" onClick={() => onOpen(item)} disabled={!item.filePath}><Eye aria-hidden />ดูงาน</button>}</div></article>)}</div>;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{body}</span></div>;
}

function downloadRosterTemplate(kind: "excel" | "csv") {
  const csv = "เลขที่,เลขประจำตัว,คำนำหน้า,ชื่อ,สกุล\n1,65001,นาย,สมชาย,ใจดี\n";
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = kind === "excel" ? "student-roster-template-excel.csv" : "student-roster-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function mapClassroomRow(row: any): Classroom {
  return {
    id: String(row.id),
    academicYear: row.academic_year || row.academicYear || "",
    level: row.level || "",
    room: row.room || "",
    subject: row.subject || "",
    displayName: row.display_name || row.displayName || formatClassroomName({
      academicYear: row.academic_year || row.academicYear || "",
      level: row.level || "",
      room: row.room || "",
      subject: row.subject || ""
    })
  };
}

function mapMaterialRow(row: any): Material {
  const type = (row.material_type || row.type || "PDF") as MaterialType;
  return {
    id: String(row.id),
    title: row.title || "สื่อการสอน",
    unit: row.unit || "สื่อเสริม",
    level: row.level || "ม.1",
    type,
    date: formatDate(row.published_at || row.date || new Date().toISOString()),
    filePath: row.file_path || row.filePath || "",
    className: row.class_name || row.className || NO_CLASS_LABEL,
    classroomId: row.classroom_id || row.classroomId || undefined,
    accent: accentForType(type)
  };
}

function mapAnnouncementRow(row: any): Announcement {
  return {
    id: String(row.id),
    title: row.title || "ประกาศ",
    body: row.body || "",
    className: row.class_name || row.className || NO_CLASS_LABEL,
    classroomId: row.classroom_id || row.classroomId || undefined,
    publishedAt: formatDate(row.published_at || row.publishedAt || new Date().toISOString())
  };
}

function mapMaterialDownloadLogRow(row: any): MaterialDownloadLog {
  return {
    id: String(row.id),
    materialId: row.material_id || row.materialId || "",
    materialTitle: row.material_title || row.materialTitle || "สื่อการสอน",
    studentId: row.student_code || row.studentId || "",
    studentName: row.student_name || row.studentName || "นักเรียน",
    className: row.class_name || row.className || NO_CLASS_LABEL,
    classroomId: row.classroom_id || row.classroomId || undefined,
    downloadedAt: formatDate(row.downloaded_at || row.downloadedAt || new Date().toISOString())
  };
}

function mapStudentRow(row: any): StudentRecord {
  return {
    id: String(row.id),
    no: Number(row.student_no ?? row.no ?? 0),
    studentId: row.student_code || row.studentId || "",
    name: row.full_name || row.name || "",
    gender: row.gender || "",
    className: row.class_name || row.className || NO_CLASS_LABEL,
    classroomId: row.classroom_id || row.classroomId || undefined,
    authEmail: row.auth_email || row.authEmail || undefined,
    accountCreatedAt: row.account_created_at || row.accountCreatedAt || undefined
  };
}

function mapAssignmentRow(row: any): ScoreAssignment {
  return {
    id: String(row.id),
    title: row.title || "งานคะแนน",
    className: row.class_name || row.className || NO_CLASS_LABEL,
    classroomId: row.classroom_id || row.classroomId || undefined,
    rawMax: Number(row.raw_max ?? row.rawMax ?? 10),
    finalMax: Number(row.final_max ?? row.finalMax ?? 10),
    createdAt: formatDate(row.created_at || row.createdAt || new Date().toISOString())
  };
}

function mapScoreEntryRow(row: any): ScoreEntry {
  return {
    id: String(row.id),
    assignmentId: row.assignment_id || row.assignmentId || "",
    studentRecordId: row.student_id || row.studentRecordId || "",
    studentId: row.student_code || row.studentId || "",
    rawScore: Number(row.raw_score ?? row.rawScore ?? 0),
    rawMax: Number(row.raw_max ?? row.rawMax ?? 10),
    finalScore: Number(row.final_score ?? row.finalScore ?? 0),
    finalMax: Number(row.final_max ?? row.finalMax ?? 10)
  };
}

function mapSubmissionRow(row: any): SubmissionRecord {
  const rawScore = Number(row.raw_score ?? row.rawScore ?? 0);
  const rawMax = Number(row.raw_max ?? row.rawMax ?? 10);
  const finalMax = Number(row.final_max ?? row.finalMax ?? 10);
  return {
    id: String(row.id),
    assignmentId: row.assignment_id || row.assignmentId || undefined,
    assignmentTitle: row.assignment_title || row.assignmentTitle || "งานที่ส่ง",
    studentName: row.student_name || row.studentName || "นักเรียน",
    studentId: row.student_code || row.studentId || "",
    classroomId: row.classroom_id || row.classroomId || undefined,
    filePath: row.file_path || row.filePath || undefined,
    status: (row.status || "รอตรวจ") as SubmissionStatus,
    submittedAt: formatDate(row.submitted_at || row.submittedAt || new Date().toISOString()),
    rawScore,
    rawMax,
    finalScore: Number(row.final_score ?? row.finalScore ?? scaledScore(rawScore, rawMax, finalMax)),
    finalMax
  };
}

function buildScoreEntry(assignment: ScoreAssignment, student: StudentRecord, rawScore: number): ScoreEntry {
  return {
    id: `draft-${assignment.id}-${student.id}`,
    assignmentId: assignment.id,
    studentRecordId: student.id,
    studentId: student.studentId,
    rawScore,
    rawMax: assignment.rawMax,
    finalScore: scaledScore(rawScore, assignment.rawMax, assignment.finalMax),
    finalMax: assignment.finalMax
  };
}

function findScoreEntry(entries: ScoreEntry[], assignmentId: string, studentId: string) {
  return entries.find((entry) => entry.assignmentId === assignmentId && entry.studentRecordId === studentId);
}

function scaledScore(rawScore: number, rawMax: number, finalMax: number) {
  if (!rawMax || rawMax <= 0) return 0;
  return Math.round((rawScore / rawMax) * finalMax * 100) / 100;
}

function clampScore(value: string, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, parsed));
}

function positiveNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function numericInputValue(value: number) {
  return value === 0 ? "" : formatScore(value);
}

function formatDate(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-\u0E00-\u0E7F]+/g, "-");
}

function storageSafeFileName(name: string) {
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

async function parseRosterFile(file: File): Promise<RosterStudent[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("ไม่พบชีตข้อมูลในไฟล์รายชื่อ");
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: false, defval: "" });
  return mapRosterRows(rows);
}

function mapRosterRows(rows: Array<Array<string | number | null>>): RosterStudent[] {
  const normalizedRows = rows
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell));
  if (!normalizedRows.length) return [];

  const hasHeader = looksLikeRosterHeader(normalizedRows[0]);
  const columns = hasHeader ? resolveRosterColumns(normalizedRows[0]) : {};
  const dataRows = hasHeader ? normalizedRows.slice(1) : normalizedRows;
  const seen = new Set<string>();

  return dataRows.flatMap((row, index) => {
    const studentId = hasHeader ? readRosterCell(row, columns.studentId) : readRosterCell(row, undefined, 1);
    const fullName = hasHeader ? readRosterCell(row, columns.name) : readRosterCell(row, undefined, 2);
    const splitName = joinRosterName(
      readRosterCell(row, columns.prefix),
      readRosterCell(row, columns.firstName),
      readRosterCell(row, columns.lastName)
    );
    const name = splitName || fullName;
    if (!studentId || !name) return [];

    const uniqueId = studentId.replace(/\s+/g, "");
    if (!uniqueId || seen.has(uniqueId)) return [];
    seen.add(uniqueId);

    const noValue = hasHeader ? readRosterCell(row, columns.no) : readRosterCell(row, undefined, 0);
    const parsedNo = Number(noValue);
    return [{
      no: Number.isFinite(parsedNo) && parsedNo > 0 ? parsedNo : index + 1,
      studentId: uniqueId,
      name,
      gender: hasHeader ? readRosterCell(row, columns.gender) : readRosterCell(row, undefined, 3)
    }];
  }).sort((a, b) => a.no - b.no || a.studentId.localeCompare(b.studentId));
}

function looksLikeRosterHeader(row: string[]) {
  return row.some((cell) => {
    const normalized = normalizeRosterHeader(cell);
    return ["เลขที่", "รหัสนักเรียน", "คำนำหน้า", "ชื่อ", "สกุล", "ชื่อ-นามสกุล"].includes(normalized);
  });
}

function resolveRosterColumns(headerRow: string[]) {
  const columns: { no?: number; studentId?: number; prefix?: number; firstName?: number; lastName?: number; name?: number; gender?: number } = {};
  headerRow.forEach((cell, index) => {
    const normalized = normalizeRosterHeader(cell);
    if (normalized === "เลขที่" && columns.no == null) columns.no = index;
    if (normalized === "รหัสนักเรียน" && columns.studentId == null) columns.studentId = index;
    if (normalized === "คำนำหน้า" && columns.prefix == null) columns.prefix = index;
    if (normalized === "ชื่อ" && columns.firstName == null) columns.firstName = index;
    if (normalized === "สกุล" && columns.lastName == null) columns.lastName = index;
    if (normalized === "ชื่อ-นามสกุล" && columns.name == null) columns.name = index;
    if (normalized === "เพศ" && columns.gender == null) columns.gender = index;
  });
  return columns;
}

function normalizeRosterHeader(value: string) {
  const compact = value.toLowerCase().replace(/[\s._:/()-]+/g, "");
  if (["เลขที่", "เลข", "ลำดับ", "ลำดับที่", "no", "number"].includes(compact)) return "เลขที่";
  if (["เลขประจำตัว", "เลขประจำตัวนักเรียน", "รหัสนักเรียน", "รหัส", "รหัสประจำตัวนักเรียน", "studentid", "studentcode", "studentnumber", "id"].includes(compact)) return "รหัสนักเรียน";
  if (["คำนำหน้า", "คำนำหน้าชื่อ", "title", "prefix", "salutation"].includes(compact)) return "คำนำหน้า";
  if (["ชื่อ", "ชื่อจริง", "firstname", "givenname"].includes(compact)) return "ชื่อ";
  if (["สกุล", "นามสกุล", "lastname", "surname", "familyname"].includes(compact)) return "สกุล";
  if (["ชื่อนามสกุล", "ชื่อเต็ม", "fullname", "name"].includes(compact)) return "ชื่อ-นามสกุล";
  if (["เพศ", "gender", "หมายเหตุ", "เพศหมายเหตุ"].includes(compact)) return "เพศ";
  return compact;
}

function readRosterCell(row: string[], columnIndex: number | undefined, fallbackIndex?: number) {
  const resolvedIndex = columnIndex ?? fallbackIndex;
  if (resolvedIndex == null) return "";
  const value = row[resolvedIndex];
  return String(value ?? "").trim();
}

function joinRosterName(prefix: string, firstName: string, lastName: string) {
  if (!firstName && !lastName) return "";
  const givenName = `${prefix}${firstName}`.trim();
  return [givenName, lastName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function cleanFileTitle(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

function fileNameFromPath(filePath: string) {
  const raw = filePath.split("/").pop() || filePath;
  return raw.replace(/^\d+-/, "");
}

async function triggerFileDownload(url: string, item: Material) {
  const fallback = () => {
    window.location.href = url;
  };
  try {
    const response = await fetch(url);
    if (!response.ok) {
      fallback();
      return;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = downloadFileName(item);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    fallback();
  }
}

function downloadFileName(item: Material) {
  const originalName = fileNameFromPath(item.filePath);
  const extension = originalName.includes(".") ? originalName.split(".").pop() : "";
  const safeTitle = safeFileName(item.title);
  return extension ? `${safeTitle}.${extension}` : safeTitle;
}

function materialTypeFromFile(name: string, mimeType = ""): MaterialType {
  const lower = name.toLowerCase();
  if (mimeType.includes("video") || lower.endsWith(".mp4") || lower.endsWith(".mov")) return "VIDEO";
  if (mimeType.includes("image") || /\.(png|jpe?g)$/i.test(name)) return "IMG";
  return "PDF";
}

function mimeForMaterial(name: string, type: MaterialType) {
  const lower = name.toLowerCase();
  if (type === "PDF") return "application/pdf";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (type === "VIDEO") return "video/mp4";
  if (lower.endsWith(".png")) return "image/png";
  if (type === "IMG") return "image/jpeg";
  return "application/octet-stream";
}

function normalizeLoginIdentifier(identifier: string, role: Role) {
  const trimmed = identifier.trim();
  if (role === "student" && trimmed && !trimmed.includes("@")) return studentCodeToEmail(trimmed);
  return trimmed;
}

function studentCodeToEmail(studentCode: string) {
  return `${studentCode.trim().toLowerCase()}@${STUDENT_EMAIL_DOMAIN}`;
}

function studentCodeFromEmail(email?: string) {
  if (!email?.endsWith(`@${STUDENT_EMAIL_DOMAIN}`)) return "";
  return email.slice(0, -(`@${STUDENT_EMAIL_DOMAIN}`).length);
}

function defaultStudentPassword(studentCode: string) {
  return `${studentCode.trim()}@2569`;
}

function accentForType(type: MaterialType): Material["accent"] {
  if (type === "VIDEO") return "blue";
  if (type === "IMG") return "coral";
  return "green";
}

function sortStudents(a: StudentRecord, b: StudentRecord) {
  return a.no - b.no || a.studentId.localeCompare(b.studentId);
}

function formatClassroomName(draft: ClassroomDraft) {
  const room = draft.room.trim();
  const level = draft.level.trim();
  const subject = draft.subject.trim();
  return `${level} ห้อง ${room} - ${subject}`;
}

function belongsToClass(item: { classroomId?: string; className?: string }, classroom: Classroom) {
  return item.classroomId === classroom.id || (!item.classroomId && item.className === classroom.displayName);
}

function studentScopedItems<T extends { classroomId?: string; className?: string }>(items: T[], classroom: Classroom | undefined, student: StudentRecord | undefined, session: AppSession | null) {
  if (classroom) return items.filter((item) => belongsToClass(item, classroom));
  return items.filter((item) => {
    if (student?.classroomId && item.classroomId === student.classroomId) return true;
    if (student?.className && item.className === student.className) return true;
    return Boolean(session?.room && item.className === session.room);
  });
}

function scoreSummaryForStudent(student: StudentRecord | undefined, entries: ScoreEntry[]) {
  const studentEntries = student ? entries.filter((entry) => entry.studentRecordId === student.id) : [];
  const totalFinal = studentEntries.reduce((sum, entry) => sum + entry.finalScore, 0);
  const totalMax = studentEntries.reduce((sum, entry) => sum + entry.finalMax, 0);
  const ringPercent = totalMax > 0 ? Math.max(0, Math.min(100, (totalFinal / totalMax) * 100)) : 0;
  return { totalFinal, totalMax, ringPercent };
}

function statusTone(status: SubmissionStatus) {
  if (status === "ตรวจแล้ว") return "pass";
  if (status === "ให้แก้ไข" || status === "ส่งช้า") return "fail";
  return "pending";
}

function flashAndFail(message: string, flash: (message: string) => void) {
  flash(message);
  return false;
}

export default App;
