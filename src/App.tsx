import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
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
  EyeOff,
  FileText,
  FileSpreadsheet,
  GraduationCap,
  Globe2,
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
  Pencil,
  Sun
} from "lucide-react";
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from "./lib/supabase";
import {
  safeStorageSegment,
  storageSafeFileName,
  normalizeExternalUrl,
  userFacingError,
  validateMaterialFile,
  validateRosterFile,
  validateStudentCode,
  validateStudentPassword,
  validateSubmissionFile
} from "./lib/validation";
import { createOrResetStudentAccount } from "./services/studentService";
import { fetchAllScoreEntryRows } from "./services/scoreService";
import {
  isLegacyDemoSubmission,
  mapAnnouncementRow,
  mapAssignmentRow,
  mapClassroomRow,
  mapMaterialDownloadLogRow,
  mapMaterialRow,
  mapScoreEntryRow,
  mapStudentRow,
  mapStudentHomeCardRow,
  mapSubmissionRow
} from "./lib/rowMappers";
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
  ScoreEntryStatus,
  StudentHomeCard,
  StudentRecord,
  SubmissionKind,
  SubmissionRecord,
  SubmissionStatus,
  ViewKey
} from "./types";

type MaterialUpload = { file: File | null; title: string; unit: string; level: string; type: MaterialType };
type ClassroomDraft = { academicYear: string; level: string; room: string; subject: string };
type StudentDraft = { no: string; studentId: string; name: string; gender: string };
type RosterStudent = { no: number; studentId: string; name: string; gender: string };
type AnnouncementDraft = { title: string; body: string; classroomId: string };
type StudentHomeCardDraft = { title: string; description: string; url: string; classroomIds: string[]; showToAll: boolean };
type AssignmentDraft = { title: string; rawMax: string; finalMax: string; classroomIds: string[] };
type SubmissionDraft = { assignmentId: string; file: File | null; linkUrl: string; submissionKind: SubmissionKind; memberCodes: string[] };
type AssignmentGroup = { key: string; assignmentGroupId?: string; title: string; rawMax: number; finalMax: number; assignments: ScoreAssignment[]; classroomIds: string[]; hasMixedValues: boolean };
type ThemeMode = "light" | "dark";
type ScoreAutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
type ProfileRow = { full_name?: string | null; role?: string | null; class_name?: string | null; school_name?: string | null; student_code?: string | null };

const SCHOOL_LOGO = `${import.meta.env.BASE_URL}kruthai-logo.png`;
const SCHOOL_NAME = "โรงเรียนเทพศิรินทร์ นนทบุรี";
const NO_CLASS_LABEL = "ยังไม่ได้เลือกห้องเรียน";
const STORAGE_BUCKET = "classroom-files";
const STUDENT_EMAIL_DOMAIN = "students.kruthai.local";
const gradeLevels = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"] as const;
const filters: Array<"ทั้งหมด" | MaterialType | (typeof gradeLevels)[number]> = ["ทั้งหมด", ...gradeLevels, "VIDEO", "PDF"];
const materialTypes: MaterialType[] = ["PDF", "VIDEO", "IMG"];
const submissionStatuses: SubmissionStatus[] = ["ยังไม่ส่ง", "ส่งแล้ว", "รอตรวจ", "ตรวจแล้ว", "ให้แก้ไข", "ส่งช้า"];
const scoreEntryStatusOptions: Array<{ value: ScoreEntryStatus; label: string }> = [
  { value: "ungraded", label: "ยังไม่กรอก" },
  { value: "scored", label: "คะแนน" },
  { value: "leave", label: "ลา" },
  { value: "expired", label: "หมดเวลาส่ง" },
  { value: "no_score", label: "ไม่มีคะแนน" }
];

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

async function resolveAppSession(user: SupabaseUser | null | undefined, fallbackRole: Role): Promise<AppSession> {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  let profile: ProfileRow | null = null;

  if (isSupabaseConfigured && user?.id) {
    const result = await supabase!
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
  const [studentHomeCards, setStudentHomeCards] = useState<StudentHomeCard[]>([]);
  const [materialDownloadLogs, setMaterialDownloadLogs] = useState<MaterialDownloadLog[]>([]);
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [classroomPeers, setClassroomPeers] = useState<StudentRecord[]>([]);
  const [assignments, setAssignments] = useState<ScoreAssignment[]>([]);
  const [scoreEntries, setScoreEntries] = useState<ScoreEntry[]>([]);
  const [scoreAutoSaveStates, setScoreAutoSaveStates] = useState<Record<string, ScoreAutoSaveStatus>>({});
  const [submissionItems, setSubmissionItems] = useState<SubmissionRecord[]>([]);
  const scoreAutoSaveTimers = useRef(new Map<string, number>());
  const scoreAutoSaveVersions = useRef(new Map<string, number>());
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
  const activeAssignments = orderAssignments(session?.role === "teacher"
    ? (workingClassroom ? assignments.filter((assignment) => belongsToClass(assignment, workingClassroom)) : [])
    : studentScopedItems(assignments, workingClassroom, currentStudent, session));
  const studentGradeLevel = session?.role === "student" ? gradeLevelFromText(currentStudent?.className, session.room) : undefined;
  const activeMaterials = session?.role === "student"
    ? (studentGradeLevel ? materialItems.filter((material) => gradeLevelFromText(material.level) === studentGradeLevel) : [])
    : materialItems;
  const activeSubmissions = session?.role === "teacher"
    ? (workingClassroom ? submissionItems.filter((submission) => belongsToClass(submission, workingClassroom)) : [])
    : submissionItems.filter((submission) => submission.studentId === session?.studentCode || submission.groupMemberCodes.includes(session?.studentCode || ""));
  const activeAnnouncements = workingClassroom ? announcementItems.filter((item) => belongsToClass(item, workingClassroom)) : [];
  const activeStudentHomeCards = session?.role === "teacher"
    ? studentHomeCards
    : studentHomeCards.filter((card) => card.isActive && (!card.classroomIds.length || Boolean(workingClassroom && card.classroomIds.includes(workingClassroom.id))));
  const activeDownloadLogs = session?.role === "teacher" ? materialDownloadLogs : materialDownloadLogs.filter((item) => item.studentId === session?.studentCode);
  const activeScoreSaveStates = activeAssignments.flatMap((assignment) => activeStudents.map((student) => scoreAutoSaveStates[scoreEntryKey(assignment.id, student.id)])).filter(Boolean);
  const scoreAutoSaveStatus: ScoreAutoSaveStatus = activeScoreSaveStates.includes("error") ? "error" : activeScoreSaveStates.includes("saving") ? "saving" : activeScoreSaveStates.includes("pending") ? "pending" : activeScoreSaveStates.includes("saved") ? "saved" : "idle";

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("classroom-theme", theme);
  }, [theme]);

  useEffect(() => () => {
    scoreAutoSaveTimers.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  async function loadClassroomData(showToast = false) {
    setLoadingData(true);
    if (!isSupabaseConfigured) {
      setLoadingData(false);
      if (showToast) flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return;
    }
    try {
      const client = supabase!;
      const [classroomsResult, materialsResult, announcementsResult, homeCardsResult, downloadLogsResult, studentsResult, assignmentsResult, entriesResult, submissionsResult] = await Promise.all([
        client.from("classrooms").select("*").order("created_at", { ascending: false }),
        client.from("materials").select("*").order("published_at", { ascending: false }),
        client.from("announcements").select("*").order("published_at", { ascending: false }),
        client.from("student_home_cards").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        client.from("material_download_logs").select("*").order("downloaded_at", { ascending: false }),
        client.from("students").select("*").order("student_no", { ascending: true }),
        client.from("score_assignments").select("*").order("created_at", { ascending: true }),
        fetchAllScoreEntryRows(),
        client.from("submissions").select("*").order("submitted_at", { ascending: false })
      ]);

      const errors = [classroomsResult, materialsResult, announcementsResult, homeCardsResult, downloadLogsResult, studentsResult, assignmentsResult, entriesResult, submissionsResult].filter((result) => result.error);
      if (errors.length) flash("บางตารางใน Supabase ยังไม่พร้อม กรุณาตรวจ schema แล้วลองโหลดใหม่");

      const nextClassrooms = (classroomsResult.data ?? []).map(mapClassroomRow).sort(sortClassrooms);
      setClassroomItems(nextClassrooms);
      setSelectedClassroomId((current) => {
        if (current && nextClassrooms.some((item) => item.id === current)) return current;
        if (session?.role === "student") {
          const studentRoom = String(session.room || "");
          return nextClassrooms.find((item) => item.displayName === studentRoom)?.id || nextClassrooms[0]?.id || "";
        }
        return nextClassrooms[0]?.id || "";
      });
      setMaterialItems((materialsResult.data ?? []).filter((row) => row.file_path).map(mapMaterialRow));
      setAnnouncementItems((announcementsResult.data ?? []).map(mapAnnouncementRow));
      setStudentHomeCards((homeCardsResult.data ?? []).map(mapStudentHomeCardRow));
      setMaterialDownloadLogs((downloadLogsResult.data ?? []).map(mapMaterialDownloadLogRow));
      setStudents((studentsResult.data ?? []).map(mapStudentRow));
      if (session?.role === "student") {
        const peersResult = await client.rpc("get_classroom_peers");
        if (peersResult.error) {
          setClassroomPeers([]);
          flash("ยังโหลดรายชื่อเพื่อนในห้องไม่ได้ กรุณาตรวจ schema ล่าสุด");
        } else {
          setClassroomPeers((peersResult.data ?? []).map(mapStudentRow));
        }
      } else {
        setClassroomPeers([]);
      }
      setAssignments((assignmentsResult.data ?? []).map(mapAssignmentRow));
      setScoreEntries((entriesResult.data ?? []).map(mapScoreEntryRow));
      setSubmissionItems((submissionsResult.data ?? []).map(mapSubmissionRow).filter((item) => !isLegacyDemoSubmission(item)));
      if (showToast && errors.length === 0) flash("โหลดข้อมูลล่าสุดจาก Supabase แล้ว");
    } catch (error) {
      flash(userFacingError(error, "โหลดข้อมูลจาก Supabase ไม่สำเร็จ"));
    } finally {
      setLoadingData(false);
    }
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
    try {
      const { data, error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const nextSession = data.user ? await resolveAppSession(data.user, role) : sessions[role];
      setRole(nextSession.role);
      setSession(nextSession);
      setView("home");
    } catch (error) {
      flash(userFacingError(error, "เข้าสู่ระบบไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset(identifier: string) {
    const email = normalizeLoginIdentifier(identifier, role);
    if (!identifier.includes("@")) return flash(role === "student" ? "นักเรียนเข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านได้ในหน้าโปรไฟล์ หรือให้ครูรีเซ็ตรหัสให้" : "กรอกอีเมลก่อน แล้วกดลืมรหัสผ่านอีกครั้ง");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const resetUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: resetUrl });
      if (error) throw error;
      flash(`ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${email} แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ส่งลิงก์รีเซ็ตรหัสผ่านไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
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
    try {
      const { error } = await supabase!.auth.updateUser({ password: newPassword.trim() });
      if (error) throw error;
      flash("เปลี่ยนรหัสผ่านเรียบร้อย");
    } catch (error) {
      flash(userFacingError(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadMaterial({ file, title, unit, level, type }: MaterialUpload) {
    if (!title.trim()) return flashAndFail("กรุณาใส่ชื่อสื่อการสอน", flash);
    if (!file) return flashAndFail("กรุณาเลือกไฟล์สื่อการสอน", flash);
    const fileError = validateMaterialFile(file, type);
    if (fileError) return flashAndFail(fileError, flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    const levelNumber = level.match(/[1-6]/)?.[0] || "all";
    const storagePath = `materials/m${levelNumber}/${Date.now()}-${storageSafeFileName(file.name)}`;
    const client = supabase!;
    setBusy(true);
    try {
      const upload = await client.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
        contentType: file.type || mimeForMaterial(file.name, type),
        upsert: false
      });
      if (upload.error) throw upload.error;

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
      if (insert.error) {
        await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw insert.error;
      }

      setMaterialItems((current) => [mapMaterialRow(insert.data), ...current]);
      flash(`อัปโหลดสื่อ ${title.trim()} เรียบร้อย`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "อัปโหลดสื่อการสอนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteMaterial(item: Material) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const client = supabase!;
      const result = await client.from("materials").delete().eq("id", item.id);
      if (result.error) throw result.error;
      const removed = item.filePath ? await client.storage.from(STORAGE_BUCKET).remove([item.filePath]) : null;
      setMaterialItems((current) => current.filter((material) => material.id !== item.id));
      flash(removed?.error ? "ลบข้อมูลสื่อแล้ว แต่ลบไฟล์แนบไม่สำเร็จ" : `ลบสื่อ "${item.title}" แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ลบสื่อการสอนไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function openMaterial(item: Material) {
    if (!item.filePath) return flash("สื่อนี้ยังไม่มีไฟล์แนบ จึงเปิดไม่ได้");
    if (isSupabaseConfigured) {
      const { data, error } = await supabase!.storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
      if (error || !data?.signedUrl) return flash(error?.message || "เปิดไฟล์ไม่ได้");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return flash(`เปิดไฟล์ ${item.title} ในแท็บใหม่`);
    }
    flash("ระบบยังไม่ได้เชื่อมต่อ Supabase จึงยังเปิดไฟล์ไม่ได้");
  }

  async function openSubmissionFile(item: SubmissionRecord) {
    if (item.linkUrl) {
      window.open(item.linkUrl, "_blank", "noopener,noreferrer");
      return flash(`เปิดลิงก์งาน ${item.assignmentTitle} ในแท็บใหม่`);
    }
    if (!item.filePath) return flash("งานนี้ยังไม่มีไฟล์หรือลิงก์แนบ");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase จึงยังเปิดไฟล์ไม่ได้");
    const { data, error } = await supabase!.storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
    if (error || !data?.signedUrl) return flash(error?.message || "เปิดไฟล์งานไม่ได้");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    flash(`เปิดไฟล์งาน ${item.assignmentTitle} ในแท็บใหม่`);
  }

  async function addAnnouncement(draft: AnnouncementDraft) {
    const targetClassroom = classroomItems.find((classroom) => classroom.id === draft.classroomId);
    if (!targetClassroom) return flashAndFail("เลือกห้องเรียนก่อนประกาศ", flash);
    if (!draft.title.trim()) return flashAndFail("กรอกหัวข้อประกาศก่อน", flash);
    if (!draft.body.trim()) return flashAndFail("กรอกรายละเอียดประกาศก่อน", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    const payload = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      class_name: targetClassroom.displayName,
      classroom_id: targetClassroom.id
    };
    setBusy(true);
    try {
      const result = await supabase!.from("announcements").insert(payload).select("*").single();
      if (result.error) throw result.error;
      setAnnouncementItems((current) => [mapAnnouncementRow(result.data), ...current]);
      flash(`ประกาศสำหรับ ${targetClassroom.displayName} ถูกเผยแพร่แล้ว`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "เผยแพร่ประกาศไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnnouncement(item: Announcement) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const result = await supabase!.from("announcements").delete().eq("id", item.id);
      if (result.error) throw result.error;
      setAnnouncementItems((current) => current.filter((entry) => entry.id !== item.id));
      flash(`ลบประกาศ "${item.title}" แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ลบประกาศไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function saveStudentHomeCard(draft: StudentHomeCardDraft, editingId?: string) {
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (!title) return flashAndFail("กรอกชื่อการ์ดก่อน", flash);
    if (title.length > 80) return flashAndFail("ชื่อการ์ดต้องไม่เกิน 80 ตัวอักษร", flash);
    if (description.length > 240) return flashAndFail("คำอธิบายต้องไม่เกิน 240 ตัวอักษร", flash);
    const normalized = normalizeExternalUrl(draft.url);
    if (normalized.error) return flashAndFail(normalized.error, flash);
    const classroomIds = draft.showToAll ? [] : [...new Set(draft.classroomIds)];
    if (!draft.showToAll && !classroomIds.length) return flashAndFail("เลือกห้องเรียนอย่างน้อย 1 ห้อง หรือเลือกแสดงทุกห้อง", flash);
    if (classroomIds.some((id) => !classroomItems.some((classroom) => classroom.id === id))) return flashAndFail("พบห้องเรียนที่ไม่ถูกต้อง กรุณาเลือกใหม่", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);

    const payload = {
      title,
      description,
      url: normalized.url,
      classroom_ids: classroomIds,
      updated_at: new Date().toISOString()
    };
    setBusy(true);
    try {
      if (editingId) {
        const result = await supabase!.from("student_home_cards").update(payload).eq("id", editingId).select("*").single();
        if (result.error) throw result.error;
        const updated = mapStudentHomeCardRow(result.data);
        setStudentHomeCards((current) => current.map((card) => card.id === editingId ? updated : card));
        flash(`บันทึกการ์ด "${title}" แล้ว`);
      } else {
        const result = await supabase!.from("student_home_cards").insert({
          ...payload,
          sort_order: studentHomeCards.reduce((highest, card) => Math.max(highest, card.sortOrder), -1) + 1
        }).select("*").single();
        if (result.error) throw result.error;
        setStudentHomeCards((current) => [...current, mapStudentHomeCardRow(result.data)]);
        flash(`เพิ่มการ์ด "${title}" บนหน้าแรกนักเรียนแล้ว`);
      }
      return true;
    } catch (error) {
      flash(userFacingError(error, editingId ? "แก้ไขการ์ดไม่สำเร็จ" : "เพิ่มการ์ดไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleStudentHomeCard(card: StudentHomeCard) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const result = await supabase!.from("student_home_cards").update({ is_active: !card.isActive, updated_at: new Date().toISOString() }).eq("id", card.id).select("*").single();
      if (result.error) throw result.error;
      const updated = mapStudentHomeCardRow(result.data);
      setStudentHomeCards((current) => current.map((item) => item.id === card.id ? updated : item));
      flash(`${updated.isActive ? "เปิด" : "ซ่อน"}การ์ด "${updated.title}" แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "เปลี่ยนสถานะการ์ดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudentHomeCard(card: StudentHomeCard) {
    if (!window.confirm(`ลบการ์ด "${card.title}" ออกจากหน้าแรกนักเรียนหรือไม่`)) return;
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const result = await supabase!.from("student_home_cards").delete().eq("id", card.id);
      if (result.error) throw result.error;
      setStudentHomeCards((current) => current.filter((item) => item.id !== card.id));
      flash(`ลบการ์ด "${card.title}" แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ลบการ์ดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function moveStudentHomeCard(card: StudentHomeCard, direction: -1 | 1) {
    const ordered = orderStudentHomeCards(studentHomeCards);
    const currentIndex = ordered.findIndex((item) => item.id === card.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length || !isSupabaseConfigured) return;
    const target = ordered[targetIndex];
    setBusy(true);
    try {
      const [currentResult, targetResult] = await Promise.all([
        supabase!.from("student_home_cards").update({ sort_order: target.sortOrder, updated_at: new Date().toISOString() }).eq("id", card.id),
        supabase!.from("student_home_cards").update({ sort_order: card.sortOrder, updated_at: new Date().toISOString() }).eq("id", target.id)
      ]);
      if (currentResult.error || targetResult.error) throw currentResult.error || targetResult.error;
      setStudentHomeCards((current) => current.map((item) => {
        if (item.id === card.id) return { ...item, sortOrder: target.sortOrder };
        if (item.id === target.id) return { ...item, sortOrder: card.sortOrder };
        return item;
      }));
    } catch (error) {
      await loadClassroomData();
      flash(userFacingError(error, "เปลี่ยนลำดับการ์ดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
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
    try {
      const email = normalizeLoginIdentifier(studentCode, "student");
      const auth = await authClient.auth.signInWithPassword({ email, password });
      if (auth.error || !auth.data.user) throw auth.error || new Error("ตรวจสอบตัวตนไม่สำเร็จ");

      const verifiedStudentId = String(auth.data.user.user_metadata?.student_code || studentCodeFromEmail(auth.data.user.email) || studentCode).trim();
      const studentResult = await authClient.from("students").select("*").eq("student_code", verifiedStudentId).maybeSingle();
      if (studentResult.error || !studentResult.data) throw studentResult.error || new Error("ไม่พบรายชื่อนักเรียนที่เชื่อมกับบัญชีนี้");
      const linkedStudent = mapStudentRow(studentResult.data);

      const { data, error } = await authClient.storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
      if (error || !data?.signedUrl) throw error || new Error("สร้างลิงก์ดาวน์โหลดไม่สำเร็จ");

      const logResult = await authClient.from("material_download_logs").insert({
        material_id: item.id,
        material_title: item.title,
        student_code: verifiedStudentId,
        student_name: linkedStudent.name,
        class_name: linkedStudent.className,
        classroom_id: linkedStudent.classroomId || null
      }).select("*").single();
      if (logResult.error) throw logResult.error;

      setMaterialDownloadLogs((current) => [mapMaterialDownloadLogRow(logResult.data), ...current]);
      await triggerFileDownload(data.signedUrl, item);
      flash(`บันทึกการดาวน์โหลด ${item.title} แล้ว หากไฟล์ยังไม่ขึ้นให้ดูที่แถบดาวน์โหลดของเบราว์เซอร์`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "ดาวน์โหลดสื่อไม่สำเร็จ"));
      return false;
    } finally {
      await authClient.auth.signOut();
      setBusy(false);
    }
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
    try {
      const result = await supabase!.from("classrooms").insert(payload).select("*").single();
      if (result.error) throw result.error;
      const nextClassroom = mapClassroomRow(result.data);
      setClassroomItems((current) => [...current, nextClassroom].sort(sortClassrooms));
      setSelectedClassroomId(nextClassroom.id);
      flash(`เพิ่มห้องเรียน ${displayName} แล้ว`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "เพิ่มห้องเรียนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteClassroom(classroom: Classroom) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const client = supabase!;
      const results = await Promise.all([
        client.from("announcements").delete().eq("classroom_id", classroom.id),
        client.from("material_download_logs").delete().eq("classroom_id", classroom.id),
        client.from("materials").delete().eq("classroom_id", classroom.id),
        client.from("score_assignments").delete().eq("classroom_id", classroom.id),
        client.from("students").delete().eq("classroom_id", classroom.id),
        client.from("submissions").delete().eq("classroom_id", classroom.id)
      ]);
      const relatedError = results.find((result) => result.error)?.error;
      if (relatedError) throw relatedError;
      const result = await client.from("classrooms").delete().eq("id", classroom.id);
      if (result.error) throw result.error;
      await loadClassroomData();
      flash(`ลบห้องเรียน ${classroom.displayName} แล้ว`);
    } catch (error) {
      await loadClassroomData();
      flash(userFacingError(error, "ลบห้องเรียนไม่สำเร็จ กรุณาตรวจข้อมูลอีกครั้ง"));
    } finally {
      setBusy(false);
    }
  }

  async function addStudent(draft: StudentDraft) {
    if (!selectedClassroom) return flashAndFail("เพิ่มหรือเลือกห้องเรียนก่อนเพิ่มรายชื่อ", flash);
    const codeError = validateStudentCode(draft.studentId);
    if (codeError) return flashAndFail(codeError, flash);
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
    try {
      const result = await supabase!.from("students").insert(payload).select("*").single();
      if (result.error) throw result.error;
      setStudents((current) => [...current, mapStudentRow(result.data)].sort(sortStudents));
      flash(`เพิ่มรายชื่อ ${draft.name.trim()} แล้ว`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "เพิ่มรายชื่อนักเรียนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createStudentAccount(student: StudentRecord, password: string, options?: { silent?: boolean }) {
    if (!isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }
    const codeError = validateStudentCode(student.studentId);
    if (codeError) {
      flash(codeError);
      return false;
    }
    const initialPassword = password.trim() || defaultStudentPassword(student.studentId);
    const passwordError = validateStudentPassword(initialPassword);
    if (passwordError) {
      flash(passwordError);
      return false;
    }
    setBusy(true);
    try {
      const payload = await createOrResetStudentAccount(student, initialPassword);
      const authEmail = payload.email || studentCodeToEmail(student.studentId);
      const accountCreatedAt = payload.accountCreatedAt || new Date().toISOString();
      setStudents((current) => current.map((item) => item.id === student.id ? { ...item, authEmail, accountCreatedAt } : item));
      if (!options?.silent) flash(`${payload.message || "บันทึกบัญชีนักเรียนแล้ว"} รหัสผ่านเริ่มต้น: ${initialPassword}`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "สร้างบัญชีนักเรียนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
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
    try {
      const result = await supabase!.from("students").delete().in("id", ids);
      if (result.error) throw result.error;
      setStudents((current) => current.filter((item) => !idSet.has(item.id)));
      setScoreEntries((current) => current.filter((item) => !idSet.has(item.studentRecordId)));
      flash(targetStudents.length === 1 ? `ลบรายชื่อ ${targetStudents[0].name} แล้ว` : `ลบรายชื่อ ${targetStudents.length} คนแล้ว`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "ลบรายชื่อนักเรียนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
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
    const fileError = validateRosterFile(file);
    if (fileError) {
      flash(fileError);
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

    const client = supabase!;
    const storagePath = `rosters/${selectedClassroom.id}/${Date.now()}-${storageSafeFileName(file.name)}`;
    setBusy(true);
    try {
      const upload = await client.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      });
      if (upload.error) throw upload.error;

      const payload = rosterStudents.map((student) => ({
        student_no: student.no,
        student_code: student.studentId.trim(),
        full_name: student.name.trim(),
        gender: student.gender.trim(),
        class_name: selectedClassroom.displayName,
        classroom_id: selectedClassroom.id
      }));
      const invalidStudent = payload.find((student) => validateStudentCode(student.student_code));
      if (invalidStudent) throw new Error(`รหัสนักเรียน ${invalidStudent.student_code || "ว่าง"} ไม่ถูกต้อง`);

      const uploadRecord = await client.from("student_roster_uploads").insert({ class_name: selectedClassroom.displayName, classroom_id: selectedClassroom.id, file_path: storagePath, file_name: file.name, file_size: file.size }).select("id").single();
      if (uploadRecord.error) {
        await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw uploadRecord.error;
      }
      const upsertStudents = await client.from("students").upsert(payload, { onConflict: "student_code" });
      if (upsertStudents.error) {
        await client.from("student_roster_uploads").delete().eq("id", uploadRecord.data.id);
        await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw upsertStudents.error;
      }

      await loadClassroomData();
      flash(`นำเข้ารายชื่อ ${rosterStudents.length} คนจาก ${file.name} แล้ว พร้อมใช้งาน`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "นำเข้ารายชื่อนักเรียนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addAssignment(draft: AssignmentDraft) {
    if (!draft.classroomIds.length) return flashAndFail("เลือกห้องเรียนอย่างน้อย 1 ห้องก่อนสร้างงานคะแนน", flash);
    if (!draft.title.trim()) return flashAndFail("กรอกชื่องานหรือแบบประเมินก่อน", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    const rawMax = Number(draft.rawMax);
    const finalMax = Number(draft.finalMax);
    if (!Number.isFinite(rawMax) || rawMax <= 0) return flashAndFail("คะแนนเต็มดิบต้องมากกว่า 0", flash);
    if (!Number.isFinite(finalMax) || finalMax <= 0) return flashAndFail("คะแนนเก็บเต็มต้องมากกว่า 0", flash);
    const targetClassrooms = classroomItems.filter((classroom) => draft.classroomIds.includes(classroom.id));
    if (!targetClassrooms.length) return flashAndFail("ไม่พบห้องเรียนที่เลือก กรุณาเลือกใหม่", flash);
    const assignmentGroupId = crypto.randomUUID();
    const payload = targetClassrooms.map((classroom) => ({ assignment_group_id: assignmentGroupId, title: draft.title.trim(), class_name: classroom.displayName, classroom_id: classroom.id, raw_max: rawMax, final_max: finalMax }));
    setBusy(true);
    try {
      const result = await supabase!.from("score_assignments").insert(payload).select("*");
      if (result.error) throw result.error;
      const createdAssignments = (result.data ?? []).map(mapAssignmentRow);
      setAssignments((current) => [...current, ...createdAssignments]);
      flash(`เพิ่มงานคะแนน "${draft.title.trim()}" ให้ ${createdAssignments.length} ห้องแล้ว`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "เพิ่มงานคะแนนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function updateAssignmentDetails(targetAssignments: ScoreAssignment[], draft: AssignmentDraft) {
    const title = draft.title.trim();
    const rawMax = Number(draft.rawMax);
    const finalMax = Number(draft.finalMax);
    if (!targetAssignments.length) return flashAndFail("เลือกห้องเรียนที่ต้องการแก้ไขอย่างน้อย 1 ห้อง", flash);
    if (!title) return flashAndFail("กรอกชื่องานหรือแบบประเมินก่อน", flash);
    if (!Number.isFinite(rawMax) || rawMax <= 0) return flashAndFail("คะแนนเต็มดิบต้องมากกว่า 0", flash);
    if (!Number.isFinite(finalMax) || finalMax <= 0) return flashAndFail("คะแนนเก็บเต็มต้องมากกว่า 0", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);

    const assignmentIds = new Set(targetAssignments.map((assignment) => assignment.id));
    const assignmentGroupId = targetAssignments[0]?.assignmentGroupId;
    if (!assignmentGroupId || targetAssignments.some((assignment) => assignment.assignmentGroupId !== assignmentGroupId)) {
      return flashAndFail("ระบบจัดกลุ่มงานยังไม่พร้อม กรุณารัน SQL เวอร์ชันล่าสุดใน Supabase", flash);
    }
    const relatedEntries = scoreEntries.filter((entry) => assignmentIds.has(entry.assignmentId));
    const relatedSubmissions = submissionItems.filter((item) => item.assignmentId && assignmentIds.has(item.assignmentId));
    const highestRecordedScore = Math.max(0, ...relatedEntries.map((entry) => entry.rawScore), ...relatedSubmissions.map((item) => item.rawScore));
    if (rawMax < highestRecordedScore) {
      return flashAndFail(`คะแนนเต็มดิบต้องไม่น้อยกว่า ${formatScore(highestRecordedScore)} ซึ่งเป็นคะแนนสูงสุดที่บันทึกไว้`, flash);
    }

    setBusy(true);
    try {
      const assignmentResult = await supabase!.rpc("update_score_assignment_group", {
        p_assignment_group_id: assignmentGroupId,
        p_classroom_ids: targetAssignments.map((assignment) => assignment.classroomId!),
        p_title: title,
        p_raw_max: rawMax,
        p_final_max: finalMax
      });
      if (assignmentResult.error) throw assignmentResult.error;

      const assignmentRows = Array.isArray(assignmentResult.data) ? assignmentResult.data as Record<string, unknown>[] : [];
      const updatedAssignments: ScoreAssignment[] = assignmentRows.map(mapAssignmentRow);
      const updatedById = new Map<string, ScoreAssignment>(updatedAssignments.map((assignment) => [assignment.id, assignment]));
      setAssignments((current) => current.map((item) => updatedById.get(item.id) ?? item));
      setScoreEntries((current) => current.map((entry) => assignmentIds.has(entry.assignmentId) ? {
        ...entry,
        rawMax,
        finalScore: scaledScore(entry.rawScore, rawMax, finalMax),
        finalMax
      } : entry));
      setSubmissionItems((current) => current.map((item) => item.assignmentId && assignmentIds.has(item.assignmentId) ? {
        ...item,
        assignmentTitle: title,
        rawMax,
        finalScore: scaledScore(item.rawScore, rawMax, finalMax),
        finalMax
      } : item));
      flash(`บันทึกการแก้ไข "${title}" ให้ ${targetAssignments.length} ห้องแล้ว`);
      return true;
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
      if (message.includes("RAW_MAX_BELOW_RECORDED_SCORE")) {
        const messageParts = message.split(":");
        const recordedScore = messageParts[messageParts.length - 1]?.trim();
        flash(`คะแนนเต็มดิบต้องไม่น้อยกว่า ${recordedScore || "คะแนนสูงสุดที่บันทึกไว้"}`);
      } else if (message.includes("update_score_assignment_group") || message.includes("schema cache")) {
        flash("ระบบแก้ไขคะแนนแบบปลอดภัยยังไม่พร้อม กรุณารัน SQL เวอร์ชันล่าสุดใน Supabase");
      } else {
        flash(userFacingError(error, "แก้ไขงานคะแนนไม่สำเร็จ ระบบไม่ได้เปลี่ยนข้อมูลใด ๆ"));
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteMaterialDownloadLog(log: MaterialDownloadLog) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const result = await supabase!.from("material_download_logs").delete().eq("id", log.id);
      if (result.error) throw result.error;
      setMaterialDownloadLogs((current) => current.filter((item) => item.id !== log.id));
      flash(`ลบประวัติการดาวน์โหลดของ ${log.studentName} แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ลบประวัติการดาวน์โหลดไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssignment(assignment: ScoreAssignment) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const result = await supabase!.from("score_assignments").delete().eq("id", assignment.id);
      if (result.error) throw result.error;
      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
      setScoreEntries((current) => current.filter((item) => item.assignmentId !== assignment.id));
      flash(`ลบงานคะแนน "${assignment.title}" แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ลบงานคะแนนไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function moveAssignment(assignment: ScoreAssignment, direction: -1 | 1) {
    const ordered = orderAssignments(activeAssignments);
    const currentIndex = ordered.findIndex((item) => item.id === assignment.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    const target = ordered[targetIndex];
    setBusy(true);
    try {
      const [currentResult, targetResult] = await Promise.all([
        supabase!.from("score_assignments").update({ created_at: target.createdAt }).eq("id", assignment.id),
        supabase!.from("score_assignments").update({ created_at: assignment.createdAt }).eq("id", target.id)
      ]);
      if (currentResult.error || targetResult.error) throw currentResult.error || targetResult.error;
      setAssignments((current) => current.map((item) => {
        if (item.id === assignment.id) return { ...item, createdAt: target.createdAt };
        if (item.id === target.id) return { ...item, createdAt: assignment.createdAt };
        return item;
      }));
      flash(`ย้าย "${assignment.title}" ${direction < 0 ? "ก่อนหน้า" : "ถัดไป"}แล้ว`);
    } catch (error) {
      await loadClassroomData();
      flash(userFacingError(error, "เปลี่ยนลำดับงานไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  function setScoreAutoSaveState(key: string, status: ScoreAutoSaveStatus) {
    setScoreAutoSaveStates((current) => {
      if (status === "idle") {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: status };
    });
  }

  function cancelScoreAutoSaves(keys: Set<string>) {
    keys.forEach((key) => {
      const timer = scoreAutoSaveTimers.current.get(key);
      if (timer) window.clearTimeout(timer);
      scoreAutoSaveTimers.current.delete(key);
      scoreAutoSaveVersions.current.set(key, (scoreAutoSaveVersions.current.get(key) ?? 0) + 1);
    });
    setScoreAutoSaveStates((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.has(key))));
  }

  async function autoSaveScoreEntry(assignment: ScoreAssignment, student: StudentRecord, rawScore: number, status: ScoreEntryStatus, key: string, version: number) {
    scoreAutoSaveTimers.current.delete(key);
    if (!isSupabaseConfigured) {
      if (scoreAutoSaveVersions.current.get(key) === version) setScoreAutoSaveState(key, "error");
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase จึงบันทึกคะแนนอัตโนมัติไม่ได้");
      return;
    }
    setScoreAutoSaveState(key, "saving");
    try {
      const result = await supabase!.from("score_entries").upsert({
        assignment_id: assignment.id,
        student_id: student.id,
        student_code: student.studentId,
        score_status: status,
        raw_score: rawScore,
        raw_max: assignment.rawMax,
        final_score: status === "scored" ? scaledScore(rawScore, assignment.rawMax, assignment.finalMax) : 0,
        final_max: assignment.finalMax
      }, { onConflict: "assignment_id,student_id" }).select("*").single();
      if (result.error) throw result.error;
      if (scoreAutoSaveVersions.current.get(key) !== version) return;
      const savedEntry = mapScoreEntryRow(result.data);
      setScoreEntries((current) => {
        const exists = current.some((entry) => entry.assignmentId === assignment.id && entry.studentRecordId === student.id);
        return exists ? current.map((entry) => entry.assignmentId === assignment.id && entry.studentRecordId === student.id ? savedEntry : entry) : [...current, savedEntry];
      });
      setScoreAutoSaveState(key, "saved");
      const timer = window.setTimeout(() => {
        if (scoreAutoSaveVersions.current.get(key) === version) setScoreAutoSaveState(key, "idle");
        scoreAutoSaveTimers.current.delete(key);
      }, 2200);
      scoreAutoSaveTimers.current.set(key, timer);
    } catch (error) {
      if (scoreAutoSaveVersions.current.get(key) !== version) return;
      setScoreAutoSaveState(key, "error");
      flash(userFacingError(error, `บันทึกคะแนนของ ${student.name} ไม่สำเร็จ`));
    }
  }

  function setScoreEntryDraft(assignment: ScoreAssignment, student: StudentRecord, rawScore: number, status: ScoreEntryStatus) {
    const nextEntry = buildScoreEntry(assignment, student, rawScore, status);
    setScoreEntries((current) => {
      const exists = current.some((entry) => entry.assignmentId === assignment.id && entry.studentRecordId === student.id);
      const next = exists
        ? current.map((entry) => entry.assignmentId === assignment.id && entry.studentRecordId === student.id ? { ...entry, ...nextEntry, id: entry.id } : entry)
        : [...current, nextEntry];
      return next;
    });
  }

  function queueScoreAutoSave(assignment: ScoreAssignment, student: StudentRecord, rawScore: number, status: ScoreEntryStatus) {
    const key = scoreEntryKey(assignment.id, student.id);
    const version = (scoreAutoSaveVersions.current.get(key) ?? 0) + 1;
    scoreAutoSaveVersions.current.set(key, version);
    const currentTimer = scoreAutoSaveTimers.current.get(key);
    if (currentTimer) window.clearTimeout(currentTimer);
    setScoreAutoSaveState(key, "pending");
    const timer = window.setTimeout(() => void autoSaveScoreEntry(assignment, student, rawScore, status, key, version), 900);
    scoreAutoSaveTimers.current.set(key, timer);
  }

  function updateScoreDraft(assignment: ScoreAssignment, student: StudentRecord, value: string) {
    const rawScore = clampScore(value, assignment.rawMax);
    setScoreEntryDraft(assignment, student, rawScore, "scored");
    queueScoreAutoSave(assignment, student, rawScore, "scored");
  }

  function updateScoreStatus(assignment: ScoreAssignment, student: StudentRecord, status: ScoreEntryStatus) {
    const currentEntry = findScoreEntry(scoreEntries, assignment.id, student.id);
    const rawScore = status === "scored" ? currentEntry?.rawScore ?? 0 : 0;
    setScoreEntryDraft(assignment, student, rawScore, status);
    queueScoreAutoSave(assignment, student, rawScore, status);
  }

  async function saveScoreSheet(assignment: ScoreAssignment) {
    if (!activeStudents.length) return flash("ยังไม่มีรายชื่อนักเรียนในห้องนี้");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    cancelScoreAutoSaves(new Set(activeStudents.map((student) => scoreEntryKey(assignment.id, student.id))));
    const payload = activeStudents.map((student) => {
      const entry = findScoreEntry(scoreEntries, assignment.id, student.id);
      const rawScore = entry?.rawScore ?? 0;
      return {
        assignment_id: assignment.id,
        student_id: student.id,
        student_code: student.studentId,
        score_status: entry?.status ?? "ungraded",
        raw_score: rawScore,
        raw_max: assignment.rawMax,
        final_score: entry?.status === "scored" ? scaledScore(rawScore, assignment.rawMax, assignment.finalMax) : 0,
        final_max: assignment.finalMax
      };
    });
    setBusy(true);
    try {
      const result = await supabase!.from("score_entries").upsert(payload, { onConflict: "assignment_id,student_id" });
      if (result.error) throw result.error;
      await loadClassroomData();
      flash(`บันทึกคะแนน "${assignment.title}" แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "บันทึกคะแนนไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function saveAllScoreSheets() {
    if (!activeStudents.length) return flash("ยังไม่มีรายชื่อนักเรียนในห้องนี้");
    if (!activeAssignments.length) return flash("ยังไม่มีงานคะแนนในห้องนี้");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    cancelScoreAutoSaves(new Set(activeAssignments.flatMap((assignment) => activeStudents.map((student) => scoreEntryKey(assignment.id, student.id)))));
    const payload = activeAssignments.flatMap((assignment) => activeStudents.map((student) => {
      const entry = findScoreEntry(scoreEntries, assignment.id, student.id);
      const rawScore = entry?.rawScore ?? 0;
      return {
        assignment_id: assignment.id,
        student_id: student.id,
        student_code: student.studentId,
        score_status: entry?.status ?? "ungraded",
        raw_score: rawScore,
        raw_max: assignment.rawMax,
        final_score: entry?.status === "scored" ? scaledScore(rawScore, assignment.rawMax, assignment.finalMax) : 0,
        final_max: assignment.finalMax
      };
    }));
    setBusy(true);
    try {
      const result = await supabase!.from("score_entries").upsert(payload, { onConflict: "assignment_id,student_id" });
      if (result.error) throw result.error;
      await loadClassroomData();
      flash(`บันทึกคะแนนทั้งห้อง ${activeStudents.length} คน จำนวน ${activeAssignments.length} งานแล้ว`);
    } catch (error) {
      flash(userFacingError(error, "บันทึกคะแนนทั้งห้องไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
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
    const rawScore = Math.max(0, Math.min(item.rawMax, item.rawScore));
    const finalScore = Math.max(0, Math.min(item.finalMax, scaledScore(rawScore, item.rawMax, item.finalMax)));
    setBusy(true);
    try {
      const result = await supabase!
        .from("submissions")
        .update({ status: item.status, raw_score: rawScore, raw_max: item.rawMax, final_score: finalScore, final_max: item.finalMax })
        .eq("id", item.id);
      if (result.error) throw result.error;
      setSubmissionItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, rawScore, finalScore } : entry));
      flash(`บันทึกผลตรวจงานของ ${item.studentName} แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "บันทึกผลตรวจงานไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSubmissionRecord(item: SubmissionRecord) {
    if (!window.confirm(`ลบรายการส่งงาน "${item.assignmentTitle}" ของ ${item.studentName}${item.filePath ? " พร้อมไฟล์แนบ" : ""}หรือไม่`)) return;
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const client = supabase!;
      const result = await client.from("submissions").delete().eq("id", item.id);
      if (result.error) throw result.error;
      const removed = item.filePath ? await client.storage.from(STORAGE_BUCKET).remove([item.filePath]) : null;
      setSubmissionItems((current) => current.filter((submission) => submission.id !== item.id));
      flash(removed?.error ? "ลบรายการแล้ว แต่ลบไฟล์แนบไม่สำเร็จ" : `ลบงานของ ${item.studentName} แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ลบรายการส่งงานไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function submitWork(draft: SubmissionDraft) {
    const assignment = activeAssignments.find((item) => item.id === draft.assignmentId);
    if (!assignment) return flash("เลือกงานที่คุณต้องการส่งก่อน");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    const studentCode = (currentStudent?.studentId || session?.studentCode || "").trim();
    const codeError = validateStudentCode(studentCode);
    if (codeError) return flash(codeError);
    const classroomId = assignment.classroomId || workingClassroom?.id || currentStudent?.classroomId;
    if (!classroomId) return flash("ไม่พบห้องเรียนของนักเรียน กรุณาติดต่อครู");
    const memberCodes = Array.from(new Set([studentCode, ...draft.memberCodes.map((code) => code.trim()).filter(Boolean)]));
    if (draft.submissionKind === "group" && memberCodes.length < 2) return flash("เลือกเพื่อนร่วมกลุ่มอย่างน้อย 1 คน");

    let linkUrl = "";
    if (draft.linkUrl.trim()) {
      const normalized = normalizeExternalUrl(draft.linkUrl);
      if (normalized.error) return flash(normalized.error.replace("เว็บไซต์", "งาน"));
      linkUrl = normalized.url;
    }
    if (!draft.file && !linkUrl) return flash("เลือกไฟล์หรือกรอกลิงก์งานก่อนส่ง");
    if (draft.file && linkUrl) return flash("เลือกส่งไฟล์หรือลิงก์เพียงอย่างเดียว");
    if (draft.file) {
      const fileError = validateSubmissionFile(draft.file);
      if (fileError) return flash(fileError);
    }

    const storagePath = draft.file
      ? `submissions/${safeStorageSegment(studentCode)}/${Date.now()}-${storageSafeFileName(draft.file.name)}`
      : "";
    const client = supabase!;
    setBusy(true);
    try {
      if (draft.file) {
        const upload = await client.storage.from(STORAGE_BUCKET).upload(storagePath, draft.file, {
          contentType: draft.file.type || "application/octet-stream",
          upsert: false
        });
        if (upload.error) throw upload.error;
      }

      const result = await client.rpc("submit_assignment_work", {
        p_assignment_id: assignment.id,
        p_file_path: storagePath || null,
        p_link_url: linkUrl || null,
        p_member_codes: draft.submissionKind === "group" ? memberCodes : [studentCode]
      });
      if (result.error) {
        if (storagePath) await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw result.error;
      }
      const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!savedRow) throw new Error("ระบบไม่ได้คืนข้อมูลรายการส่งงาน");
      setSubmissionItems((current) => [mapSubmissionRow(savedRow), ...current]);
      flash(`ส่ง${draft.submissionKind === "group" ? "งานกลุ่ม" : "งาน"}เรียบร้อย`);
    } catch (error) {
      flash(userFacingError(error, "ส่งงานไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  }

  if (!session) {
    return <Auth role={role} theme={theme} busy={busy} onRole={setRole} onTheme={() => setTheme((current) => current === "light" ? "dark" : "light")} onLogin={login} onResetPassword={requestPasswordReset} toast={toast} />;
  }

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <div className="side-brand">
          <img className="side-logo" src={SCHOOL_LOGO} alt="โลโก้โรงเรียน" />
          <div>
            <strong>ห้องเรียนสังคมครูไต๋</strong>
            {session.role === "student" && <small>{session.name}</small>}
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
                {session.role === "student" && <small>{session.name}</small>}
              </div>
            </div>
            <p className="eyebrow">{session.role === "teacher" ? session.school : `สวัสดี ${session.name}`}</p>
            <h2>{session.role === "teacher" ? (view === "home" ? "ภาพรวมทุกห้อง" : activeClassName) : session.room}</h2>
          </div>
          <div className="top-actions">
            <button className="icon-button" title="ค้นหา" onClick={() => { setView("materials"); flash("เปิดคลังสื่อแล้ว ใช้ช่องค้นหาด้านบนได้เลย"); }}><Search aria-hidden /></button>
            <button className="icon-button" title="โหลดข้อมูลใหม่" onClick={() => void loadClassroomData(true)}><Bell aria-hidden /></button>
            <button className="theme-toggle-button" type="button" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} title="เปลี่ยนธีม">{theme === "light" ? <Moon aria-hidden /> : <Sun aria-hidden />}<span>{theme === "light" ? "โทนมืด" : "โทนสว่าง"}</span></button>
            <button className="mobile-logout-button" onClick={logout} title="ออกจากระบบ"><LogOut aria-hidden /><span>ออกจากระบบ</span></button>
          </div>
        </header>
        <section className={`content-area ${view === "scores" ? "score-content-area" : ""}`}>
          {loadingData && <div className="toast">กำลังโหลดข้อมูล...</div>}
          {view === "home" && <HomeView session={session} setView={setView} materials={session.role === "teacher" ? materialItems : activeMaterials} classrooms={classroomItems} students={session.role === "teacher" ? students : activeStudents} submissions={session.role === "teacher" ? submissionItems : activeSubmissions} assignments={session.role === "teacher" ? assignments : activeAssignments} entries={scoreEntries} announcements={session.role === "teacher" ? announcementItems : activeAnnouncements} homeCards={activeStudentHomeCards} busy={busy} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} saveHomeCard={saveStudentHomeCard} toggleHomeCard={toggleStudentHomeCard} deleteHomeCard={deleteStudentHomeCard} moveHomeCard={moveStudentHomeCard} />}
          {view === "materials" && <MaterialsView role={session.role} session={session} currentStudent={currentStudent} materials={activeMaterials} logs={activeDownloadLogs} busy={busy} flash={flash} onOpen={openMaterial} onDownload={downloadMaterial} onUpload={uploadMaterial} onDelete={deleteMaterial} onDeleteLog={deleteMaterialDownloadLog} />}
          {view === "scores" && <ScoresView role={session.role} classrooms={classroomItems} selectedClassroomId={effectiveSelectedClassroomId} onClassroomChange={setSelectedClassroomId} students={activeStudents} assignments={activeAssignments} allAssignments={orderAssignments(assignments)} entries={scoreEntries} busy={busy} scoreAutoSaveStatus={scoreAutoSaveStatus} activeClassName={activeClassName} addAssignment={addAssignment} updateAssignment={updateAssignmentDetails} deleteAssignment={deleteAssignment} moveAssignment={moveAssignment} updateScoreDraft={updateScoreDraft} updateScoreStatus={updateScoreStatus} saveScoreSheet={saveScoreSheet} saveAllScoreSheets={saveAllScoreSheets} />}
          {view === "work" && <WorkView role={session.role} classrooms={classroomItems} selectedClassroomId={effectiveSelectedClassroomId} onClassroomChange={setSelectedClassroomId} assignments={activeAssignments} submissions={activeSubmissions} classmates={classroomPeers} currentStudent={currentStudent} busy={busy} activeClassName={activeClassName} submitWork={submitWork} updateSubmission={updateSubmissionDraft} saveSubmission={saveSubmissionReview} deleteSubmission={deleteSubmissionRecord} openSubmission={openSubmissionFile} />}
          {view === "students" && <StudentsView classrooms={classroomItems} selectedClassroom={selectedClassroom} selectedClassroomId={effectiveSelectedClassroomId} students={activeStudents} busy={busy} flash={flash} addClassroom={addClassroom} deleteClassroom={deleteClassroom} selectClassroom={setSelectedClassroomId} addStudent={addStudent} deleteStudent={deleteStudent} deleteStudents={deleteStudentsBatch} uploadRosterFile={uploadRosterFile} createStudentAccount={createStudentAccount} />}
          {view === "profile" && <ProfileView session={session} busy={busy} changePassword={changePassword} />}
        </section>
      </main>
      <nav className="bottom-nav">{nav.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Auth({ role, theme, busy, toast, onRole, onTheme, onLogin, onResetPassword }: { role: Role; theme: ThemeMode; busy: boolean; toast: string; onRole: (role: Role) => void; onTheme: () => void; onLogin: (email: string, password: string) => void; onResetPassword: (email: string) => void }) {
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
      <button className="theme-toggle-button auth-theme-toggle" type="button" onClick={onTheme} title="เปลี่ยนธีม">{theme === "light" ? <Moon aria-hidden /> : <Sun aria-hidden />}<span>{theme === "light" ? "โทนมืด" : "โทนสว่าง"}</span></button>
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

function HomeView({ session, setView, materials, classrooms, students, submissions, assignments, entries, announcements, homeCards, busy, addAnnouncement, deleteAnnouncement, saveHomeCard, toggleHomeCard, deleteHomeCard, moveHomeCard }: { session: AppSession; setView: (view: ViewKey) => void; materials: Material[]; classrooms: Classroom[]; students: StudentRecord[]; submissions: SubmissionRecord[]; assignments: ScoreAssignment[]; entries: ScoreEntry[]; announcements: Announcement[]; homeCards: StudentHomeCard[]; busy: boolean; addAnnouncement: (draft: AnnouncementDraft) => Promise<boolean>; deleteAnnouncement: (item: Announcement) => void; saveHomeCard: (draft: StudentHomeCardDraft, editingId?: string) => Promise<boolean>; toggleHomeCard: (card: StudentHomeCard) => void; deleteHomeCard: (card: StudentHomeCard) => void; moveHomeCard: (card: StudentHomeCard, direction: -1 | 1) => void }) {
  const isTeacher = session.role === "teacher";
  if (!isTeacher) {
    return <div className="page-stack"><StudentHome setView={setView} materials={materials} entries={entries} students={students} announcements={announcements} homeCards={homeCards} /></div>;
  }
  const waiting = submissions.filter((item) => item.status !== "ตรวจแล้ว").length;
  const stats = [["ห้องเรียน", String(classrooms.length), "blue"], ["นักเรียนทั้งหมด", String(students.length), "green"], ["งานคะแนน", String(assignments.length), "amber"], ["งานรอตรวจ", String(waiting), "coral"], ["สื่อการสอน", String(materials.length), "blue"], ["ประกาศ", String(announcements.length), "amber"], ["การ์ดหน้าแรก", String(homeCards.length), "green"]];
  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div><p className="eyebrow">{session.school}</p><h1>เมนูหลัก</h1></div>
      </section>
      <div className="stat-grid">{stats.map(([label, value, tone]) => <article className={`stat-card tone-${tone}`} key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <TeacherHome setView={setView} classrooms={classrooms} submissions={submissions} announcements={announcements} homeCards={homeCards} busy={busy} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} saveHomeCard={saveHomeCard} toggleHomeCard={toggleHomeCard} deleteHomeCard={deleteHomeCard} moveHomeCard={moveHomeCard} />
    </div>
  );
}

function TeacherHome({ setView, classrooms, submissions, announcements, homeCards, busy, addAnnouncement, deleteAnnouncement, saveHomeCard, toggleHomeCard, deleteHomeCard, moveHomeCard }: { setView: (view: ViewKey) => void; classrooms: Classroom[]; submissions: SubmissionRecord[]; announcements: Announcement[]; homeCards: StudentHomeCard[]; busy: boolean; addAnnouncement: (draft: AnnouncementDraft) => Promise<boolean>; deleteAnnouncement: (item: Announcement) => void; saveHomeCard: (draft: StudentHomeCardDraft, editingId?: string) => Promise<boolean>; toggleHomeCard: (card: StudentHomeCard) => void; deleteHomeCard: (card: StudentHomeCard) => void; moveHomeCard: (card: StudentHomeCard, direction: -1 | 1) => void }) {
  const [draft, setDraft] = useState<AnnouncementDraft>({ title: "", body: "", classroomId: classrooms[0]?.id || "" });
  const tools = [["อัปโหลดสื่อการสอน", Upload, "materials"], ["จัดการคะแนน", BarChart3, "scores"], ["ตรวจงานนักเรียน", ClipboardCheck, "work"], ["เพิ่มรายชื่อ", FileSpreadsheet, "students"]] as const;

  async function publishAnnouncement() {
    const ok = await addAnnouncement(draft);
    if (!ok) return;
    setDraft((current) => ({ title: "", body: "", classroomId: current.classroomId }));
  }

  useEffect(() => {
    if (!draft.classroomId && classrooms[0]?.id) setDraft((current) => ({ ...current, classroomId: classrooms[0].id }));
  }, [classrooms, draft.classroomId]);

  return (
    <div className="teacher-home-layout">
      <section className="panel teacher-actions-panel">
        <SectionTitle title="งานของครู" note="ข้อมูลรวมทุกห้อง" />
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
        {classrooms.length ? (
          <>
            <SectionTitle title="เพิ่มประกาศ" note="เลือกห้องเรียนก่อนเผยแพร่" />
            <div className="form-grid announcement-compose-grid">
              <label className="field full-span">
                ห้องเรียนที่ประกาศ
                <select value={draft.classroomId} onChange={(event) => setDraft({ ...draft, classroomId: event.target.value })}>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.displayName}</option>)}</select>
              </label>
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
          <EmptyState title="ยังไม่มีห้องเรียน" body="เพิ่มห้องเรียนในเมนูรายชื่อก่อนสร้างประกาศ" />
        )}
      </section>

      <section className="panel teacher-pending-panel">
        <SectionTitle title="งานรอตรวจ" note={`${submissions.length} รายการ`} />
        {submissions.length ? <SubmissionList items={submissions.slice(0, 3)} compact /> : <EmptyState title="ยังไม่มีงานส่ง" body="เมื่อนักเรียนส่งงาน รายการจะมาแสดงตรงนี้" />}
      </section>

      <section className="panel teacher-announcement-panel">
        <header className="announcement-overview-header">
          <div className="announcement-overview-title">
            <span className="announcement-overview-icon"><Megaphone aria-hidden /></span>
            <div>
              <h2>ประกาศล่าสุด</h2>
              <p>ข้อความที่เผยแพร่ให้นักเรียน</p>
            </div>
          </div>
          <span className="announcement-count">{announcements.length} รายการ</span>
        </header>
        {announcements.length ? (
          <div className="announcement-overview-list">
            {announcements.slice(0, 4).map((item) => (
              <article className="announcement-overview-item" key={item.id}>
                <div className="announcement-overview-copy">
                  <div className="announcement-overview-meta">
                    <strong>{item.title}</strong>
                    <span>{item.publishedAt}</span>
                  </div>
                  <p>{item.body}</p>
                  <small>{item.className}</small>
                </div>
                <button className="icon-danger" disabled={busy} onClick={() => deleteAnnouncement(item)} title="ลบประกาศ">
                  <Trash2 aria-hidden />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="announcement-overview-empty">
            <Megaphone aria-hidden />
            <div><strong>ยังไม่มีประกาศ</strong><span>ประกาศจากทุกห้องจะแสดงตรงนี้</span></div>
          </div>
        )}
      </section>

      <StudentHomeCardManager classrooms={classrooms} cards={homeCards} busy={busy} saveCard={saveHomeCard} toggleCard={toggleHomeCard} deleteCard={deleteHomeCard} moveCard={moveHomeCard} />
    </div>
  );
}

function StudentHomeCardManager({ classrooms, cards, busy, saveCard, toggleCard, deleteCard, moveCard }: { classrooms: Classroom[]; cards: StudentHomeCard[]; busy: boolean; saveCard: (draft: StudentHomeCardDraft, editingId?: string) => Promise<boolean>; toggleCard: (card: StudentHomeCard) => void; deleteCard: (card: StudentHomeCard) => void; moveCard: (card: StudentHomeCard, direction: -1 | 1) => void }) {
  const emptyDraft: StudentHomeCardDraft = { title: "", description: "", url: "", classroomIds: [], showToAll: true };
  const [draft, setDraft] = useState<StudentHomeCardDraft>(emptyDraft);
  const [editingId, setEditingId] = useState("");
  const orderedCards = orderStudentHomeCards(cards);

  function reset() {
    setDraft(emptyDraft);
    setEditingId("");
  }

  function edit(card: StudentHomeCard) {
    setEditingId(card.id);
    setDraft({ title: card.title, description: card.description, url: card.url, classroomIds: card.classroomIds, showToAll: !card.classroomIds.length });
  }

  function toggleClassroom(classroomId: string) {
    setDraft((current) => ({ ...current, classroomIds: current.classroomIds.includes(classroomId) ? current.classroomIds.filter((id) => id !== classroomId) : [...current.classroomIds, classroomId] }));
  }

  async function submit() {
    const ok = await saveCard(draft, editingId || undefined);
    if (ok) reset();
  }

  return <section className="panel student-home-card-manager">
    <SectionTitle title={editingId ? "แก้ไขการ์ดหน้าแรกนักเรียน" : "จัดการการ์ดหน้าแรกนักเรียน"} note={`${cards.length} การ์ด`} />
    <div className="home-card-manager-layout">
      <div className="home-card-compose">
        <div className="form-grid">
          <label className="field">ชื่อการ์ด<input value={draft.title} maxLength={80} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="เช่น ห้องเรียน Google Classroom" /></label>
          <label className="field">URL เว็บไซต์<input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://example.com" inputMode="url" /></label>
          <label className="field full-span">คำอธิบาย<textarea value={draft.description} maxLength={240} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="ข้อความสั้น ๆ ที่ช่วยให้นักเรียนรู้ว่าการ์ดนี้ใช้ทำอะไร" rows={3} /></label>
        </div>
        <fieldset className="assignment-classroom-fieldset home-card-audience-fieldset">
          <legend>นักเรียนที่เห็นการ์ด</legend>
          <label className="classroom-checkbox audience-all-checkbox"><input type="checkbox" checked={draft.showToAll} onChange={(event) => setDraft({ ...draft, showToAll: event.target.checked, classroomIds: event.target.checked ? [] : draft.classroomIds })} /><span>แสดงทุกห้องเรียน</span></label>
          {!draft.showToAll && <div className="classroom-checkbox-grid">{classrooms.map((classroom) => <label className="classroom-checkbox" key={classroom.id}><input type="checkbox" checked={draft.classroomIds.includes(classroom.id)} onChange={() => toggleClassroom(classroom.id)} /><span>{classroom.displayName}</span></label>)}</div>}
        </fieldset>
        <div className="form-actions"><button className="primary-button" type="button" disabled={busy} onClick={submit}><Save aria-hidden />{editingId ? "บันทึกการแก้ไข" : "เพิ่มการ์ด"}</button>{editingId && <button className="template-button" type="button" disabled={busy} onClick={reset}>ยกเลิก</button>}</div>
      </div>
      <div className="home-card-admin-list">
        {orderedCards.length ? orderedCards.map((card, index) => <article className={`home-card-admin-item ${card.isActive ? "" : "inactive"}`} key={card.id}>
          <span className="home-card-admin-icon"><Globe2 aria-hidden /></span>
          <div className="home-card-admin-copy"><strong>{card.title}</strong><a href={card.url} target="_blank" rel="noopener noreferrer">{websiteHost(card.url)}<ExternalLink aria-hidden /></a><small>{card.classroomIds.length ? `${card.classroomIds.length} ห้องเรียน` : "ทุกห้องเรียน"} · {card.isActive ? "กำลังแสดง" : "ซ่อนอยู่"}</small></div>
          <div className="home-card-admin-actions"><button type="button" disabled={busy || index === 0} onClick={() => moveCard(card, -1)} title="เลื่อนขึ้น" aria-label={`เลื่อน ${card.title} ขึ้น`}><ArrowUp aria-hidden /></button><button type="button" disabled={busy || index === orderedCards.length - 1} onClick={() => moveCard(card, 1)} title="เลื่อนลง" aria-label={`เลื่อน ${card.title} ลง`}><ArrowDown aria-hidden /></button><button type="button" disabled={busy} onClick={() => toggleCard(card)} title={card.isActive ? "ซ่อนจากนักเรียน" : "เปิดให้นักเรียนเห็น"} aria-label={`${card.isActive ? "ซ่อน" : "แสดง"} ${card.title}`}>{card.isActive ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</button><button type="button" disabled={busy} onClick={() => edit(card)} title="แก้ไข" aria-label={`แก้ไข ${card.title}`}><Pencil aria-hidden /></button><button className="delete" type="button" disabled={busy} onClick={() => deleteCard(card)} title="ลบ" aria-label={`ลบ ${card.title}`}><Trash2 aria-hidden /></button></div>
        </article>) : <EmptyState title="ยังไม่มีการ์ดเว็บไซต์" body="เพิ่มเว็บไซต์ที่นักเรียนใช้บ่อย แล้วการ์ดจะแสดงบนหน้าแรกของนักเรียน" />}
      </div>
    </div>
  </section>;
}

function StudentHome({ setView, materials, entries, students, announcements, homeCards }: { setView: (view: ViewKey) => void; materials: Material[]; entries: ScoreEntry[]; students: StudentRecord[]; announcements: Announcement[]; homeCards: StudentHomeCard[] }) {
  const student = students[0];
  const score = scoreSummaryForStudent(student, entries);
  const visibleCards = orderStudentHomeCards(homeCards);
  return <><section className="student-home-welcome"><p>ยินดีต้อนรับ</p><h1>{student?.name || "นักเรียน"}</h1><span>{student?.className || "ยังไม่พบข้อมูลชั้นเรียน"}</span></section><section className="student-home-grid"><button className="student-home-card score-home-card" onClick={() => setView("scores")}><div className="score-ring home-score-ring" style={{ background: `conic-gradient(var(--ring-fill) 0deg ${score.ringPercent * 3.6}deg, var(--ring-track) ${score.ringPercent * 3.6}deg 360deg)` }}><div><strong>{formatScore(score.totalFinal)}</strong><span>คะแนน</span></div></div></button><button className="student-home-card" onClick={() => setView("materials")}><BookOpen aria-hidden /><span>{materials.length} ไฟล์</span><strong>สื่อการสอน</strong><small>เปิดดูและดาวน์โหลดสื่อ</small></button></section>{visibleCards.length > 0 && <section className="panel student-resource-panel"><SectionTitle title="เว็บไซต์สำหรับนักเรียน" note={`${visibleCards.length} รายการ`} /><div className="student-resource-grid">{visibleCards.map((card) => <a className="student-resource-card" href={card.url} target="_blank" rel="noopener noreferrer" key={card.id}><span className="student-resource-icon"><Globe2 aria-hidden /></span><div><strong>{card.title}</strong>{card.description && <p>{card.description}</p>}</div><ExternalLink className="student-resource-external" aria-hidden /></a>)}</div></section>}<div className="two-column student-home-lists"><section className="panel announcement-panel-red"><SectionTitle title="ประกาศ" note={`${announcements.length} รายการ`} />{announcements.length ? <div className="announcement-list">{announcements.slice(0, 4).map((item) => <article className="announcement-card announcement-card-student" key={item.id}><div><strong>{item.title}</strong><span>{item.publishedAt}</span><p>{item.body}</p></div></article>)}</div> : <EmptyState title="ยังไม่มีประกาศ" body="เมื่อคุณครูประกาศ ระบบจะแสดงที่นี่" />}</section><section className="panel"><SectionTitle title="สื่อล่าสุด" note={`${materials.length} รายการ`} />{materials.length ? <div className="mini-list">{materials.slice(0, 3).map((item) => <div key={item.id}><strong>{item.title}</strong><span>{item.level} · {item.type}</span></div>)}</div> : <EmptyState title="ยังไม่มีสื่อการสอน" body="รอคุณครูอัปโหลดสื่อ" />}</section></div></>;
}

function MaterialsView({ role, session, currentStudent, materials: items, logs, busy, flash, onOpen, onDownload, onUpload, onDelete, onDeleteLog }: { role: Role; session: AppSession; currentStudent?: StudentRecord; materials: Material[]; logs: MaterialDownloadLog[]; busy: boolean; flash: (message: string) => void; onOpen: (item: Material) => void; onDownload: (item: Material, studentCode: string, password: string) => Promise<boolean>; onUpload: (input: MaterialUpload) => Promise<boolean>; onDelete: (item: Material) => void; onDeleteLog: (log: MaterialDownloadLog) => void }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("ทั้งหมด");
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("สื่อเสริม");
  const [level, setLevel] = useState("ม.1");
  const [type, setType] = useState<MaterialType>("PDF");
  const [downloadTargetId, setDownloadTargetId] = useState("");
  const [downloadStudentId, setDownloadStudentId] = useState(currentStudent?.studentId || session.studentCode || "");
  const [downloadPassword, setDownloadPassword] = useState("");
  const studentLevel = role === "student" ? gradeLevelFromText(currentStudent?.className, session.room) : undefined;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchFilter = role === "student" || filter === "ทั้งหมด" || (filter === "PDF" || filter === "VIDEO" ? item.type === filter : item.level === filter);
      const matchQuery = !q || `${item.title} ${item.unit} ${item.level}`.toLowerCase().includes(q);
      return matchFilter && matchQuery;
    });
  }, [filter, items, query, role]);

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

  async function directDownload(item: Material) {
    if (!item.filePath || !isSupabaseConfigured) {
      onOpen(item);
      return;
    }
    const result = await supabase!.storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
    if (result.error || !result.data?.signedUrl) {
      flash(result.error?.message || "สร้างลิงก์ดาวน์โหลดไม่สำเร็จ");
      return;
    }
    await triggerFileDownload(result.data.signedUrl, item);
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
        <div className="input-shell material-search"><Search aria-hidden /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อสื่อหรือหน่วยการเรียน" /></div>
        <button className="select-button" type="button" onClick={() => flash(`พบสื่อ ${filtered.length} รายการ`)}>ค้นหา</button>
      </div>
      {role === "teacher" ? <div className="filter-row">{filters.map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div> : <div className="student-material-level"><GraduationCap aria-hidden /><span>สื่อการสอนสำหรับ</span><strong>{studentLevel || "ระดับชั้นของคุณ"}</strong></div>}
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
      {filtered.length ? <div className="material-grid">{filtered.map((item) => <MaterialCard key={item.id} item={item} role={role} downloadCount={logs.filter((log) => log.materialId === item.id).length} onOpen={() => onOpen(item)} onDownload={() => role === "student" ? chooseDownloadTarget(item) : void directDownload(item)} onDelete={() => onDelete(item)} />)}</div> : <EmptyState title={role === "student" && studentLevel ? `ยังไม่มีสื่อสำหรับ ${studentLevel}` : "ยังไม่มีสื่อการสอน"} body={role === "student" ? "เมื่อคุณครูอัปโหลดสื่อของระดับชั้นคุณ รายการจะแสดงที่นี่" : "เมื่ออัปโหลดไฟล์แล้ว รายการจะมาแสดงในหน้านี้"} />}
      <section className="panel">
        <SectionTitle title={role === "teacher" ? "ประวัติดาวน์โหลดทั้งหมด" : "ประวัติดาวน์โหลดของฉัน"} note={`${logs.length} รายการ`} />
        {logs.length ? <div className={`download-log-table ${role === "teacher" ? "teacher-download-log" : ""}`}><div className="download-log-head"><span>สื่อ</span><span>นักเรียน</span><span>วันที่</span>{role === "teacher" && <span aria-hidden />}</div>{logs.map((log) => <div className="download-log-row" key={log.id}><strong>{log.materialTitle}</strong><span><b>{log.studentName}</b><small>รหัสนักเรียน {log.studentId}</small></span><span>{log.downloadedAt}</span>{role === "teacher" && <button className="icon-danger download-log-delete" type="button" disabled={busy} onClick={() => onDeleteLog(log)} title={`ลบประวัติของ ${log.studentName}`} aria-label={`ลบประวัติการดาวน์โหลดของ ${log.studentName}`}><Trash2 aria-hidden /></button>}</div>)}</div> : <EmptyState title="ยังไม่มีประวัติดาวน์โหลด" body="เมื่อมีการดาวน์โหลดสื่อ ระบบจะบันทึกไว้ที่นี่" />}
      </section>
    </div>
  );
}

function ScoresView({ role, classrooms, selectedClassroomId, onClassroomChange, students, assignments, allAssignments, entries, busy, scoreAutoSaveStatus, activeClassName, addAssignment, updateAssignment, deleteAssignment, moveAssignment, updateScoreDraft, updateScoreStatus, saveScoreSheet, saveAllScoreSheets }: { role: Role; classrooms: Classroom[]; selectedClassroomId: string; onClassroomChange: (id: string) => void; students: StudentRecord[]; assignments: ScoreAssignment[]; allAssignments: ScoreAssignment[]; entries: ScoreEntry[]; busy: boolean; scoreAutoSaveStatus: ScoreAutoSaveStatus; activeClassName: string; addAssignment: (draft: AssignmentDraft) => Promise<boolean>; updateAssignment: (assignments: ScoreAssignment[], draft: AssignmentDraft) => Promise<boolean>; deleteAssignment: (assignment: ScoreAssignment) => void; moveAssignment: (assignment: ScoreAssignment, direction: -1 | 1) => void; updateScoreDraft: (assignment: ScoreAssignment, student: StudentRecord, value: string) => void; updateScoreStatus: (assignment: ScoreAssignment, student: StudentRecord, status: ScoreEntryStatus) => void; saveScoreSheet: (assignment: ScoreAssignment) => void; saveAllScoreSheets: () => void }) {
  const [draft, setDraft] = useState<AssignmentDraft>({ title: "", rawMax: "", finalMax: "", classroomIds: selectedClassroomId ? [selectedClassroomId] : [] });
  const [editingGroupKey, setEditingGroupKey] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"raw" | "scaled">("raw");
  const [teacherView, setTeacherView] = useState<"add" | "entry" | "overview">("add");
  const assignmentGroups = useMemo(() => groupAssignments(allAssignments), [allAssignments]);
  const assignmentGroupLabels = useMemo(() => {
    const totals = new Map<string, number>();
    const positions = new Map<string, number>();
    const labels = new Map<string, string>();
    assignmentGroups.forEach((group) => {
      const titleKey = group.title.trim().toLocaleLowerCase("th");
      totals.set(titleKey, (totals.get(titleKey) ?? 0) + 1);
    });
    assignmentGroups.forEach((group) => {
      const titleKey = group.title.trim().toLocaleLowerCase("th");
      const position = (positions.get(titleKey) ?? 0) + 1;
      positions.set(titleKey, position);
      if ((totals.get(titleKey) ?? 0) > 1) labels.set(group.key, `ชุดที่ ${position}`);
    });
    return labels;
  }, [assignmentGroups]);
  const totalCreatedScore = assignmentGroups.reduce((sum, group) => sum + group.finalMax, 0);
  const scoreRingPercent = Math.max(0, Math.min(100, totalCreatedScore));
  const selected = assignments.find((assignment) => assignment.id === selectedId) || assignments[0];
  const editingGroup = assignmentGroups.find((group) => group.key === editingGroupKey);
  const note = selected ? `คะแนนดิบเต็ม ${formatScore(selected.rawMax)} หารเป็นคะแนนเก็บ ${formatScore(selected.finalMax)}` : "สร้างงานคะแนนก่อน";

  useEffect(() => {
    if (editingGroupKey) return;
    setDraft((current) => ({ ...current, classroomIds: selectedClassroomId ? [selectedClassroomId] : [] }));
  }, [editingGroupKey, selectedClassroomId]);

  function toggleAssignmentClassroom(classroomId: string) {
    setDraft((current) => {
      if (current.classroomIds.includes(classroomId)) return { ...current, classroomIds: current.classroomIds.filter((id) => id !== classroomId) };
      const assignment = editingGroup?.assignments.find((item) => item.classroomId === classroomId);
      if (editingGroup?.hasMixedValues && !current.classroomIds.length && assignment) {
        return {
          title: assignment.title,
          rawMax: numericInputValue(assignment.rawMax),
          finalMax: numericInputValue(assignment.finalMax),
          classroomIds: [classroomId]
        };
      }
      return { ...current, classroomIds: [...current.classroomIds, classroomId] };
    });
  }

  function resetAssignmentForm() {
    setEditingGroupKey("");
    setDraft({ title: "", rawMax: "", finalMax: "", classroomIds: selectedClassroomId ? [selectedClassroomId] : [] });
  }

  function beginEditAssignment(group: AssignmentGroup) {
    setEditingGroupKey(group.key);
    setDraft({
      title: group.hasMixedValues ? "" : group.title,
      rawMax: group.hasMixedValues ? "" : numericInputValue(group.rawMax),
      finalMax: group.hasMixedValues ? "" : numericInputValue(group.finalMax),
      classroomIds: group.hasMixedValues ? [] : group.classroomIds
    });
  }

  async function submitAssignment() {
    const selectedAssignments = editingGroup?.assignments.filter((assignment) => assignment.classroomId && draft.classroomIds.includes(assignment.classroomId)) ?? [];
    const ok = editingGroup ? await updateAssignment(selectedAssignments, draft) : await addAssignment(draft);
    if (!ok) return;
    resetAssignmentForm();
  }

  if (role === "student") {
    return <StudentScoresView assignments={assignments} entries={entries} students={students} />;
  }

  return (
    <div className="page-stack teacher-score-page">
      <PageHeader title={teacherView === "add" ? "เพิ่มงาน" : teacherView === "entry" ? "กรอกคะแนน" : "ดูคะแนนรวม"} eyebrow={teacherView === "add" ? "กำหนดงานคะแนน" : activeClassName} />
      <div className="teacher-score-view-switch" role="tablist" aria-label="มุมมองคะแนน">
        <button className={teacherView === "add" ? "active" : ""} type="button" role="tab" aria-selected={teacherView === "add"} onClick={() => setTeacherView("add")}><Plus aria-hidden />เพิ่มงาน</button>
        <button className={teacherView === "entry" ? "active" : ""} type="button" role="tab" aria-selected={teacherView === "entry"} onClick={() => setTeacherView("entry")}><Pencil aria-hidden />กรอกคะแนน</button>
        <button className={teacherView === "overview" ? "active" : ""} type="button" role="tab" aria-selected={teacherView === "overview"} onClick={() => setTeacherView("overview")}><BarChart3 aria-hidden />ดูคะแนนรวม</button>
      </div>
      {teacherView === "add" &&
        <section className="panel compact-form">
          <SectionTitle title={editingGroup ? "แก้ไขงานคะแนน" : "เพิ่มงานคะแนน"} note={editingGroup ? `เลือกแล้ว ${draft.classroomIds.length} จาก ${editingGroup.assignments.length} ห้อง` : "งานที่เพิ่มก่อนจะแสดงก่อน"} />
          <div className="form-grid">
            <label className="field">ชื่องาน / แบบประเมิน<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="เช่น ใบงานที่ 1" /></label>
            <label className="field">คะแนนเต็มดิบ<input type="number" min="1" value={draft.rawMax} onChange={(event) => setDraft({ ...draft, rawMax: event.target.value })} placeholder="เช่น 10" /></label>
            <label className="field">คิดเป็นคะแนนเก็บ<input type="number" min="1" value={draft.finalMax} onChange={(event) => setDraft({ ...draft, finalMax: event.target.value })} placeholder="เช่น 5" /></label>
          </div>
          <fieldset className="assignment-classroom-fieldset">
            <legend>{editingGroup ? "เลือกห้องเรียนที่ต้องการแก้ไข" : "เลือกห้องเรียนที่ได้รับงาน"}</legend>
            <div className="classroom-checkbox-grid">{(editingGroup ? classrooms.filter((classroom) => editingGroup.classroomIds.includes(classroom.id)) : classrooms).map((classroom) => <label className="classroom-checkbox" key={classroom.id}><input type="checkbox" checked={draft.classroomIds.includes(classroom.id)} onChange={() => toggleAssignmentClassroom(classroom.id)} /><span>{classroom.displayName}</span></label>)}</div>
            {editingGroup && <small className="assignment-edit-help">{editingGroup.hasMixedValues && !draft.classroomIds.length ? "งานนี้มีค่าต่างกันตามห้อง เลือกห้องแรกเพื่อโหลดค่าเดิมก่อนแก้ไข" : "ค่าที่แก้ไขจะเปลี่ยนเฉพาะห้องที่ติ๊กเลือก คะแนนนักเรียนเดิมยังอยู่ครบ"}</small>}
          </fieldset>
          <div className="form-actions">
            <button className="primary-button" disabled={busy || Boolean(editingGroup && !draft.classroomIds.length)} onClick={submitAssignment}>{editingGroup ? <Save aria-hidden /> : <Plus aria-hidden />}{editingGroup ? "บันทึกการแก้ไข" : "เพิ่มงานคะแนน"}</button>
            {editingGroup && <button className="template-button" type="button" disabled={busy} onClick={resetAssignmentForm}>ยกเลิก</button>}
          </div>
          <div className="assignment-catalog">
            <div className="assignment-catalog-heading"><SectionTitle title="งานคะแนนที่สร้างแล้ว" note={`${assignmentGroups.length} งาน`} /><div className="created-score-ring" style={{ background: `conic-gradient(var(--ring-fill) 0deg ${scoreRingPercent * 3.6}deg, var(--ring-track) ${scoreRingPercent * 3.6}deg 360deg)` }} aria-label={`สร้างคะแนนแล้ว ${formatScore(totalCreatedScore)} คะแนน`}><div><strong>{formatScore(totalCreatedScore)}</strong><span>คะแนน</span></div></div></div>
            {assignmentGroups.length ? <div className="assignment-catalog-list">{assignmentGroups.map((group) => {
              const groupLabel = assignmentGroupLabels.get(group.key);
              return <article className={`assignment-catalog-item ${editingGroupKey === group.key ? "editing" : ""}`} key={group.key}><div><strong>{group.title}{groupLabel ? ` · ${groupLabel}` : ""}</strong><span>{group.hasMixedValues ? "ค่าคะแนนต่างกันตามห้อง" : `ดิบ ${formatScore(group.rawMax)} → เก็บ ${formatScore(group.finalMax)}`} · {group.assignments.length} ห้อง</span><small>{group.assignments.map((assignment) => assignment.className).join(" · ")}</small></div><button className="assignment-edit-button" type="button" disabled={busy} onClick={() => beginEditAssignment(group)} aria-label={`แก้ไข ${group.title}${groupLabel ? ` ${groupLabel}` : ""}`}><Pencil aria-hidden /><span>แก้ไข</span></button></article>;
            })}</div> : <EmptyState title="ยังไม่มีงานคะแนน" body="เพิ่มงานแรกแล้วรายการจะแสดงที่นี่" />}
          </div>
        </section>}
      {teacherView === "entry" &&
        <section className="score-manager score-workspace-panel">
          <SectionTitle title="ตารางกรอกคะแนนทั้งห้อง" note={assignments.length ? `${students.length} คน · ${assignments.length} งาน` : note} />
          <div className="panel-classroom-picker"><TeacherClassroomSelector classrooms={classrooms} selectedClassroomId={selectedClassroomId} onChange={onClassroomChange} /></div>
          {assignments.length ? (
            <>
              {students.length ? <div className="desktop-score-matrix"><div className="score-matrix-scroll"><table className="score-matrix"><thead><tr><th className="matrix-no">เลขที่</th><th className="matrix-id">รหัสนักเรียน</th><th className="matrix-name">ชื่อ-นามสกุล</th>{assignments.map((assignment, index) => <th className="matrix-assignment" key={assignment.id}><div><strong>{assignment.title}</strong><span>ดิบ {formatScore(assignment.rawMax)} → เก็บ {formatScore(assignment.finalMax)}</span><div className="matrix-header-actions"><button type="button" disabled={busy || index === 0} onClick={() => moveAssignment(assignment, -1)} title={`ย้าย ${assignment.title} ไปก่อนหน้า`} aria-label={`ย้าย ${assignment.title} ไปก่อนหน้า`}><ArrowLeft aria-hidden /></button><button type="button" disabled={busy || index === assignments.length - 1} onClick={() => moveAssignment(assignment, 1)} title={`ย้าย ${assignment.title} ไปถัดไป`} aria-label={`ย้าย ${assignment.title} ไปถัดไป`}><ArrowRight aria-hidden /></button><button className="matrix-delete" type="button" disabled={busy} onClick={() => deleteAssignment(assignment)} title={`ลบ ${assignment.title}`} aria-label={`ลบ ${assignment.title}`}><Trash2 aria-hidden /></button></div></div></th>)}</tr></thead><tbody>{students.map((student) => <tr key={student.id}><td className="matrix-no">{student.no}</td><td className="matrix-id">{student.studentId}</td><th className="matrix-name" scope="row">{student.name}</th>{assignments.map((assignment) => {
                const entry = findScoreEntry(entries, assignment.id, student.id);
                const status = entry?.status ?? "ungraded";
                return <td className={`matrix-score-cell score-status-${status}`} key={assignment.id}><ScoreEntryControls assignment={assignment} student={student} entry={entry} onScore={updateScoreDraft} onStatus={updateScoreStatus} /></td>;
              })}</tr>)}</tbody></table></div><div className="matrix-actions"><div className="matrix-save-copy"><span>กรอกคะแนนดิบ ระบบคำนวณคะแนนเก็บและบันทึกให้อัตโนมัติ</span><ScoreAutoSaveIndicator status={scoreAutoSaveStatus} /></div><button className="primary-button" disabled={busy || !students.length} onClick={saveAllScoreSheets}><Save aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกทั้งหมดตอนนี้"}</button></div></div> : <EmptyState title="ยังไม่มีรายชื่อนักเรียน" body="ไปที่เมนูรายชื่อเพื่อเพิ่มนักเรียนก่อนกรอกคะแนน" />}
              <div className="mobile-score-editor">
                <div className="assignment-list">{assignments.map((assignment, index) => <div className="assignment-order-item" key={assignment.id}><button className={`assignment-chip ${selected?.id === assignment.id ? "active" : ""}`} type="button" onClick={() => setSelectedId(assignment.id)}>{assignment.title}<span>{formatScore(assignment.rawMax)}{" → "}{formatScore(assignment.finalMax)}</span></button><div><button type="button" disabled={busy || index === 0} onClick={() => moveAssignment(assignment, -1)} aria-label={`ย้าย ${assignment.title} ไปก่อนหน้า`}><ArrowLeft aria-hidden /></button><button type="button" disabled={busy || index === assignments.length - 1} onClick={() => moveAssignment(assignment, 1)} aria-label={`ย้าย ${assignment.title} ไปถัดไป`}><ArrowRight aria-hidden /></button></div></div>)}</div>
                <div className="score-tabs"><button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>คะแนนดิบ</button><button className={mode === "scaled" ? "active" : ""} onClick={() => setMode("scaled")}>คะแนนที่หารแล้ว</button></div>
                {selected && students.length ? <div className="score-table">{students.map((student) => {
                  const entry = findScoreEntry(entries, selected.id, student.id);
                  const status = entry?.status ?? "ungraded";
                  return <article className={`score-row score-row-wide score-status-${status}`} key={student.id}><div className="student-score-identity"><strong>{student.name}</strong><span>รหัสนักเรียน {student.studentId}</span></div>{mode === "raw" ? <ScoreEntryControls assignment={selected} student={student} entry={entry} onScore={updateScoreDraft} onStatus={updateScoreStatus} /> : <ScoreEntryResult entry={entry} assignment={selected} />}</article>;
                })}</div> : <EmptyState title="ยังไม่มีรายชื่อนักเรียน" body="ไปที่เมนูรายชื่อเพื่อเพิ่มนักเรียนก่อนกรอกคะแนน" />}
                <ScoreAutoSaveIndicator status={scoreAutoSaveStatus} />
                <div className="form-actions">{selected && <button className="primary-button" disabled={busy || !students.length} onClick={() => saveScoreSheet(selected)}><Save aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกงานนี้ตอนนี้"}</button>}{selected && <button className="danger-button" disabled={busy} onClick={() => deleteAssignment(selected)}><Trash2 aria-hidden />ลบงานนี้</button>}</div>
              </div>
            </>
          ) : <EmptyState title="ยังไม่มีงานคะแนน" body="เพิ่มงานคะแนนแรก แล้วระบบจะสร้างตารางให้กรอกตามรายชื่อนักเรียน" />}
        </section>}
      {teacherView === "overview" && <TeacherScoreOverview classrooms={classrooms} selectedClassroomId={selectedClassroomId} onClassroomChange={onClassroomChange} students={students} assignments={assignments} entries={entries} onEdit={() => setTeacherView("entry")} />}
    </div>
  );
}

function ScoreEntryControls({ assignment, student, entry, onScore, onStatus }: { assignment: ScoreAssignment; student: StudentRecord; entry?: ScoreEntry; onScore: (assignment: ScoreAssignment, student: StudentRecord, value: string) => void; onStatus: (assignment: ScoreAssignment, student: StudentRecord, status: ScoreEntryStatus) => void }) {
  const status = entry?.status ?? "ungraded";
  const acceptsScore = status === "ungraded" || status === "scored";
  const inputValue = status === "scored" ? formatScore(entry?.rawScore ?? 0) : "";
  return <div className={`score-entry-controls score-status-${status}`}>
    <select aria-label={`สถานะ ${assignment.title} ของ ${student.name}`} value={status} onChange={(event) => onStatus(assignment, student, event.target.value as ScoreEntryStatus)}>{scoreEntryStatusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
    <label className="score-entry-number"><input aria-label={`${assignment.title} ของ ${student.name}`} type="number" min="0" max={assignment.rawMax} value={inputValue} disabled={!acceptsScore} onChange={(event) => onScore(assignment, student, event.target.value)} placeholder={acceptsScore ? "0" : "–"} /><span>/ {formatScore(assignment.rawMax)}</span></label>
    <small>{scoreEntryStatusSummary(entry, assignment)}</small>
  </div>;
}

function ScoreEntryResult({ entry, assignment }: { entry?: ScoreEntry; assignment: ScoreAssignment }) {
  const status = entry?.status ?? "ungraded";
  if (status === "scored") return <div className="score-result score-status-scored"><strong>{formatScore(entry?.finalScore ?? 0)}</strong><span>/ {formatScore(assignment.finalMax)}</span></div>;
  if (status === "leave") return <div className="score-result score-status-leave"><strong>ลา</strong><span>ยังให้คะแนนได้</span></div>;
  if (status === "expired") return <div className="score-result score-status-expired"><strong>0</strong><span>หมดเวลาส่ง</span></div>;
  if (status === "no_score") return <div className="score-result score-status-no_score"><strong>0</strong><span>ไม่มีคะแนน</span></div>;
  return <div className="score-result score-status-ungraded"><strong>–</strong><span>ยังไม่กรอก</span></div>;
}

function ScoreAutoSaveIndicator({ status }: { status: ScoreAutoSaveStatus }) {
  const labels: Record<ScoreAutoSaveStatus, string> = {
    idle: "พร้อมบันทึกอัตโนมัติ",
    pending: "รอบันทึก...",
    saving: "กำลังบันทึก...",
    saved: "บันทึกแล้ว",
    error: "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง"
  };
  return <span className={`score-autosave-status ${status}`} role="status" aria-live="polite"><i aria-hidden />{labels[status]}</span>;
}

function TeacherScoreOverview({ classrooms, selectedClassroomId, onClassroomChange, students, assignments, entries, onEdit }: { classrooms: Classroom[]; selectedClassroomId: string; onClassroomChange: (id: string) => void; students: StudentRecord[]; assignments: ScoreAssignment[]; entries: ScoreEntry[]; onEdit: () => void }) {
  return <section className="score-manager teacher-score-overview score-workspace-panel"><div className="score-overview-heading"><SectionTitle title="คะแนนรวมทุกงาน" note={`${students.length} คน · ${assignments.length} งาน`} /><button className="primary-button" type="button" onClick={onEdit}><Pencil aria-hidden />แก้ไขคะแนน</button></div><div className="panel-classroom-picker"><TeacherClassroomSelector classrooms={classrooms} selectedClassroomId={selectedClassroomId} onChange={onClassroomChange} /></div>{assignments.length && students.length ? <><div className="desktop-score-overview"><div className="score-matrix-scroll"><table className="score-matrix score-overview-matrix"><thead><tr><th className="matrix-no">เลขที่</th><th className="matrix-id">รหัสนักเรียน</th><th className="matrix-name">ชื่อ-นามสกุล</th>{assignments.map((assignment) => <th className="matrix-assignment overview-assignment" key={assignment.id}><strong>{assignment.title}</strong><span>เต็ม {formatScore(assignment.finalMax)}</span></th>)}<th className="matrix-total">รวม</th></tr></thead><tbody>{students.map((student) => {
    const studentEntries = assignments.map((assignment) => findScoreEntry(entries, assignment.id, student.id));
    const total = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry?.finalScore ?? 0 : 0), 0);
    const studentTotalMax = assignments.reduce((sum, assignment, index) => sum + (scoreEntryCountsTowardTotal(studentEntries[index]) ? assignment.finalMax : 0), 0);
    return <tr key={student.id}><td className="matrix-no">{student.no}</td><td className="matrix-id">{student.studentId}</td><th className="matrix-name" scope="row">{student.name}</th>{assignments.map((assignment, index) => <td className={`matrix-overview-score score-status-${studentEntries[index]?.status ?? "ungraded"}`} key={assignment.id}><ScoreEntryResult entry={studentEntries[index]} assignment={assignment} /></td>)}<td className="matrix-total"><strong>{formatScore(total)}</strong><span>/ {formatScore(studentTotalMax)}</span></td></tr>;
  })}</tbody></table></div></div><div className="mobile-score-overview-list">{students.map((student) => {
    const studentEntries = assignments.map((assignment) => findScoreEntry(entries, assignment.id, student.id));
    const total = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry?.finalScore ?? 0 : 0), 0);
    const studentTotalMax = assignments.reduce((sum, assignment, index) => sum + (scoreEntryCountsTowardTotal(studentEntries[index]) ? assignment.finalMax : 0), 0);
    return <article className="mobile-score-overview-card" key={student.id}><header><div><strong>{student.no}. {student.name}</strong><span>รหัสนักเรียน {student.studentId}</span></div><div className="mobile-score-total"><strong>{formatScore(total)}</strong><span>/ {formatScore(studentTotalMax)}</span></div></header><div>{assignments.map((assignment, index) => <div className={`mobile-assignment-score score-status-${studentEntries[index]?.status ?? "ungraded"}`} key={assignment.id}><span>{assignment.title}</span><ScoreEntryResult entry={studentEntries[index]} assignment={assignment} /></div>)}</div></article>;
  })}</div></> : <EmptyState title={assignments.length ? "ยังไม่มีรายชื่อนักเรียน" : "ยังไม่มีงานคะแนน"} body={assignments.length ? "เพิ่มรายชื่อนักเรียนก่อนดูคะแนนรวม" : "เพิ่มงานและบันทึกคะแนนก่อนดูภาพรวม"} />}</section>;
}

function StudentScoresView({ assignments, entries, students }: { assignments: ScoreAssignment[]; entries: ScoreEntry[]; students: StudentRecord[] }) {
  const student = students[0];
  const studentEntries = student ? entries.filter((entry) => entry.studentRecordId === student.id && entry.status !== "ungraded") : [];
  const totalFinal = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry.finalScore : 0), 0);
  const totalMax = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry.finalMax : 0), 0);
  const ringPercent = totalMax > 0 ? Math.max(0, Math.min(100, (totalFinal / totalMax) * 100)) : 0;
  return <div className="page-stack"><PageHeader title="คะแนนของฉัน" eyebrow={student?.name || "ยังไม่มีข้อมูลนักเรียน"} />{studentEntries.length ? <><section className="panel score-overview student-score-simple"><SectionTitle title="คะแนนทั้งหมด" note={`รวม ${studentEntries.length} รายการ`} /><div className="score-overview-layout"><div className="score-ring" style={{ background: `conic-gradient(var(--ring-fill) 0deg ${ringPercent * 3.6}deg, var(--ring-track) ${ringPercent * 3.6}deg 360deg)` }}><div><strong>{formatScore(totalFinal)}</strong><span>คะแนน</span></div></div><div className="score-overview-copy"><p>คะแนนสะสมจากงานที่ครูบันทึกแล้ว</p></div></div></section><section className="panel"><SectionTitle title="คะแนนทั้งหมด" note={`${studentEntries.length} รายการ`} /><div className="score-summary-table student-score-table"><div className="score-summary-head"><span>งานคะแนน</span><span>คะแนนที่ได้</span></div>{studentEntries.map((entry) => {
    const assignment = assignments.find((item) => item.id === entry.assignmentId);
    return <div className={`score-summary-row static score-status-${entry.status}`} key={entry.id}><strong>{assignment?.title || "งานคะแนน"}</strong><span>{studentScoreEntryLabel(entry)}</span></div>;
  })}</div></section></> : <EmptyState title="ยังไม่มีคะแนน" body="เมื่อคุณครูบันทึกคะแนนแล้วจะแสดงที่นี่" />}</div>;
}

function WorkView({ role, classrooms, selectedClassroomId, onClassroomChange, assignments, submissions, classmates, currentStudent, busy, activeClassName, submitWork, updateSubmission, saveSubmission, deleteSubmission, openSubmission }: { role: Role; classrooms: Classroom[]; selectedClassroomId: string; onClassroomChange: (id: string) => void; assignments: ScoreAssignment[]; submissions: SubmissionRecord[]; classmates: StudentRecord[]; currentStudent?: StudentRecord; busy: boolean; activeClassName: string; submitWork: (draft: SubmissionDraft) => Promise<boolean | void>; updateSubmission: (id: string, patch: Partial<SubmissionRecord>) => void; saveSubmission: (item: SubmissionRecord) => void; deleteSubmission: (item: SubmissionRecord) => void; openSubmission: (item: SubmissionRecord) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [submissionKind, setSubmissionKind] = useState<SubmissionKind>("individual");
  const [deliveryMethod, setDeliveryMethod] = useState<"file" | "link">("file");
  const [linkUrl, setLinkUrl] = useState("");
  const [memberCodes, setMemberCodes] = useState<string[]>([]);
  const ownCode = currentStudent?.studentId || "";
  const selectableClassmates = classmates.filter((student) => student.studentId !== ownCode);
  useEffect(() => {
    if (!assignments.some((assignment) => assignment.id === assignmentId)) setAssignmentId(assignments[0]?.id || "");
  }, [assignmentId, assignments]);

  function toggleGroupMember(studentCode: string) {
    setMemberCodes((current) => current.includes(studentCode) ? current.filter((code) => code !== studentCode) : [...current, studentCode]);
  }

  async function handleSubmitWork() {
    const ok = await submitWork({
      assignmentId,
      file: deliveryMethod === "file" ? file : null,
      linkUrl: deliveryMethod === "link" ? linkUrl : "",
      submissionKind,
      memberCodes: submissionKind === "group" ? memberCodes : []
    });
    if (!ok) return;
    setFile(null);
    setLinkUrl("");
    setMemberCodes([]);
  }

  if (role === "teacher") {
    return (
      <div className="page-stack">
        <PageHeader title="ตรวจงาน" eyebrow={activeClassName} />
        <section className="panel">
          <SectionTitle title="รายการงานส่ง" note={`${submissions.length} รายการ`} />
          <div className="panel-classroom-picker"><TeacherClassroomSelector classrooms={classrooms} selectedClassroomId={selectedClassroomId} onChange={onClassroomChange} /></div>
          {submissions.length ? <div className="submission-list">{submissions.map((item) => <ReviewCard key={item.id} item={item} busy={busy} updateSubmission={updateSubmission} saveSubmission={saveSubmission} deleteSubmission={deleteSubmission} openSubmission={openSubmission} />)}</div> : <EmptyState title="ยังไม่มีงานส่ง" body="เมื่อนักเรียนอัปโหลดงานของห้องที่เลือก รายการจะปรากฏที่นี่" />}
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
                {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
              </select>
            </label>
            <fieldset className="submission-option-group">
              <legend>รูปแบบการส่ง</legend>
              <div className="submission-segmented-control">
                <button className={submissionKind === "individual" ? "active" : ""} type="button" onClick={() => { setSubmissionKind("individual"); setMemberCodes([]); }}><User aria-hidden />งานเดี่ยว</button>
                <button className={submissionKind === "group" ? "active" : ""} type="button" onClick={() => setSubmissionKind("group")}><Users aria-hidden />งานกลุ่ม</button>
              </div>
            </fieldset>
            {submissionKind === "group" && <fieldset className="group-member-picker">
              <legend>สมาชิกกลุ่ม <span>{memberCodes.length + 1} คน</span></legend>
              <div className="group-member-current"><CheckCircle2 aria-hidden /><div><strong>{currentStudent?.name || "บัญชีของฉัน"}</strong><small>ผู้ส่งงาน</small></div></div>
              {selectableClassmates.length ? <div className="group-member-grid">{selectableClassmates.map((student) => <label className="group-member-option" key={student.id}><input type="checkbox" checked={memberCodes.includes(student.studentId)} onChange={() => toggleGroupMember(student.studentId)} /><span><strong>{student.no ? `${student.no}. ` : ""}{student.name}</strong><small>รหัส {student.studentId}</small></span></label>)}</div> : <div className="empty-inline">ยังโหลดรายชื่อเพื่อนในห้องไม่ได้</div>}
            </fieldset>}
            <fieldset className="submission-option-group">
              <legend>สิ่งที่แนบ</legend>
              <div className="submission-segmented-control">
                <button className={deliveryMethod === "file" ? "active" : ""} type="button" onClick={() => { setDeliveryMethod("file"); setLinkUrl(""); }}><FileText aria-hidden />ไฟล์</button>
                <button className={deliveryMethod === "link" ? "active" : ""} type="button" onClick={() => { setDeliveryMethod("link"); setFile(null); }}><ExternalLink aria-hidden />ลิงก์</button>
              </div>
            </fieldset>
            {deliveryMethod === "file"
              ? <UploadPanel file={file} setFile={setFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.mp4,.mov" label="เลือกไฟล์งาน" help="ขนาดไม่เกิน 25MB" />
              : <label className="field submission-link-field">ลิงก์งาน<input type="url" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://..." /></label>}
            <button className="primary-button full-button" disabled={busy} onClick={() => void handleSubmitWork()}><CloudUpload aria-hidden />{busy ? "กำลังส่งงาน" : submissionKind === "group" ? `ส่งงานกลุ่ม ${memberCodes.length + 1} คน` : "ส่งงาน"}</button>
          </>
        ) : <EmptyState title="ยังไม่มีงานให้ส่ง" body="รอคุณครูกำหนดงานในหน้าจัดการคะแนนก่อน" />}
      </section>
      <section className="panel">
        <SectionTitle title="ประวัติการส่งงาน" note={`${submissions.length} รายการ`} />
        {submissions.length ? <SubmissionList items={submissions} onOpen={openSubmission} /> : <EmptyState title="ยังไม่มีประวัติ" body="เมื่อส่งงานแล้วจะแสดงรายการที่นี่" />}
      </section>
    </div>
  );
}

function ReviewCard({ item, busy, updateSubmission, saveSubmission, deleteSubmission, openSubmission }: { item: SubmissionRecord; busy: boolean; updateSubmission: (id: string, patch: Partial<SubmissionRecord>) => void; saveSubmission: (item: SubmissionRecord) => void; deleteSubmission: (item: SubmissionRecord) => void; openSubmission: (item: SubmissionRecord) => void }) {
  const isLink = Boolean(item.linkUrl);
  return (
    <article className="submission-card review-card">
      <div>
        <div className="submission-title-line"><strong>{item.assignmentTitle}</strong><span className="submission-kind-badge">{item.submissionKind === "group" ? `งานกลุ่ม ${item.groupMemberCodes.length} คน` : "งานเดี่ยว"}</span></div>
        <div className="student-submission-identity"><span>ผู้ส่ง {item.studentName}</span><small>รหัสนักเรียน {item.studentId}</small></div>
        <SubmissionMemberList item={item} />
        <small>{item.submittedAt}</small>
        <div className="review-file-box">{isLink ? <ExternalLink aria-hidden /> : <FileText aria-hidden />}<div><span>{isLink ? "ลิงก์งาน" : "ไฟล์งาน"}</span><strong>{isLink ? item.linkUrl : item.filePath ? fileNameFromPath(item.filePath) : "ยังไม่มีสิ่งที่แนบ"}</strong></div><button className="template-button" type="button" onClick={() => openSubmission(item)} disabled={!item.filePath && !item.linkUrl}><ExternalLink aria-hidden />{isLink ? "เปิดลิงก์" : "เปิดไฟล์"}</button></div>
      </div>
      <div className="review-grid">
        <label className="field">สถานะ<select value={item.status} onChange={(event) => updateSubmission(item.id, { status: event.target.value as SubmissionStatus })}>{submissionStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="field">คะแนนดิบ<input type="number" min="0" value={numericInputValue(item.rawScore)} onChange={(event) => updateSubmission(item.id, { rawScore: clampScore(event.target.value, item.rawMax) })} placeholder="0" /></label>
        <label className="field">เต็มดิบ<input type="number" min="1" value={item.rawMax} onChange={(event) => updateSubmission(item.id, { rawMax: positiveNumber(event.target.value, item.rawMax) })} /></label>
        <label className="field">คะแนนเก็บเต็ม<input type="number" min="1" value={item.finalMax} onChange={(event) => updateSubmission(item.id, { finalMax: positiveNumber(event.target.value, item.finalMax) })} /></label>
        <div className="score-result"><strong>{formatScore(scaledScore(item.rawScore, item.rawMax, item.finalMax))}</strong><span>/ {formatScore(item.finalMax)}</span></div>
        <button className="small-primary" disabled={busy} onClick={() => saveSubmission(item)}><Save aria-hidden />บันทึก</button>
        <button className="danger-button review-delete-button" disabled={busy} onClick={() => deleteSubmission(item)}><Trash2 aria-hidden />ลบรายการ</button>
      </div>
    </article>
  );
}

function SubmissionMemberList({ item }: { item: SubmissionRecord }) {
  if (item.submissionKind !== "group") return null;
  return <div className="submission-member-list" aria-label="สมาชิกกลุ่ม">{item.groupMemberNames.map((name, index) => <span key={`${item.groupMemberCodes[index] || name}-${index}`}>{name}</span>)}</div>;
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
  return <section className="upload-panel"><CloudUpload aria-hidden /><strong>{label}</strong><span>หรือ</span><label className="outline-file-button"><Upload aria-hidden /><input accept={accept} type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="file-choice-label">{file ? file.name : "เลือกไฟล์จากเครื่อง"}</span></label><small>{help}</small></section>;
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
        <div><h2>{session.name}</h2><p>{session.school}</p>{session.studentCode && <span className="profile-student-code">รหัสนักเรียน {session.studentCode}</span>}</div>
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

function MaterialCard({ item, role, downloadCount, onOpen, onDownload, onDelete }: { item: Material; role: Role; downloadCount: number; onOpen: () => void; onDownload: () => void; onDelete: () => void }) {
  return <article className={`material-card material-name-card tone-border-${item.accent}`}><div className="material-title-display"><div className="material-title-meta"><span className={`type-pill ${item.type.toLowerCase()}`}>{item.type}</span><span>{item.level}</span></div><h2>{item.title}</h2><p>{item.unit}</p></div><div className="material-body"><div className="material-meta"><span>{item.date}</span><span>ดาวน์โหลดแล้ว {downloadCount} ครั้ง</span></div><div className="card-actions"><button className="small-primary" onClick={onOpen}><Eye aria-hidden />ดู</button><button className="template-button" onClick={onDownload}><Download aria-hidden />ดาวน์โหลด</button>{role === "teacher" && <button className="danger-button small-danger" onClick={onDelete}><Trash2 aria-hidden />ลบ</button>}</div></div></article>;
}

function SubmissionList({ items, onOpen, compact = false }: { items: SubmissionRecord[]; onOpen?: (item: SubmissionRecord) => void; compact?: boolean }) {
  return <div className="submission-list">{items.slice(0, compact ? 2 : items.length).map((item) => <article className="submission-card compact-submission-card" key={item.id}><div><div className="submission-title-line"><strong>{item.assignmentTitle}</strong>{item.submissionKind === "group" && <span className="submission-kind-badge">งานกลุ่ม {item.groupMemberCodes.length} คน</span>}</div><div className="student-submission-identity"><span>ผู้ส่ง {item.studentName}</span><small>รหัสนักเรียน {item.studentId}</small></div>{!compact && <SubmissionMemberList item={item} />}{!compact && <small className="submission-file-name">{item.linkUrl ? `ลิงก์: ${item.linkUrl}` : item.filePath ? `ไฟล์: ${fileNameFromPath(item.filePath)}` : "ยังไม่มีสิ่งที่แนบ"}</small>}</div><div className="submission-state"><small>{item.submittedAt}</small><span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span>{onOpen && <button className="small-primary" type="button" onClick={() => onOpen(item)} disabled={!item.filePath && !item.linkUrl}><Eye aria-hidden />{item.linkUrl ? "เปิดลิงก์" : "เปิดไฟล์"}</button>}</div></article>)}</div>;
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

function gradeLevelFromText(...values: Array<string | undefined>) {
  const match = values.filter(Boolean).join(" ").match(/ม\.?\s*([1-6])/i);
  return match ? `ม.${match[1]}` : undefined;
}

function orderAssignments(items: ScoreAssignment[]) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    const safeA = Number.isFinite(aTime) ? aTime : 0;
    const safeB = Number.isFinite(bTime) ? bTime : 0;
    return safeA - safeB || a.title.localeCompare(b.title, "th");
  });
}

function orderStudentHomeCards(items: StudentHomeCard[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.title.localeCompare(b.title, "th"));
}

function websiteHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function groupAssignments(items: ScoreAssignment[]): AssignmentGroup[] {
  const grouped = new Map<string, AssignmentGroup>();
  orderAssignments(items).forEach((assignment) => {
    const normalizedTitle = assignment.title.trim().toLocaleLowerCase("th");
    const legacyKey = `${normalizedTitle}\u001f${assignment.rawMax}\u001f${assignment.finalMax}`;
    const key = assignment.assignmentGroupId ? `group:${assignment.assignmentGroupId}` : `legacy:${legacyKey}`;
    const current = grouped.get(key);
    if (current) {
      current.assignments.push(assignment);
      if (assignment.classroomId && !current.classroomIds.includes(assignment.classroomId)) current.classroomIds.push(assignment.classroomId);
      return;
    }
    grouped.set(key, {
      key,
      assignmentGroupId: assignment.assignmentGroupId,
      title: assignment.title,
      rawMax: assignment.rawMax,
      finalMax: assignment.finalMax,
      assignments: [assignment],
      classroomIds: assignment.classroomId ? [assignment.classroomId] : [],
      hasMixedValues: false
    });
  });
  return [...grouped.values()].map((group) => ({
    ...group,
    hasMixedValues: group.assignments.some((assignment) => assignment.title !== group.title || assignment.rawMax !== group.rawMax || assignment.finalMax !== group.finalMax)
  }));
}

function buildScoreEntry(assignment: ScoreAssignment, student: StudentRecord, rawScore: number, status: ScoreEntryStatus): ScoreEntry {
  return {
    id: `draft-${assignment.id}-${student.id}`,
    assignmentId: assignment.id,
    studentRecordId: student.id,
    studentId: student.studentId,
    status,
    rawScore,
    rawMax: assignment.rawMax,
    finalScore: status === "scored" ? scaledScore(rawScore, assignment.rawMax, assignment.finalMax) : 0,
    finalMax: assignment.finalMax
  };
}

function findScoreEntry(entries: ScoreEntry[], assignmentId: string, studentId: string) {
  return entries.find((entry) => entry.assignmentId === assignmentId && entry.studentRecordId === studentId);
}

function scoreEntryKey(assignmentId: string, studentId: string) {
  return `${assignmentId}:${studentId}`;
}

function scoreEntryCountsTowardTotal(entry: ScoreEntry | undefined) {
  return entry?.status === "scored" || entry?.status === "expired" || entry?.status === "no_score";
}

function scoreEntryStatusSummary(entry: ScoreEntry | undefined, assignment: ScoreAssignment) {
  if (!entry || entry.status === "ungraded") return "ยังไม่กรอกคะแนน";
  if (entry.status === "leave") return "ลา · ยังให้คะแนนภายหลังได้";
  if (entry.status === "expired") return "0 คะแนน · หมดเวลาส่ง";
  if (entry.status === "no_score") return "0 คะแนน · ไม่มีคะแนน";
  return `เก็บ ${formatScore(entry.finalScore)} / ${formatScore(assignment.finalMax)}`;
}

function studentScoreEntryLabel(entry: ScoreEntry) {
  if (entry.status === "leave") return "ลา · รอให้คะแนน";
  if (entry.status === "expired") return "0 คะแนน · หมดเวลาส่ง";
  if (entry.status === "no_score") return "0 คะแนน · ไม่มีคะแนน";
  return `${formatScore(entry.finalScore)} คะแนน`;
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

function safeFileName(name: string) {
  return name.replace(/[^\w.\-\u0E00-\u0E7F]+/g, "-");
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

function sortStudents(a: StudentRecord, b: StudentRecord) {
  return a.no - b.no || a.studentId.localeCompare(b.studentId);
}

function sortClassrooms(a: Classroom, b: Classroom) {
  const levelOrder = gradeNumber(a.level) - gradeNumber(b.level);
  if (levelOrder) return levelOrder;
  const roomOrder = a.room.localeCompare(b.room, "th", { numeric: true, sensitivity: "base" });
  if (roomOrder) return roomOrder;
  const subjectOrder = a.subject.localeCompare(b.subject, "th", { numeric: true, sensitivity: "base" });
  if (subjectOrder) return subjectOrder;
  return b.academicYear.localeCompare(a.academicYear, "th", { numeric: true });
}

function gradeNumber(level: string) {
  const match = level.match(/([1-6])/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
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
  const studentEntries = student ? entries.filter((entry) => entry.studentRecordId === student.id && entry.status !== "ungraded") : [];
  const totalFinal = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry.finalScore : 0), 0);
  const totalMax = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry.finalMax : 0), 0);
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
