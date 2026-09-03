import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Bell,
  BookOpen,
  CalendarClock,
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
  MessageCircle,
  Plus,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  Moon,
  Pencil,
  Sun,
  X
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
import { exportClassroomScoreExcel, exportClassroomScorePdf } from "./services/pdfExportService";
import {
  isLegacyDemoSubmission,
  mapAnnouncementRow,
  mapAssignmentRow,
  mapChatMessageRow,
  mapClassroomRow,
  mapMaterialDownloadLogRow,
  mapMaterialRow,
  mapScoreEntryRow,
  mapStudentRow,
  mapStudentHomeCardRow,
  mapSubmissionAiReviewRow,
  mapSubmissionRow
} from "./lib/rowMappers";
import type {
  Announcement,
  AppSession,
  ChatMessage,
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

const WorksheetHub = lazy(() => import("./features/worksheets/WorksheetHub"));

type MaterialUpload = { file: File | null; title: string; unit: string; level: string; type: MaterialType };
type ClassroomDraft = { academicYear: string; level: string; room: string; subject: string };
type StudentDraft = { no: string; studentId: string; name: string; gender: string };
type RosterStudent = { no: number; studentId: string; name: string; gender: string };
type AnnouncementDraft = { title: string; body: string; classroomId: string };
type StudentHomeCardDraft = { title: string; description: string; url: string; classroomIds: string[]; showToAll: boolean };
type AssignmentDraft = { title: string; assignmentType: string; rawMax: string; finalMax: string; acceptingSubmissions: boolean; submissionOpenAt: string; submissionCloseAt: string; classroomIds: string[] };
type SubmissionDraft = { assignmentId: string; file: File | null; linkUrl: string; submissionKind: SubmissionKind; memberCodes: string[] };
type AssignmentGroup = { key: string; assignmentGroupId?: string; title: string; assignmentType: string; rawMax: number; finalMax: number; acceptingSubmissions: boolean; submissionOpenAt?: string; submissionCloseAt?: string; assignments: ScoreAssignment[]; classroomIds: string[]; hasMixedValues: boolean };
type ThemeMode = "light" | "dark";
type ScoreAutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
type ProfileRow = { full_name?: string | null; role?: string | null; class_name?: string | null; school_name?: string | null; student_code?: string | null };
type ChatTypingStatus = { role: Role; name: string; at: number };
type ChatTypingPayload = { studentCode?: string; role?: Role; name?: string; isTyping?: boolean };
type SubmissionTypeSection = { type: string; items: SubmissionRecord[] };
type SubmissionReviewSection = { status: SubmissionStatus; total: number; typeSections: SubmissionTypeSection[] };
type SubmissionStudentGroup = { studentId: string; studentName: string; items: SubmissionRecord[]; pendingCount: number; reviewedCount: number };
type WorkViewProps = {
  role: Role;
  classrooms: Classroom[];
  students: StudentRecord[];
  selectedClassroomId: string;
  onClassroomChange: (id: string) => void;
  assignments: ScoreAssignment[];
  allAssignments: ScoreAssignment[];
  submissions: SubmissionRecord[];
  classmates: StudentRecord[];
  currentStudent?: StudentRecord;
  busy: boolean;
  activeClassName: string;
  submitWork: (draft: SubmissionDraft) => Promise<boolean | void>;
  updateSubmission: (id: string, patch: Partial<SubmissionRecord>) => void;
  saveSubmission: (item: SubmissionRecord) => void;
  saveSubmissions: (items: SubmissionRecord[]) => Promise<boolean>;
  deleteSubmission: (item: SubmissionRecord) => void;
  openSubmission: (item: SubmissionRecord) => void;
  getSubmissionPreviewUrl: (item: SubmissionRecord) => Promise<string>;
  requestSubmissionAiGrade: (item: SubmissionRecord, silent?: boolean) => Promise<boolean>;
  onScoresChanged: () => Promise<void>;
  flash: (message: string) => void;
};
type ScoresViewProps = {
  role: Role;
  classrooms: Classroom[];
  selectedClassroomId: string;
  onClassroomChange: (id: string) => void;
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  allAssignments: ScoreAssignment[];
  entries: ScoreEntry[];
  busy: boolean;
  scoreAutoSaveStatus: ScoreAutoSaveStatus;
  activeClassName: string;
  addAssignment: (draft: AssignmentDraft) => Promise<boolean>;
  updateAssignment: (assignments: ScoreAssignment[], draft: AssignmentDraft) => Promise<boolean>;
  deleteAssignment: (assignment: ScoreAssignment) => void;
  deleteAssignmentGroup: (assignments: ScoreAssignment[]) => Promise<boolean>;
  moveAssignment: (assignment: ScoreAssignment, direction: -1 | 1) => void;
  updateScoreDraft: (assignment: ScoreAssignment, student: StudentRecord, value: string) => void;
  updateScoreStatus: (assignment: ScoreAssignment, student: StudentRecord, status: ScoreEntryStatus) => void;
  saveScoreSheet: (assignment: ScoreAssignment) => void;
  saveAllScoreSheets: () => void;
  applySameScoreSheet: (assignment: ScoreAssignment, value: string) => Promise<void>;
};
type BulkSameScorePanelProps = {
  assignments: ScoreAssignment[];
  selectedAssignmentId: string;
  scoreValue: string;
  busy: boolean;
  studentsCount: number;
  onAssignmentChange: (id: string) => void;
  onScoreChange: (value: string) => void;
  onApply: () => void;
};

const SCHOOL_LOGO = `${import.meta.env.BASE_URL}kruthai-logo.png`;
const SCHOOL_NAME = "โรงเรียนเทพศิรินทร์ นนทบุรี";
const NO_CLASS_LABEL = "ยังไม่ได้เลือกห้องเรียน";
const STORAGE_BUCKET = "classroom-files";
const STUDENT_EMAIL_DOMAIN = "students.kruthai.local";
const gradeLevels = ["ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"] as const;
const filters: Array<"ทั้งหมด" | MaterialType | (typeof gradeLevels)[number]> = ["ทั้งหมด", ...gradeLevels, "VIDEO", "PDF"];
const materialTypes: MaterialType[] = ["PDF", "VIDEO", "IMG"];
const submissionStatuses: SubmissionStatus[] = ["ยังไม่ส่ง", "ส่งแล้ว", "รอตรวจ", "ตรวจแล้ว", "ให้แก้ไข", "ส่งช้า"];
const assignmentTypes = ["ทั่วไป", "ใบงาน", "แบบฝึกหัด", "กิจกรรม", "สอบ", "โครงงาน"] as const;
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
  { key: "students", label: "รายชื่อ", icon: Users },
  { key: "chat", label: "แชท", icon: MessageCircle },
  { key: "profile", label: "โปรไฟล์", icon: User }
];

const studentNav: NavItem[] = [
  { key: "home", label: "หน้าหลัก", icon: Home },
  { key: "materials", label: "สื่อการสอน", icon: BookOpen },
  { key: "work", label: "ส่งงาน", icon: CloudUpload },
  { key: "scores", label: "คะแนน", icon: BarChart3 },
  { key: "chat", label: "แชท", icon: MessageCircle },
  { key: "profile", label: "โปรไฟล์", icon: User }
];

const bottomNavKeys: Record<Role, ViewKey[]> = {
  teacher: ["home", "materials", "scores", "work", "students"],
  student: ["home", "materials", "work", "scores", "profile"]
};

function getBottomNavItems(role: Role | undefined, items: NavItem[]) {
  const keys = bottomNavKeys[role ?? "teacher"];
  return keys.flatMap((key) => {
    const item = items.find((candidate) => candidate.key === key);
    return item ? [item] : [];
  });
}

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatTypingByStudent, setChatTypingByStudent] = useState<Record<string, ChatTypingStatus>>({});
  const scoreAutoSaveTimers = useRef(new Map<string, number>());
  const scoreAutoSaveVersions = useRef(new Map<string, number>());
  const chatTypingChannel = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const chatTypingClearTimers = useRef(new Map<string, number>());
  const nav = session?.role === "student" ? studentNav : teacherNav;
  const bottomNav = getBottomNavItems(session?.role, nav);
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
  const activeChatMessages = session?.role === "teacher"
    ? chatMessages
    : chatMessages.filter((message) => message.studentId === session?.studentCode);
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
      const [classroomsResult, materialsResult, announcementsResult, homeCardsResult, downloadLogsResult, studentsResult, assignmentsResult, entriesResult, submissionsResult, submissionAiResult, chatResult] = await Promise.all([
        client.from("classrooms").select("*").order("created_at", { ascending: false }),
        client.from("materials").select("*").order("published_at", { ascending: false }),
        client.from("announcements").select("*").order("published_at", { ascending: false }),
        client.from("student_home_cards").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
        client.from("material_download_logs").select("*").order("downloaded_at", { ascending: false }),
        client.from("students").select("*").order("student_no", { ascending: true }),
        client.from("score_assignments").select("*").order("created_at", { ascending: true }),
        fetchAllScoreEntryRows(),
        client.from("submissions").select("*").order("submitted_at", { ascending: false }),
        client.from("submission_ai_reviews").select("*"),
        client.from("chat_messages").select("*").order("created_at", { ascending: true })
      ]);

      const errors = [classroomsResult, materialsResult, announcementsResult, homeCardsResult, downloadLogsResult, studentsResult, assignmentsResult, entriesResult, submissionsResult, submissionAiResult, chatResult].filter((result) => result.error);
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
      const aiReviewsBySubmission = new Map((submissionAiResult.data ?? []).map(mapSubmissionAiReviewRow).map((review) => [review.submissionId, review]));
      setSubmissionItems((current) => {
        const localReviews = new Map(current.flatMap((item) => {
          if (!item.aiReview?.id.startsWith("queued-")) return [];
          const requestedAt = Date.parse(item.aiReview.requestedAt || "");
          return Number.isFinite(requestedAt) && Date.now() - requestedAt < 3 * 60_000
            ? [[item.id, item.aiReview] as const]
            : [];
        }));
        return (submissionsResult.data ?? [])
          .map(mapSubmissionRow)
          .map((item) => ({ ...item, aiReview: aiReviewsBySubmission.get(item.id) ?? localReviews.get(item.id) }))
          .filter((item) => !isLegacyDemoSubmission(item));
      });
      setChatMessages((chatResult.data ?? []).map(mapChatMessageRow));
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
    if (!session || !submissionItems.some((item) => item.aiReview?.status === "queued" || item.aiReview?.status === "processing")) return;
    const timer = window.setInterval(() => void loadClassroomData(), 8000);
    return () => window.clearInterval(timer);
  }, [session?.role, submissionItems.some((item) => item.aiReview?.status === "queued" || item.aiReview?.status === "processing")]);

  useEffect(() => {
    if (!session || !isSupabaseConfigured || !workingClassroom?.id) return;
    const classroomId = workingClassroom.id;

    const clearTypingStatus = (studentCode: string) => {
      const currentTimer = chatTypingClearTimers.current.get(studentCode);
      if (currentTimer) window.clearTimeout(currentTimer);
      chatTypingClearTimers.current.delete(studentCode);
      setChatTypingByStudent((current) => {
        if (!current[studentCode]) return current;
        const next = { ...current };
        delete next[studentCode];
        return next;
      });
    };

    const channel = supabase!
      .channel(`classroom-chat:${classroomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages", filter: `classroom_id=eq.${classroomId}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const oldRow = payload.old as Record<string, unknown>;
          const deletedId = String(oldRow.id || "");
          if (deletedId) setChatMessages((current) => current.filter((message) => message.id !== deletedId));
          return;
        }

        const nextMessage = mapChatMessageRow(payload.new as Record<string, unknown>);
        setChatMessages((current) => upsertChatMessage(current, nextMessage));
        if (nextMessage.senderRole !== session.role) clearTypingStatus(nextMessage.studentId);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const data = payload as ChatTypingPayload;
        const studentCode = String(data.studentCode || "").trim();
        const senderRole = data.role;
        if (!studentCode || (senderRole !== "teacher" && senderRole !== "student") || senderRole === session.role) return;
        if (session.role === "student" && studentCode !== session.studentCode) return;

        if (!data.isTyping) {
          clearTypingStatus(studentCode);
          return;
        }

        const currentTimer = chatTypingClearTimers.current.get(studentCode);
        if (currentTimer) window.clearTimeout(currentTimer);
        setChatTypingByStudent((current) => ({
          ...current,
          [studentCode]: { role: senderRole, name: String(data.name || (senderRole === "teacher" ? "ครู" : "นักเรียน")), at: Date.now() }
        }));
        const timeout = window.setTimeout(() => clearTypingStatus(studentCode), 3500);
        chatTypingClearTimers.current.set(studentCode, timeout);
      })
      .subscribe();

    chatTypingChannel.current = channel;

    return () => {
      chatTypingChannel.current = null;
      void supabase!.removeChannel(channel);
      chatTypingClearTimers.current.forEach((timer) => window.clearTimeout(timer));
      chatTypingClearTimers.current.clear();
      setChatTypingByStudent({});
    };
  }, [session?.role, session?.studentCode, session?.name, workingClassroom?.id]);

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
      if (session?.role === "student") {
        const optimisticViewCount = item.viewCount + 1;
        setMaterialItems((current) => current.map((material) => material.id === item.id ? { ...material, viewCount: optimisticViewCount } : material));
        try {
          const viewResult = await supabase!.rpc("record_material_view", { p_material_id: item.id });
          if (viewResult.error) throw viewResult.error;
          const nextViewCount = Number(viewResult.data);
          if (Number.isFinite(nextViewCount)) {
            setMaterialItems((current) => current.map((material) => material.id === item.id ? { ...material, viewCount: nextViewCount } : material));
          }
        } catch (viewError) {
          setMaterialItems((current) => current.map((material) => material.id === item.id ? { ...material, viewCount: item.viewCount } : material));
          return flash(userFacingError(viewError, "เปิดไฟล์ได้ แต่บันทึกยอดเข้าชมไม่สำเร็จ"));
        }
      }
      return flash(`เปิดไฟล์ ${item.title} ในแท็บใหม่`);
    }
    flash("ระบบยังไม่ได้เชื่อมต่อ Supabase จึงยังเปิดไฟล์ไม่ได้");
  }

  async function getSubmissionPreviewUrl(item: SubmissionRecord) {
    if (item.linkUrl) {
      const normalized = normalizeExternalUrl(item.linkUrl);
      if (normalized.error || !normalized.url) throw new Error(normalized.error || "ลิงก์งานไม่ถูกต้อง");
      return normalized.url;
    }
    if (!item.filePath) throw new Error(item.fileDeletedAtRaw ? "ไฟล์แนบถูกลบอัตโนมัติหลังตรวจครบ 7 วันแล้ว" : "งานนี้ยังไม่มีไฟล์หรือลิงก์แนบ");
    if (!isSupabaseConfigured) throw new Error("ระบบยังไม่ได้เชื่อมต่อ Supabase จึงยังเปิดไฟล์ไม่ได้");
    const { data, error } = await supabase!.storage.from(STORAGE_BUCKET).createSignedUrl(item.filePath, 60 * 10);
    if (error || !data?.signedUrl) throw error || new Error("เปิดไฟล์งานไม่ได้");
    return data.signedUrl;
  }

  async function openSubmissionFile(item: SubmissionRecord) {
    try {
      const url = await getSubmissionPreviewUrl(item);
      window.open(url, "_blank", "noopener,noreferrer");
      flash(`เปิด${item.linkUrl ? "ลิงก์" : "ไฟล์"}งาน ${item.assignmentTitle} ในแท็บใหม่`);
    } catch (error) {
      flash(userFacingError(error, "เปิดงานที่ส่งมาไม่สำเร็จ"));
    }
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
    const scheduleError = validateAssignmentScheduleDraft(draft);
    if (scheduleError) return flashAndFail(scheduleError, flash);
    const targetClassrooms = classroomItems.filter((classroom) => draft.classroomIds.includes(classroom.id));
    if (!targetClassrooms.length) return flashAndFail("ไม่พบห้องเรียนที่เลือก กรุณาเลือกใหม่", flash);
    const assignmentGroupId = crypto.randomUUID();
    const assignmentType = normalizeAssignmentType(draft.assignmentType);
    const payload = targetClassrooms.map((classroom) => ({ assignment_group_id: assignmentGroupId, title: draft.title.trim(), assignment_type: assignmentType, class_name: classroom.displayName, classroom_id: classroom.id, raw_max: rawMax, final_max: finalMax, accepting_submissions: draft.acceptingSubmissions, submission_open_at: dateTimeInputToIso(draft.submissionOpenAt), submission_close_at: dateTimeInputToIso(draft.submissionCloseAt) }));
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
    const assignmentType = normalizeAssignmentType(draft.assignmentType);
    const rawMax = Number(draft.rawMax);
    const finalMax = Number(draft.finalMax);
    if (!targetAssignments.length) return flashAndFail("เลือกห้องเรียนที่ต้องการแก้ไขอย่างน้อย 1 ห้อง", flash);
    if (!title) return flashAndFail("กรอกชื่องานหรือแบบประเมินก่อน", flash);
    if (!Number.isFinite(rawMax) || rawMax <= 0) return flashAndFail("คะแนนเต็มดิบต้องมากกว่า 0", flash);
    if (!Number.isFinite(finalMax) || finalMax <= 0) return flashAndFail("คะแนนเก็บเต็มต้องมากกว่า 0", flash);
    const scheduleError = validateAssignmentScheduleDraft(draft);
    if (scheduleError) return flashAndFail(scheduleError, flash);
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
        p_assignment_type: assignmentType,
        p_raw_max: rawMax,
        p_final_max: finalMax,
        p_accepting_submissions: draft.acceptingSubmissions,
        p_submission_open_at: dateTimeInputToIso(draft.submissionOpenAt),
        p_submission_close_at: dateTimeInputToIso(draft.submissionCloseAt)
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

  async function deleteAssignments(targetAssignments: ScoreAssignment[]) {
    if (!isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }
    if (!targetAssignments.length) return false;
    const assignmentIds = new Set(targetAssignments.map((assignment) => assignment.id));
    const title = targetAssignments[0].title;
    const classroomCount = new Set(targetAssignments.map((assignment) => assignment.classroomId || assignment.className)).size;
    const scope = classroomCount > 1 ? `ออกจาก ${classroomCount} ห้อง` : "ออกจากห้องเรียนนี้";
    if (!window.confirm(`ลบงานคะแนน "${title}" ${scope} หรือไม่\nคะแนนของนักเรียนในงานนี้จะถูกลบด้วย`)) return false;
    setBusy(true);
    try {
      const autoSaveKeys = new Set(
        [...scoreAutoSaveTimers.current.keys(), ...Object.keys(scoreAutoSaveStates)]
          .filter((key) => assignmentIds.has(key.split(":", 1)[0]))
      );
      cancelScoreAutoSaves(autoSaveKeys);
      const result = await supabase!.from("score_assignments").delete().in("id", [...assignmentIds]);
      if (result.error) throw result.error;
      setAssignments((current) => current.filter((item) => !assignmentIds.has(item.id)));
      setScoreEntries((current) => current.filter((item) => !assignmentIds.has(item.assignmentId)));
      setSubmissionItems((current) => current.map((item) => item.assignmentId && assignmentIds.has(item.assignmentId) ? { ...item, assignmentId: undefined } : item));
      flash(`ลบงานคะแนน "${title}" ${scope}แล้ว`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "ลบงานคะแนนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteAssignment(assignment: ScoreAssignment) {
    await deleteAssignments([assignment]);
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
        final_max: assignment.finalMax,
        source_type: "manual",
        source_id: null
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
        final_max: assignment.finalMax,
        source_type: "manual",
        source_id: null
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

  async function applySameScoreSheet(assignment: ScoreAssignment, value: string) {
    const trimmed = value.trim();
    if (!trimmed) return flash("กรอกคะแนนที่ต้องการให้ทั้งงานก่อน");
    const rawScore = Number(trimmed);
    if (!Number.isFinite(rawScore)) return flash("คะแนนต้องเป็นตัวเลข");
    if (rawScore < 0) return flash("คะแนนต้องไม่ติดลบ");
    if (rawScore > assignment.rawMax) return flash(`คะแนนต้องไม่เกิน ${formatScore(assignment.rawMax)}`);
    if (!activeStudents.length) return flash("ยังไม่มีรายชื่อนักเรียนในห้องนี้");
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    cancelScoreAutoSaves(new Set(activeStudents.map((student) => scoreEntryKey(assignment.id, student.id))));
    const payload: Record<string, unknown>[] = activeStudents.map((student) => ({
      assignment_id: assignment.id,
      student_id: student.id,
      student_code: student.studentId,
      score_status: "scored",
      raw_score: rawScore,
      raw_max: assignment.rawMax,
      final_score: scaledScore(rawScore, assignment.rawMax, assignment.finalMax),
      final_max: assignment.finalMax,
      source_type: "manual",
      source_id: null
    }));
    setBusy(true);
    try {
      const result = await supabase!.from("score_entries").upsert(payload, { onConflict: "assignment_id,student_id" });
      if (result.error) throw result.error;
      await loadClassroomData();
      flash(`ให้คะแนน ${formatScore(rawScore)} กับงาน "${assignment.title}" ทั้งห้องแล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ให้คะแนนเท่ากันทั้งงานไม่สำเร็จ"));
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
        final_max: assignment.finalMax,
        source_type: "manual",
        source_id: null
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

  async function reviewSubmissionAndSyncScores(item: SubmissionRecord) {
    const rawScore = Math.max(0, Math.min(item.rawMax, item.rawScore));
    const finalScore = Math.max(0, Math.min(item.finalMax, scaledScore(rawScore, item.rawMax, item.finalMax)));
    const reviewedItem: SubmissionRecord = { ...item, status: "ตรวจแล้ว", rawScore, finalScore };
    const result = await supabase!.rpc("review_submission_and_sync_scores", {
      p_submission_id: item.id,
      p_status: "ตรวจแล้ว",
      p_raw_score: rawScore,
      p_raw_max: item.rawMax,
      p_final_max: item.finalMax
    });
    if (result.error) throw result.error;
    const savedRow = Array.isArray(result.data) ? result.data[0] : result.data;
    return savedRow ? { ...mapSubmissionRow(savedRow), status: "ตรวจแล้ว" as SubmissionStatus } : reviewedItem;
  }

  async function saveSubmissionReview(item: SubmissionRecord) {
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const savedItem = await reviewSubmissionAndSyncScores(item);
      cancelScoreAutoSaves(new Set(Array.from(scoreAutoSaveTimers.current.keys())));
      setSubmissionItems((current) => current.map((entry) => entry.id === item.id ? savedItem : entry));
      await loadClassroomData();
      const groupSuffix = item.submissionKind === "group" ? ` และสมาชิกกลุ่มรวม ${item.groupMemberCodes.length} คน` : "";
      flash(`ตรวจงานของ ${item.studentName}${groupSuffix} แล้ว คะแนนขึ้นในหน้ากรอกคะแนนเรียบร้อย`);
    } catch (error) {
      flash(userFacingError(error, "บันทึกผลตรวจงานไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function saveSubmissionReviews(items: SubmissionRecord[]) {
    if (!isSupabaseConfigured) {
      flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }
    const uniqueItems = Array.from(new Map(items.map((item) => [item.id, item])).values());
    if (!uniqueItems.length) {
      flash("เลือกงานที่ต้องการบันทึกคะแนนก่อน");
      return false;
    }
    setBusy(true);
    try {
      const results = await Promise.allSettled(uniqueItems.map(reviewSubmissionAndSyncScores));
      const savedItems = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      const savedById = new Map(savedItems.map((item) => [item.id, item]));
      cancelScoreAutoSaves(new Set(Array.from(scoreAutoSaveTimers.current.keys())));
      setSubmissionItems((current) => current.map((item) => savedById.get(item.id) ?? item));
      await loadClassroomData();
      const failedCount = results.length - savedItems.length;
      if (failedCount) {
        flash(`บันทึกสำเร็จ ${savedItems.length} งาน และไม่สำเร็จ ${failedCount} งาน กรุณาตรวจคะแนนแล้วลองอีกครั้ง`);
        return false;
      }
      flash(`บันทึกคะแนน ${savedItems.length} งานแล้ว คะแนนขึ้นในหน้ากรอกคะแนนเรียบร้อย`);
      return true;
    } catch (error) {
      flash(userFacingError(error, "บันทึกคะแนนหลายงานไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteSubmissionRecord(item: SubmissionRecord) {
    if (!window.confirm(`ลบรายการส่งงาน "${item.assignmentTitle}" ของ ${item.studentName}${item.filePath ? " พร้อมไฟล์ที่อัปโหลด" : ""} หรือไม่`)) return;
    if (!isSupabaseConfigured) return flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
    setBusy(true);
    try {
      const client = supabase!;
      if (item.filePath) {
        const removed = await client.storage.from(STORAGE_BUCKET).remove([item.filePath]);
        if (removed.error) throw new Error(`ลบไฟล์ที่นักเรียนอัปโหลดไม่สำเร็จ: ${removed.error.message}`);
      }
      const result = await client.from("submissions").delete().eq("id", item.id);
      if (result.error) throw result.error;
      setSubmissionItems((current) => current.filter((submission) => submission.id !== item.id));
      flash(`ลบงานของ ${item.studentName}${item.filePath ? "และไฟล์ที่อัปโหลด" : ""}แล้ว`);
    } catch (error) {
      flash(userFacingError(error, "ลบรายการส่งงานไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function requestSubmissionAiGrade(item: SubmissionRecord, silent = false) {
    if (!isSupabaseConfigured) {
      if (!silent) flash("ระบบยังไม่ได้เชื่อมต่อ Supabase");
      return false;
    }
    try {
      const authResult = await supabase!.auth.getSession();
      const accessToken = authResult.data.session?.access_token;
      if (!accessToken) throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      const requestedAt = new Date().toISOString();
      setSubmissionItems((current) => current.map((submission) => submission.id === item.id ? {
        ...submission,
        aiReview: {
          id: submission.aiReview?.id || `queued-${submission.id}`,
          submissionId: submission.id,
          status: "queued",
          suggestedRawScore: 0,
          confidence: 0,
          feedback: "",
          model: "",
          errorMessage: "",
          requestedAt
        }
      } : submission));
      const response = await fetch("/.netlify/functions/grade-submission-ai-background", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ submissionId: item.id })
      });
      if (!response.ok && response.status !== 202) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || "ส่งงานให้ AI ตรวจไม่สำเร็จ");
      }
      if (!silent) flash(`ส่งงานของ ${item.studentName} ให้ AI ตรวจแล้ว`);
      return true;
    } catch (error) {
      const message = userFacingError(error, "ส่งงานให้ AI ตรวจไม่สำเร็จ");
      setSubmissionItems((current) => current.map((submission) => submission.id === item.id ? {
        ...submission,
        aiReview: {
          id: submission.aiReview?.id || `failed-${submission.id}`,
          submissionId: submission.id,
          status: "failed",
          suggestedRawScore: 0,
          confidence: 0,
          feedback: "",
          model: submission.aiReview?.model || "",
          errorMessage: message,
          requestedAt: submission.aiReview?.requestedAt
        }
      } : submission));
      flash(message);
      return false;
    }
  }

  async function submitWork(draft: SubmissionDraft) {
    const assignment = activeAssignments.find((item) => item.id === draft.assignmentId);
    if (!assignment) return flash("เลือกงานที่คุณต้องการส่งก่อน");
    const submissionAvailability = assignmentSubmissionAvailability(assignment);
    if (!submissionAvailability.canSubmit) return flash(submissionAvailability.detail);
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
      const savedSubmission = mapSubmissionRow(savedRow);
      setSubmissionItems((current) => [savedSubmission, ...current]);
      flash(`ส่ง${draft.submissionKind === "group" ? "งานกลุ่ม" : "งาน"}เรียบร้อย AI กำลังเตรียมตรวจ`);
      await requestSubmissionAiGrade(savedSubmission, true);
    } catch (error) {
      flash(userFacingError(error, "ส่งงานไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
    return true;
  }

  async function sendChatMessage(student: StudentRecord | undefined, body: string) {
    if (!body.trim()) return flashAndFail("พิมพ์ข้อความก่อนส่ง", flash);
    if (!isSupabaseConfigured) return flashAndFail("ระบบยังไม่ได้เชื่อมต่อ Supabase", flash);
    if (!session) return flashAndFail("กรุณาเข้าสู่ระบบก่อนส่งข้อความ", flash);
    const targetStudent = session.role === "teacher" ? student : currentStudent;
    if (!targetStudent?.studentId) return flashAndFail(session.role === "teacher" ? "เลือกนักเรียนก่อนส่งข้อความ" : "ไม่พบข้อมูลนักเรียนของคุณ", flash);
    setBusy(true);
    try {
      const result = await supabase!
        .from("chat_messages")
        .insert({
          student_code: targetStudent.studentId,
          student_name: targetStudent.name || session.name,
          classroom_id: targetStudent.classroomId || workingClassroom?.id || null,
          sender_role: session.role,
          body: body.trim(),
          is_read_by_teacher: session.role === "teacher",
          is_read_by_student: session.role === "student"
        })
        .select("*")
        .single();
      if (result.error) throw result.error;
      setChatMessages((current) => upsertChatMessage(current, mapChatMessageRow(result.data)));
      sendChatTyping(targetStudent, false);
      return true;
    } catch (error) {
      flash(userFacingError(error, "ส่งข้อความไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function sendChatTyping(student: StudentRecord | undefined, isTyping: boolean) {
    if (!session || !chatTypingChannel.current) return;
    const targetStudent = session.role === "teacher" ? student : currentStudent;
    if (!targetStudent?.studentId) return;
    void chatTypingChannel.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        studentCode: targetStudent.studentId,
        role: session.role,
        name: session.name,
        isTyping
      } satisfies ChatTypingPayload
    });
  }

  async function markChatThreadRead(studentCode: string) {
    if (!isSupabaseConfigured || session?.role !== "teacher" || !studentCode.trim()) return;
    try {
      const result = await supabase!
        .from("chat_messages")
        .update({ is_read_by_teacher: true })
        .eq("student_code", studentCode)
        .eq("sender_role", "student")
        .eq("is_read_by_teacher", false)
        .select("id");
      if (result.error) throw result.error;
      const ids = new Set((result.data ?? []).map((row) => String(row.id)));
      if (ids.size) {
        setChatMessages((current) => current.map((message) => ids.has(message.id) ? { ...message, isReadByTeacher: true } : message));
      }
    } catch (error) {
      flash(userFacingError(error, "อัปเดตสถานะอ่านข้อความไม่สำเร็จ"));
    }
  }

  if (!session) {
    return <Auth role={role} theme={theme} busy={busy} onRole={setRole} onTheme={() => setTheme((current) => current === "light" ? "dark" : "light")} onLogin={login} onResetPassword={requestPasswordReset} toast={toast} />;
  }

  return (
    <div className={`app-shell role-${session.role}`}>
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
            <button className={`mobile-chat-button ${view === "chat" ? "active" : ""}`} type="button" onClick={() => setView("chat")} title="แชท"><MessageCircle aria-hidden /><span>แชท</span></button>
            <button className="theme-toggle-button" type="button" onClick={() => setTheme((current) => current === "light" ? "dark" : "light")} title="เปลี่ยนธีม">{theme === "light" ? <Moon aria-hidden /> : <Sun aria-hidden />}<span>{theme === "light" ? "โทนมืด" : "โทนสว่าง"}</span></button>
            {session.role === "teacher" && <button className={`mobile-profile-button ${view === "profile" ? "active" : ""}`} type="button" onClick={() => setView("profile")} title="โปรไฟล์"><User aria-hidden /><span>โปรไฟล์</span></button>}
            <button className="mobile-logout-button" onClick={logout} title="ออกจากระบบ"><LogOut aria-hidden /><span>ออกจากระบบ</span></button>
          </div>
        </header>
        <section className={`content-area ${view === "scores" ? "score-content-area" : ""}`}>
          {loadingData && <div className="toast">กำลังโหลดข้อมูล...</div>}
          {view === "home" && <HomeView session={session} setView={setView} materials={session.role === "teacher" ? materialItems : activeMaterials} classrooms={classroomItems} students={session.role === "teacher" ? students : activeStudents} submissions={session.role === "teacher" ? submissionItems : activeSubmissions} assignments={session.role === "teacher" ? assignments : activeAssignments} entries={scoreEntries} announcements={session.role === "teacher" ? announcementItems : activeAnnouncements} homeCards={activeStudentHomeCards} busy={busy} addAnnouncement={addAnnouncement} deleteAnnouncement={deleteAnnouncement} saveHomeCard={saveStudentHomeCard} toggleHomeCard={toggleStudentHomeCard} deleteHomeCard={deleteStudentHomeCard} moveHomeCard={moveStudentHomeCard} />}
          {view === "materials" && <MaterialsView role={session.role} session={session} currentStudent={currentStudent} materials={activeMaterials} logs={activeDownloadLogs} busy={busy} flash={flash} onOpen={openMaterial} onDownload={downloadMaterial} onUpload={uploadMaterial} onDelete={deleteMaterial} onDeleteLog={deleteMaterialDownloadLog} />}
          {view === "scores" && <ScoresView role={session.role} classrooms={classroomItems} selectedClassroomId={effectiveSelectedClassroomId} onClassroomChange={setSelectedClassroomId} students={activeStudents} assignments={activeAssignments} allAssignments={orderAssignments(assignments)} entries={scoreEntries} busy={busy} scoreAutoSaveStatus={scoreAutoSaveStatus} activeClassName={activeClassName} addAssignment={addAssignment} updateAssignment={updateAssignmentDetails} deleteAssignment={deleteAssignment} deleteAssignmentGroup={deleteAssignments} moveAssignment={moveAssignment} updateScoreDraft={updateScoreDraft} updateScoreStatus={updateScoreStatus} saveScoreSheet={saveScoreSheet} saveAllScoreSheets={saveAllScoreSheets} applySameScoreSheet={applySameScoreSheet} />}
          {view === "work" && <WorkView role={session.role} classrooms={classroomItems} students={session.role === "teacher" ? students : classroomPeers} selectedClassroomId={effectiveSelectedClassroomId} onClassroomChange={setSelectedClassroomId} assignments={activeAssignments} allAssignments={orderAssignments(assignments)} submissions={activeSubmissions} classmates={classroomPeers} currentStudent={currentStudent} busy={busy} activeClassName={activeClassName} submitWork={submitWork} updateSubmission={updateSubmissionDraft} saveSubmission={saveSubmissionReview} saveSubmissions={saveSubmissionReviews} deleteSubmission={deleteSubmissionRecord} openSubmission={openSubmissionFile} getSubmissionPreviewUrl={getSubmissionPreviewUrl} requestSubmissionAiGrade={requestSubmissionAiGrade} onScoresChanged={async () => { await loadClassroomData(); }} flash={flash} />}
          {view === "students" && <StudentsView classrooms={classroomItems} selectedClassroom={selectedClassroom} selectedClassroomId={effectiveSelectedClassroomId} students={activeStudents} assignments={activeAssignments} entries={scoreEntries} submissions={activeSubmissions} downloadLogs={activeDownloadLogs} busy={busy} flash={flash} addClassroom={addClassroom} deleteClassroom={deleteClassroom} selectClassroom={setSelectedClassroomId} addStudent={addStudent} deleteStudent={deleteStudent} deleteStudents={deleteStudentsBatch} uploadRosterFile={uploadRosterFile} createStudentAccount={createStudentAccount} />}
          {view === "chat" && <ChatView role={session.role} classrooms={classroomItems} selectedClassroomId={effectiveSelectedClassroomId} onClassroomChange={setSelectedClassroomId} students={activeStudents} currentStudent={currentStudent} messages={activeChatMessages} typingByStudent={chatTypingByStudent} busy={busy} sendMessage={sendChatMessage} sendTyping={sendChatTyping} markThreadRead={markChatThreadRead} />}
          {view === "profile" && <ProfileView session={session} busy={busy} changePassword={changePassword} />}
        </section>
      </main>
      <nav className="bottom-nav">{bottomNav.map((item) => <NavButton key={item.key} item={item} active={view === item.key} onClick={() => setView(item.key)} />)}</nav>
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
  return <button className={active ? "active" : ""} data-nav-key={item.key} onClick={onClick} title={item.label} type="button"><Icon aria-hidden /><span>{item.label}</span></button>;
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

function ChatView({ role, classrooms, selectedClassroomId, onClassroomChange, students, currentStudent, messages, typingByStudent, busy, sendMessage, sendTyping, markThreadRead }: { role: Role; classrooms: Classroom[]; selectedClassroomId: string; onClassroomChange: (id: string) => void; students: StudentRecord[]; currentStudent?: StudentRecord; messages: ChatMessage[]; typingByStudent: Record<string, ChatTypingStatus>; busy: boolean; sendMessage: (student: StudentRecord | undefined, body: string) => Promise<boolean>; sendTyping: (student: StudentRecord | undefined, isTyping: boolean) => void; markThreadRead: (studentCode: string) => void }) {
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [draft, setDraft] = useState("");
  const typingTimer = useRef<number | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const teacherMode = role === "teacher";
  const selectedStudent = teacherMode ? students.find((student) => student.id === selectedStudentId) || students[0] : currentStudent;
  const selectedTyping = selectedStudent?.studentId ? typingByStudent[selectedStudent.studentId] : undefined;
  const visibleMessages = useMemo(() => {
    if (!selectedStudent?.studentId) return [];
    return messages
      .filter((message) => message.studentId === selectedStudent.studentId)
      .sort((a, b) => Date.parse(a.createdAtRaw) - Date.parse(b.createdAtRaw));
  }, [messages, selectedStudent?.studentId]);
  const unreadByStudent = useMemo(() => {
    const counts = new Map<string, number>();
    messages.forEach((message) => {
      if (message.senderRole === "student" && !message.isReadByTeacher) {
        counts.set(message.studentId, (counts.get(message.studentId) ?? 0) + 1);
      }
    });
    return counts;
  }, [messages]);

  useEffect(() => {
    if (!teacherMode) return;
    if (selectedStudentId && students.some((student) => student.id === selectedStudentId)) return;
    setSelectedStudentId(students[0]?.id || "");
  }, [selectedStudentId, students, teacherMode]);

  useEffect(() => {
    if (teacherMode && selectedStudent?.studentId) markThreadRead(selectedStudent.studentId);
  }, [selectedStudent?.studentId, teacherMode]);

  useEffect(() => {
    const element = messageListRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
  }, [visibleMessages.length, selectedStudent?.studentId, selectedTyping?.at]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      sendTyping(selectedStudent, false);
    };
  }, [selectedStudent?.studentId]);

  function updateDraft(value: string) {
    setDraft(value);
    sendTyping(selectedStudent, Boolean(value.trim()));
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => sendTyping(selectedStudent, false), 1800);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendTyping(selectedStudent, false);
    const ok = await sendMessage(selectedStudent, draft);
    if (ok) setDraft("");
  }

  const headerTitle = teacherMode ? selectedStudent?.name || "เลือกนักเรียน" : "ครูไต๋";
  const headerNote = selectedTyping ? `${selectedTyping.name} กำลังพิมพ์...` : teacherMode ? selectedStudent?.studentId ? `รหัส ${selectedStudent.studentId}` : "เลือกนักเรียนเพื่อเริ่มแชท" : "ส่งข้อความถึงครู";

  return (
    <div className="page-stack">
      <PageHeader title="แชท" eyebrow={teacherMode ? "ข้อความจากนักเรียน" : "พูดคุยกับครู"} />
      <section className="panel chat-panel">
        {teacherMode && <div className="chat-classroom-picker"><TeacherClassroomSelector classrooms={classrooms} selectedClassroomId={selectedClassroomId} onChange={onClassroomChange} /></div>}
        <div className="chat-layout">
          {teacherMode && (
            <aside className="chat-roster" aria-label="รายชื่อนักเรียนในแชท">
              {students.length ? students.map((student) => {
                const unread = unreadByStudent.get(student.studentId) ?? 0;
                const latest = [...messages].reverse().find((message) => message.studentId === student.studentId);
                const typing = typingByStudent[student.studentId];
                return <button className={selectedStudent?.id === student.id ? "active" : ""} type="button" onClick={() => setSelectedStudentId(student.id)} key={student.id}><div><strong>{student.no ? `${student.no}. ` : ""}{student.name}</strong><span className={typing ? "chat-typing-text" : ""}>{typing ? "กำลังพิมพ์..." : latest?.body || "ยังไม่มีข้อความ"}</span></div>{unread > 0 && <b>{unread}</b>}</button>;
              }) : <EmptyState title="ยังไม่มีรายชื่อในห้องนี้" body="เลือกห้องเรียนที่มีรายชื่อนักเรียนก่อนเปิดแชท" />}
            </aside>
          )}
          <div className="chat-thread">
            <header className="chat-thread-head"><div><strong>{headerTitle}</strong><span>{headerNote}</span></div><MessageCircle aria-hidden /></header>
            <div className="chat-message-list" ref={messageListRef}>
              {selectedStudent ? visibleMessages.length ? visibleMessages.map((message) => <article className={`chat-bubble ${message.senderRole === role ? "mine" : "theirs"}`} key={message.id}><p>{message.body}</p><span>{message.senderRole === "teacher" ? "ครู" : message.studentName} · {message.createdAt}</span></article>) : <EmptyState title="ยังไม่มีข้อความ" body={teacherMode ? "พิมพ์ข้อความเพื่อเริ่มคุยกับนักเรียนคนนี้" : "ส่งคำถามถึงครูได้จากช่องด้านล่าง"} /> : <EmptyState title="เลือกห้องแชท" body="เลือกนักเรียนจากรายชื่อด้านซ้ายก่อนตอบข้อความ" />}
              {selectedTyping && <div className="chat-typing-indicator"><span></span><span></span><span></span><b>{selectedTyping.name} กำลังพิมพ์...</b></div>}
            </div>
            <form className="chat-compose" onSubmit={submit}>
              <input value={draft} onChange={(event) => updateDraft(event.target.value)} placeholder={selectedStudent ? "พิมพ์ข้อความ..." : "เลือกนักเรียนก่อน"} disabled={busy || !selectedStudent} />
              <button className="primary-button" disabled={busy || !selectedStudent || !draft.trim()}><Send aria-hidden />ส่ง</button>
            </form>
          </div>
        </div>
      </section>
    </div>
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

function ScoresView({ role, classrooms, selectedClassroomId, onClassroomChange, students, assignments, allAssignments, entries, busy, scoreAutoSaveStatus, activeClassName, addAssignment, updateAssignment, deleteAssignment, deleteAssignmentGroup, moveAssignment, updateScoreDraft, updateScoreStatus, saveScoreSheet, saveAllScoreSheets, applySameScoreSheet }: ScoresViewProps) {
  const [draft, setDraft] = useState<AssignmentDraft>({ title: "", assignmentType: "ทั่วไป", rawMax: "", finalMax: "", acceptingSubmissions: true, submissionOpenAt: "", submissionCloseAt: "", classroomIds: selectedClassroomId ? [selectedClassroomId] : [] });
  const [editingGroupKey, setEditingGroupKey] = useState("");
  const [editDraft, setEditDraft] = useState<AssignmentDraft | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [mode, setMode] = useState<"raw" | "scaled">("raw");
  const [teacherView, setTeacherView] = useState<"add" | "entry" | "overview">("add");
  const [sameScoreAssignmentId, setSameScoreAssignmentId] = useState("");
  const [sameScoreValue, setSameScoreValue] = useState("");
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
  const sameScoreAssignment = assignments.find((assignment) => assignment.id === sameScoreAssignmentId) || selected;
  const editingGroup = assignmentGroups.find((group) => group.key === editingGroupKey);
  const note = selected ? `คะแนนดิบเต็ม ${formatScore(selected.rawMax)} หารเป็นคะแนนเก็บ ${formatScore(selected.finalMax)}` : "สร้างงานคะแนนก่อน";

  useEffect(() => {
    setDraft((current) => ({ ...current, classroomIds: selectedClassroomId ? [selectedClassroomId] : [] }));
  }, [selectedClassroomId]);

  useEffect(() => {
    if (!editingGroupKey) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) closeAssignmentEditor();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, editingGroupKey]);

  useEffect(() => {
    if (!assignments.length) {
      setSameScoreAssignmentId("");
      return;
    }
    if (!assignments.some((assignment) => assignment.id === sameScoreAssignmentId)) setSameScoreAssignmentId(assignments[0].id);
  }, [assignments, sameScoreAssignmentId]);

  function toggleNewAssignmentClassroom(classroomId: string) {
    setDraft((current) => {
      if (current.classroomIds.includes(classroomId)) return { ...current, classroomIds: current.classroomIds.filter((id) => id !== classroomId) };
      return { ...current, classroomIds: [...current.classroomIds, classroomId] };
    });
  }

  function toggleEditAssignmentClassroom(classroomId: string) {
    setEditDraft((current) => {
      if (!current) return current;
      if (current.classroomIds.includes(classroomId)) return { ...current, classroomIds: current.classroomIds.filter((id) => id !== classroomId) };
      const assignment = editingGroup?.assignments.find((item) => item.classroomId === classroomId);
      if (editingGroup?.hasMixedValues && !current.classroomIds.length && assignment) {
        return {
          title: assignment.title,
          assignmentType: assignment.assignmentType,
          rawMax: numericInputValue(assignment.rawMax),
          finalMax: numericInputValue(assignment.finalMax),
          acceptingSubmissions: assignment.acceptingSubmissions,
          submissionOpenAt: isoToDateTimeInput(assignment.submissionOpenAt),
          submissionCloseAt: isoToDateTimeInput(assignment.submissionCloseAt),
          classroomIds: [classroomId]
        };
      }
      return { ...current, classroomIds: [...current.classroomIds, classroomId] };
    });
  }

  function resetNewAssignmentForm() {
    setDraft({ title: "", assignmentType: "ทั่วไป", rawMax: "", finalMax: "", acceptingSubmissions: true, submissionOpenAt: "", submissionCloseAt: "", classroomIds: selectedClassroomId ? [selectedClassroomId] : [] });
  }

  function closeAssignmentEditor() {
    setEditingGroupKey("");
    setEditDraft(null);
  }

  function beginEditAssignment(group: AssignmentGroup) {
    setEditingGroupKey(group.key);
    setEditDraft({
      title: group.hasMixedValues ? "" : group.title,
      assignmentType: group.hasMixedValues ? "ทั่วไป" : group.assignmentType,
      rawMax: group.hasMixedValues ? "" : numericInputValue(group.rawMax),
      finalMax: group.hasMixedValues ? "" : numericInputValue(group.finalMax),
      acceptingSubmissions: group.hasMixedValues ? true : group.acceptingSubmissions,
      submissionOpenAt: group.hasMixedValues ? "" : isoToDateTimeInput(group.submissionOpenAt),
      submissionCloseAt: group.hasMixedValues ? "" : isoToDateTimeInput(group.submissionCloseAt),
      classroomIds: group.hasMixedValues ? [] : group.classroomIds
    });
  }

  async function submitNewAssignment() {
    const ok = await addAssignment(draft);
    if (!ok) return;
    resetNewAssignmentForm();
  }

  async function submitEditedAssignment() {
    if (!editingGroup || !editDraft) return;
    const selectedAssignments = editingGroup.assignments.filter((assignment) => assignment.classroomId && editDraft.classroomIds.includes(assignment.classroomId));
    const ok = await updateAssignment(selectedAssignments, editDraft);
    if (!ok) return;
    closeAssignmentEditor();
  }

  async function submitSameScore() {
    if (!sameScoreAssignment) return;
    await applySameScoreSheet(sameScoreAssignment, sameScoreValue);
    setSameScoreValue("");
  }

  async function removeAssignmentGroup(group: AssignmentGroup) {
    const deleted = await deleteAssignmentGroup(group.assignments);
    if (deleted && editingGroupKey === group.key) closeAssignmentEditor();
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
          <SectionTitle title="เพิ่มงานคะแนน" note="งานที่เพิ่มก่อนจะแสดงก่อน" />
          <AssignmentDraftFields draft={draft} classrooms={classrooms} classroomLegend="เลือกห้องเรียนที่ได้รับงาน" onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} onToggleClassroom={toggleNewAssignmentClassroom} />
          <div className="form-actions">
            <button className="primary-button" disabled={busy} onClick={submitNewAssignment}><Plus aria-hidden />เพิ่มงานคะแนน</button>
          </div>
          <div className="assignment-catalog">
            <div className="assignment-catalog-heading"><SectionTitle title="งานคะแนนที่สร้างแล้ว" note={`${assignmentGroups.length} งาน`} /><div className="created-score-ring" style={{ background: `conic-gradient(var(--ring-fill) 0deg ${scoreRingPercent * 3.6}deg, var(--ring-track) ${scoreRingPercent * 3.6}deg 360deg)` }} aria-label={`สร้างคะแนนแล้ว ${formatScore(totalCreatedScore)} คะแนน`}><div><strong>{formatScore(totalCreatedScore)}</strong><span>คะแนน</span></div></div></div>
            {assignmentGroups.length ? <div className="assignment-type-sections">{groupAssignmentGroupsByType(assignmentGroups).map((section) => <section className="assignment-type-section" key={section.type}><div className="assignment-type-heading"><span className="assignment-type-badge">{section.type}</span><small>{section.groups.length} งาน</small></div><div className="assignment-catalog-list">{section.groups.map((group) => {
              const groupLabel = assignmentGroupLabels.get(group.key);
              const schedule = group.hasMixedValues ? null : assignmentSubmissionAvailability(group.assignments[0]);
              return <article className={`assignment-catalog-item ${editingGroupKey === group.key ? "editing" : ""}`} key={group.key}><div><strong>{group.title}{groupLabel ? ` · ${groupLabel}` : ""}</strong><span>{group.hasMixedValues ? "ค่าคะแนนหรือกำหนดการต่างกันตามห้อง" : `ดิบ ${formatScore(group.rawMax)} → เก็บ ${formatScore(group.finalMax)}`} · {group.assignments.length} ห้อง</span>{schedule && <span className={`assignment-schedule-badge ${schedule.state}`}><CalendarClock aria-hidden />{schedule.label} · {schedule.shortDetail}</span>}<small>{group.assignments.map((assignment) => assignment.className).join(" · ")}</small></div><div className="assignment-catalog-actions"><button className="assignment-edit-button" type="button" disabled={busy} onClick={() => beginEditAssignment(group)} aria-label={`แก้ไข ${group.title}${groupLabel ? ` ${groupLabel}` : ""}`}><Pencil aria-hidden /><span>แก้ไข</span></button><button className="icon-danger assignment-delete-button" type="button" disabled={busy} onClick={() => void removeAssignmentGroup(group)} title={`ลบ ${group.title} ทุกห้อง`} aria-label={`ลบ ${group.title} ทุกห้อง`}><Trash2 aria-hidden /></button></div></article>;
            })}</div></section>)}</div> : <EmptyState title="ยังไม่มีงานคะแนน" body="เพิ่มงานแรกแล้วรายการจะแสดงที่นี่" />}
          </div>
        </section>}
      {teacherView === "entry" &&
        <section className="score-manager score-workspace-panel">
          <SectionTitle title="ตารางกรอกคะแนนทั้งห้อง" note={assignments.length ? `${students.length} คน · ${assignments.length} งาน` : note} />
          <div className="panel-classroom-picker"><TeacherClassroomSelector classrooms={classrooms} selectedClassroomId={selectedClassroomId} onChange={onClassroomChange} /></div>
          {assignments.length ? (
            <>
              {students.length ? <div className="desktop-score-matrix"><div className="score-matrix-scroll"><table className="score-matrix"><thead><tr><th className="matrix-no">เลขที่</th><th className="matrix-id">รหัสนักเรียน</th><th className="matrix-name">ชื่อ-นามสกุล</th>{assignments.map((assignment, index) => <th className="matrix-assignment" key={assignment.id}><div><span className="assignment-type-badge compact">{assignment.assignmentType}</span><strong>{assignment.title}</strong><span>ดิบ {formatScore(assignment.rawMax)} → เก็บ {formatScore(assignment.finalMax)}</span><div className="matrix-header-actions"><button type="button" disabled={busy || index === 0} onClick={() => moveAssignment(assignment, -1)} title={`ย้าย ${assignment.title} ไปก่อนหน้า`} aria-label={`ย้าย ${assignment.title} ไปก่อนหน้า`}><ArrowLeft aria-hidden /></button><button type="button" disabled={busy || index === assignments.length - 1} onClick={() => moveAssignment(assignment, 1)} title={`ย้าย ${assignment.title} ไปถัดไป`} aria-label={`ย้าย ${assignment.title} ไปถัดไป`}><ArrowRight aria-hidden /></button><button className="matrix-delete" type="button" disabled={busy} onClick={() => deleteAssignment(assignment)} title={`ลบ ${assignment.title}`} aria-label={`ลบ ${assignment.title}`}><Trash2 aria-hidden /></button></div></div></th>)}</tr></thead><tbody>{students.map((student) => <tr key={student.id}><td className="matrix-no">{student.no}</td><td className="matrix-id">{student.studentId}</td><th className="matrix-name" scope="row">{student.name}</th>{assignments.map((assignment) => {
                const entry = findScoreEntry(entries, assignment.id, student.id);
                const status = entry?.status ?? "ungraded";
                return <td className={`matrix-score-cell score-status-${status}`} key={assignment.id}><ScoreEntryControls assignment={assignment} student={student} entry={entry} onScore={updateScoreDraft} onStatus={updateScoreStatus} /></td>;
              })}</tr>)}</tbody></table></div><BulkSameScorePanel assignments={assignments} selectedAssignmentId={sameScoreAssignment?.id || ""} scoreValue={sameScoreValue} busy={busy} studentsCount={students.length} onAssignmentChange={setSameScoreAssignmentId} onScoreChange={setSameScoreValue} onApply={() => void submitSameScore()} /><div className="matrix-actions"><div className="matrix-save-copy"><span>กรอกคะแนนดิบ ระบบคำนวณคะแนนเก็บและบันทึกให้อัตโนมัติ</span><ScoreAutoSaveIndicator status={scoreAutoSaveStatus} /></div><button className="primary-button" disabled={busy || !students.length} onClick={saveAllScoreSheets}><Save aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกทั้งหมดตอนนี้"}</button></div></div> : <EmptyState title="ยังไม่มีรายชื่อนักเรียน" body="ไปที่เมนูรายชื่อเพื่อเพิ่มนักเรียนก่อนกรอกคะแนน" />}
              <div className="mobile-score-editor">
                <div className="assignment-list">{assignments.map((assignment, index) => <div className="assignment-order-item" key={assignment.id}><button className={`assignment-chip ${selected?.id === assignment.id ? "active" : ""}`} type="button" onClick={() => setSelectedId(assignment.id)}><span className="assignment-type-badge compact">{assignment.assignmentType}</span>{assignment.title}<span>{formatScore(assignment.rawMax)}{" → "}{formatScore(assignment.finalMax)}</span></button><div><button type="button" disabled={busy || index === 0} onClick={() => moveAssignment(assignment, -1)} aria-label={`ย้าย ${assignment.title} ไปก่อนหน้า`}><ArrowLeft aria-hidden /></button><button type="button" disabled={busy || index === assignments.length - 1} onClick={() => moveAssignment(assignment, 1)} aria-label={`ย้าย ${assignment.title} ไปถัดไป`}><ArrowRight aria-hidden /></button></div></div>)}</div>
                <div className="score-tabs"><button className={mode === "raw" ? "active" : ""} onClick={() => setMode("raw")}>คะแนนดิบ</button><button className={mode === "scaled" ? "active" : ""} onClick={() => setMode("scaled")}>คะแนนที่หารแล้ว</button></div>
                {selected && students.length ? <div className="score-table">{students.map((student) => {
                  const entry = findScoreEntry(entries, selected.id, student.id);
                  const status = entry?.status ?? "ungraded";
                  return <article className={`score-row score-row-wide score-status-${status}`} key={student.id}><div className="student-score-identity"><strong>{student.name}</strong><span>รหัสนักเรียน {student.studentId}</span></div>{mode === "raw" ? <ScoreEntryControls assignment={selected} student={student} entry={entry} onScore={updateScoreDraft} onStatus={updateScoreStatus} /> : <ScoreEntryResult entry={entry} assignment={selected} />}</article>;
                })}</div> : <EmptyState title="ยังไม่มีรายชื่อนักเรียน" body="ไปที่เมนูรายชื่อเพื่อเพิ่มนักเรียนก่อนกรอกคะแนน" />}
                <BulkSameScorePanel assignments={assignments} selectedAssignmentId={sameScoreAssignment?.id || ""} scoreValue={sameScoreValue} busy={busy} studentsCount={students.length} onAssignmentChange={setSameScoreAssignmentId} onScoreChange={setSameScoreValue} onApply={() => void submitSameScore()} />
                <ScoreAutoSaveIndicator status={scoreAutoSaveStatus} />
                <div className="form-actions">{selected && <button className="primary-button" disabled={busy || !students.length} onClick={() => saveScoreSheet(selected)}><Save aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกงานนี้ตอนนี้"}</button>}{selected && <button className="danger-button" disabled={busy} onClick={() => deleteAssignment(selected)}><Trash2 aria-hidden />ลบงานนี้</button>}</div>
              </div>
            </>
          ) : <EmptyState title="ยังไม่มีงานคะแนน" body="เพิ่มงานคะแนนแรก แล้วระบบจะสร้างตารางให้กรอกตามรายชื่อนักเรียน" />}
        </section>}
      {teacherView === "overview" && <TeacherScoreOverview classrooms={classrooms} selectedClassroomId={selectedClassroomId} onClassroomChange={onClassroomChange} students={students} assignments={assignments} entries={entries} onEdit={() => setTeacherView("entry")} />}
      {editingGroup && editDraft && <div className="modal-backdrop assignment-edit-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) closeAssignmentEditor(); }}>
        <section className="assignment-edit-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-edit-title">
          <header className="assignment-edit-modal-header">
            <div><span>แก้ไขงานคะแนน</span><h2 id="assignment-edit-title">{editingGroup.title}</h2><p>เลือกแล้ว {editDraft.classroomIds.length} จาก {editingGroup.assignments.length} ห้อง</p></div>
            <button className="icon-button" type="button" disabled={busy} onClick={closeAssignmentEditor} aria-label="ปิดหน้าต่างแก้ไขงาน"><X aria-hidden /></button>
          </header>
          <div className="assignment-edit-modal-body">
            <AssignmentDraftFields
              draft={editDraft}
              classrooms={classrooms.filter((classroom) => editingGroup.classroomIds.includes(classroom.id))}
              classroomLegend="เลือกห้องเรียนที่ต้องการแก้ไข"
              helpText={editingGroup.hasMixedValues && !editDraft.classroomIds.length ? "งานนี้มีค่าต่างกันตามห้อง เลือกห้องแรกเพื่อโหลดค่าเดิมก่อนแก้ไข" : "ค่าที่แก้ไขจะเปลี่ยนเฉพาะห้องที่ติ๊กเลือก คะแนนนักเรียนเดิมยังอยู่ครบ"}
              autoFocusTitle
              onChange={(patch) => setEditDraft((current) => current ? { ...current, ...patch } : current)}
              onToggleClassroom={toggleEditAssignmentClassroom}
            />
          </div>
          <footer className="assignment-edit-modal-actions">
            <button className="template-button" type="button" disabled={busy} onClick={closeAssignmentEditor}>ยกเลิก</button>
            <button className="primary-button" type="button" disabled={busy || !editDraft.classroomIds.length} onClick={() => void submitEditedAssignment()}><Save aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกการแก้ไข"}</button>
          </footer>
        </section>
      </div>}
    </div>
  );
}

function AssignmentDraftFields({ draft, classrooms, classroomLegend, helpText, autoFocusTitle = false, onChange, onToggleClassroom }: { draft: AssignmentDraft; classrooms: Classroom[]; classroomLegend: string; helpText?: string; autoFocusTitle?: boolean; onChange: (patch: Partial<AssignmentDraft>) => void; onToggleClassroom: (classroomId: string) => void }) {
  return <>
    <div className="form-grid">
      <label className="field">ชื่องาน / แบบประเมิน<input autoFocus={autoFocusTitle} value={draft.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="เช่น ใบงานที่ 1" /></label>
      <label className="field">ประเภทงาน<select value={draft.assignmentType} onChange={(event) => onChange({ assignmentType: event.target.value })}>{assignmentTypes.map((type) => <option value={type} key={type}>{type}</option>)}</select></label>
      <label className="field">คะแนนเต็มดิบ<input type="number" min="1" value={draft.rawMax} onChange={(event) => onChange({ rawMax: event.target.value })} placeholder="เช่น 10" /></label>
      <label className="field">คิดเป็นคะแนนเก็บ<input type="number" min="1" value={draft.finalMax} onChange={(event) => onChange({ finalMax: event.target.value })} placeholder="เช่น 5" /></label>
    </div>
    <fieldset className={`assignment-schedule-fieldset ${draft.acceptingSubmissions ? "is-open" : "is-closed"}`}>
      <legend><CalendarClock aria-hidden />กำหนดการส่งงาน</legend>
      <label className="assignment-accept-toggle"><input type="checkbox" checked={draft.acceptingSubmissions} onChange={(event) => onChange({ acceptingSubmissions: event.target.checked })} /><span><strong>เปิดรับการส่งงาน</strong><small>{draft.acceptingSubmissions ? "นักเรียนส่งได้ตามช่วงเวลาที่กำหนด" : "ปิดรับทันทีทุกห้องที่เลือก"}</small></span></label>
      <div className="assignment-schedule-grid">
        <label className="field">เริ่มรับงาน<input type="datetime-local" value={draft.submissionOpenAt} disabled={!draft.acceptingSubmissions} onChange={(event) => onChange({ submissionOpenAt: event.target.value })} /></label>
        <label className="field">ปิดรับงาน<input type="datetime-local" value={draft.submissionCloseAt} disabled={!draft.acceptingSubmissions} onChange={(event) => onChange({ submissionCloseAt: event.target.value })} /></label>
      </div>
    </fieldset>
    <fieldset className="assignment-classroom-fieldset">
      <legend>{classroomLegend}</legend>
      <div className="classroom-checkbox-grid">{classrooms.map((classroom) => <label className="classroom-checkbox" key={classroom.id}><input type="checkbox" checked={draft.classroomIds.includes(classroom.id)} onChange={() => onToggleClassroom(classroom.id)} /><span>{classroom.displayName}</span></label>)}</div>
      {helpText && <small className="assignment-edit-help">{helpText}</small>}
    </fieldset>
  </>;
}

function BulkSameScorePanel({ assignments, selectedAssignmentId, scoreValue, busy, studentsCount, onAssignmentChange, onScoreChange, onApply }: BulkSameScorePanelProps) {
  const assignment = assignments.find((item) => item.id === selectedAssignmentId) || assignments[0];
  if (!assignment) return null;
  return <div className="bulk-same-score-panel">
    <div>
      <strong>ให้คะแนนเท่ากันทั้งงาน</strong>
      <span>เลือกงาน ใส่คะแนนดิบ แล้วบันทึกให้ {studentsCount} คนในห้องนี้</span>
    </div>
    <label className="field compact-field">งาน<select value={assignment.id} onChange={(event) => onAssignmentChange(event.target.value)}>{assignments.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
    <label className="field compact-field">คะแนนดิบ<input type="number" min="0" max={assignment.rawMax} value={scoreValue} onChange={(event) => onScoreChange(event.target.value)} placeholder={`เต็ม ${formatScore(assignment.rawMax)}`} /></label>
    <button className="primary-button" type="button" disabled={busy || !studentsCount || !scoreValue.trim()} onClick={onApply}><Save aria-hidden />{busy ? "กำลังบันทึก" : "ให้คะแนนทั้งงาน"}</button>
  </div>;
}

function ScoreEntryControls({ assignment, student, entry, onScore, onStatus }: { assignment: ScoreAssignment; student: StudentRecord; entry?: ScoreEntry; onScore: (assignment: ScoreAssignment, student: StudentRecord, value: string) => void; onStatus: (assignment: ScoreAssignment, student: StudentRecord, status: ScoreEntryStatus) => void }) {
  const status = entry?.status ?? "ungraded";
  const acceptsScore = status === "ungraded" || status === "scored";
  const inputValue = status === "scored" ? formatScore(entry?.rawScore ?? 0) : "";
  return <div className={`score-entry-controls score-status-${status}`}>
    <select aria-label={`สถานะ ${assignment.title} ของ ${student.name}`} value={status} onChange={(event) => onStatus(assignment, student, event.target.value as ScoreEntryStatus)}>{scoreEntryStatusOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
    <label className="score-entry-number"><input aria-label={`${assignment.title} ของ ${student.name}`} type="number" min="0" max={assignment.rawMax} value={inputValue} disabled={!acceptsScore} onChange={(event) => onScore(assignment, student, event.target.value)} placeholder={acceptsScore ? "0" : "–"} /><span>/ {formatScore(assignment.rawMax)}</span></label>
    <small>{scoreEntryStatusSummary(entry, assignment)}</small>
    {entry?.sourceType === "worksheet" && <span className="score-source-badge">จากใบงาน</span>}
  </div>;
}

function ScoreEntryResult({ entry, assignment }: { entry?: ScoreEntry; assignment: ScoreAssignment }) {
  const status = entry?.status ?? "ungraded";
  if (status === "scored") return <div className="score-result score-status-scored"><strong>{formatScore(entry?.finalScore ?? 0)}</strong><span>/ {formatScore(assignment.finalMax)}</span>{entry?.sourceType === "worksheet" && <small className="score-source-badge">จากใบงาน</small>}</div>;
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
  const [exportBusy, setExportBusy] = useState<"" | "pdf" | "excel">("");
  const classroom = classrooms.find((item) => item.id === selectedClassroomId);

  async function exportScores(format: "pdf" | "excel") {
    setExportBusy(format);
    try {
      const payload = {
        schoolName: SCHOOL_NAME,
        classroom,
        students,
        assignments,
        entries
      };
      if (format === "pdf") await exportClassroomScorePdf(payload);
      else await exportClassroomScoreExcel(payload);
    } catch (error) {
      window.alert(userFacingError(error, `ส่งออก ${format === "pdf" ? "PDF" : "Excel"} ไม่สำเร็จ`));
    } finally {
      setExportBusy("");
    }
  }

  return <section className="score-manager teacher-score-overview score-workspace-panel"><div className="score-overview-heading"><SectionTitle title="คะแนนรวมทุกงาน" note={`${students.length} คน · ${assignments.length} งาน`} /><div className="score-overview-actions"><button className="template-button" type="button" disabled={Boolean(exportBusy) || !students.length || !assignments.length} onClick={() => void exportScores("pdf")}><FileText aria-hidden />{exportBusy === "pdf" ? "กำลังสร้าง PDF" : "PDF"}</button><button className="template-button" type="button" disabled={Boolean(exportBusy) || !students.length || !assignments.length} onClick={() => void exportScores("excel")}><FileSpreadsheet aria-hidden />{exportBusy === "excel" ? "กำลังสร้าง Excel" : "Excel"}</button><button className="primary-button" type="button" onClick={onEdit}><Pencil aria-hidden />แก้ไขคะแนน</button></div></div><div className="panel-classroom-picker"><TeacherClassroomSelector classrooms={classrooms} selectedClassroomId={selectedClassroomId} onChange={onClassroomChange} /></div>{assignments.length && students.length ? <><div className="desktop-score-overview"><div className="score-matrix-scroll"><table className="score-matrix score-overview-matrix"><thead><tr><th className="matrix-no">เลขที่</th><th className="matrix-id">รหัสนักเรียน</th><th className="matrix-name">ชื่อ-นามสกุล</th>{assignments.map((assignment) => <th className="matrix-assignment overview-assignment" key={assignment.id}><span className="assignment-type-badge compact">{assignment.assignmentType}</span><strong>{assignment.title}</strong><span>เต็ม {formatScore(assignment.finalMax)}</span></th>)}<th className="matrix-total">รวม</th></tr></thead><tbody>{students.map((student) => {
    const studentEntries = assignments.map((assignment) => findScoreEntry(entries, assignment.id, student.id));
    const total = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry?.finalScore ?? 0 : 0), 0);
    const studentTotalMax = assignments.reduce((sum, assignment, index) => sum + (scoreEntryCountsTowardTotal(studentEntries[index]) ? assignment.finalMax : 0), 0);
    return <tr key={student.id}><td className="matrix-no">{student.no}</td><td className="matrix-id">{student.studentId}</td><th className="matrix-name" scope="row">{student.name}</th>{assignments.map((assignment, index) => <td className={`matrix-overview-score score-status-${studentEntries[index]?.status ?? "ungraded"}`} key={assignment.id}><ScoreEntryResult entry={studentEntries[index]} assignment={assignment} /></td>)}<td className="matrix-total"><strong>{formatScore(total)}</strong><span>/ {formatScore(studentTotalMax)}</span></td></tr>;
  })}</tbody></table></div></div><div className="mobile-score-overview-list">{students.map((student) => {
    const studentEntries = assignments.map((assignment) => findScoreEntry(entries, assignment.id, student.id));
    const total = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry?.finalScore ?? 0 : 0), 0);
    const studentTotalMax = assignments.reduce((sum, assignment, index) => sum + (scoreEntryCountsTowardTotal(studentEntries[index]) ? assignment.finalMax : 0), 0);
    return <article className="mobile-score-overview-card" key={student.id}><header><div><strong>{student.no}. {student.name}</strong><span>รหัสนักเรียน {student.studentId}</span></div><div className="mobile-score-total"><strong>{formatScore(total)}</strong><span>/ {formatScore(studentTotalMax)}</span></div></header><div>{assignments.map((assignment, index) => <div className={`mobile-assignment-score score-status-${studentEntries[index]?.status ?? "ungraded"}`} key={assignment.id}><span><span className="assignment-type-badge compact">{assignment.assignmentType}</span>{assignment.title}</span><ScoreEntryResult entry={studentEntries[index]} assignment={assignment} /></div>)}</div></article>;
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
    return <div className={`score-summary-row static score-status-${entry.status}`} key={entry.id}><strong><span className="assignment-type-badge compact">{assignment?.assignmentType || "ทั่วไป"}</span>{assignment?.title || "งานคะแนน"}</strong><span>{studentScoreEntryLabel(entry)}</span></div>;
  })}</div></section></> : <EmptyState title="ยังไม่มีคะแนน" body="เมื่อคุณครูบันทึกคะแนนแล้วจะแสดงที่นี่" />}</div>;
}

function WorkView({ role, classrooms, students, selectedClassroomId, onClassroomChange, assignments, allAssignments, submissions, classmates, currentStudent, busy, activeClassName, submitWork, updateSubmission, saveSubmission, saveSubmissions, deleteSubmission, openSubmission, getSubmissionPreviewUrl, requestSubmissionAiGrade, onScoresChanged, flash }: WorkViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [assignmentId, setAssignmentId] = useState("");
  const [submissionKind, setSubmissionKind] = useState<SubmissionKind>("individual");
  const [deliveryMethod, setDeliveryMethod] = useState<"file" | "link">("file");
  const [linkUrl, setLinkUrl] = useState("");
  const [memberCodes, setMemberCodes] = useState<string[]>([]);
  const [teacherReviewMode, setTeacherReviewMode] = useState<"assignments" | "students">("assignments");
  const [workFeature, setWorkFeature] = useState<"submissions" | "worksheets">("submissions");
  const [previewTarget, setPreviewTarget] = useState<SubmissionRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [scheduleNow, setScheduleNow] = useState(Date.now());
  const previewRequestId = useRef(0);
  const ownCode = currentStudent?.studentId || "";
  const selectableClassmates = classmates.filter((student) => student.studentId !== ownCode);
  const assignmentSections = useMemo(() => groupAssignmentsByType(assignments), [assignments]);
  const assignmentTypeById = useMemo(() => new Map(assignments.map((assignment) => [assignment.id, assignment.assignmentType])), [assignments]);
  const pendingReviewSubmissions = useMemo(() => submissions.filter((submission) => submission.status !== "ตรวจแล้ว"), [submissions]);
  const submissionReviewSections = useMemo(() => groupSubmissionsByStatusAndType(pendingReviewSubmissions, assignmentTypeById), [pendingReviewSubmissions, assignmentTypeById]);
  const selectedAssignment = assignments.find((assignment) => assignment.id === assignmentId) || assignments[0];
  const selectedAvailability = selectedAssignment ? assignmentSubmissionAvailability(selectedAssignment, scheduleNow) : null;
  useEffect(() => {
    if (!assignments.some((assignment) => assignment.id === assignmentId)) {
      const firstOpenAssignment = assignments.find((assignment) => assignmentSubmissionAvailability(assignment).canSubmit);
      setAssignmentId(firstOpenAssignment?.id || assignments[0]?.id || "");
    }
  }, [assignmentId, assignments]);

  useEffect(() => {
    if (role !== "student") return;
    const timer = window.setInterval(() => setScheduleNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [role]);

  useEffect(() => {
    if (!previewTarget) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSubmissionPreview();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewTarget]);

  function closeSubmissionPreview() {
    previewRequestId.current += 1;
    setPreviewTarget(null);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewBusy(false);
  }

  async function showSubmissionPreview(item: SubmissionRecord) {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setPreviewTarget(item);
    setPreviewUrl("");
    setPreviewError("");
    setPreviewBusy(true);
    try {
      const url = await getSubmissionPreviewUrl(item);
      if (previewRequestId.current === requestId) setPreviewUrl(url);
    } catch (error) {
      if (previewRequestId.current === requestId) setPreviewError(userFacingError(error, "เปิดตัวอย่างงานไม่สำเร็จ"));
    } finally {
      if (previewRequestId.current === requestId) setPreviewBusy(false);
    }
  }

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

  const workFeatureSwitch = <div className="work-feature-switch" role="tablist" aria-label="รูปแบบงาน"><button className={workFeature === "submissions" ? "active" : ""} type="button" role="tab" aria-selected={workFeature === "submissions"} onClick={() => setWorkFeature("submissions")}><CloudUpload aria-hidden />{role === "teacher" ? "งานส่ง" : "ส่งไฟล์งาน"}</button><button className={workFeature === "worksheets" ? "active" : ""} type="button" role="tab" aria-selected={workFeature === "worksheets"} onClick={() => setWorkFeature("worksheets")}><BookOpen aria-hidden />สมุดงานออนไลน์</button></div>;

  if (workFeature === "worksheets") {
    return <div className="page-stack"><PageHeader title="สมุดงานออนไลน์" eyebrow={role === "teacher" ? "สร้างและติดตามสมุดงาน" : activeClassName} />{workFeatureSwitch}<Suspense fallback={<div className="worksheet-loading"><span>กำลังเปิดสมุดงานออนไลน์...</span></div>}><WorksheetHub role={role} classrooms={classrooms} students={students} assignments={role === "teacher" ? allAssignments : assignments} currentStudent={currentStudent} onScoresChanged={onScoresChanged} flash={flash} /></Suspense></div>;
  }

  if (role === "teacher") {
    return (
      <div className="page-stack">
        <PageHeader title="ตรวจงาน" eyebrow={activeClassName} />
        {workFeatureSwitch}
        <section className="panel">
          <SectionTitle title="งานรอตรวจ" note={`${pendingReviewSubmissions.length} รายการ`} />
          <div className="panel-classroom-picker"><TeacherClassroomSelector classrooms={classrooms} selectedClassroomId={selectedClassroomId} onChange={onClassroomChange} /></div>
          <div className="review-mode-switch" role="tablist" aria-label="รูปแบบการตรวจงาน"><button className={teacherReviewMode === "assignments" ? "active" : ""} type="button" role="tab" aria-selected={teacherReviewMode === "assignments"} onClick={() => setTeacherReviewMode("assignments")}><ClipboardCheck aria-hidden />ตามงาน</button><button className={teacherReviewMode === "students" ? "active" : ""} type="button" role="tab" aria-selected={teacherReviewMode === "students"} onClick={() => setTeacherReviewMode("students")}><Users aria-hidden />ตามนักเรียน</button></div>
          {pendingReviewSubmissions.length ? teacherReviewMode === "assignments" ? <div className="submission-status-sections">{submissionReviewSections.map((statusSection) => <section className={`submission-status-section ${statusTone(statusSection.status)}`} key={statusSection.status}><div className="submission-status-heading"><div><strong>{statusSection.status}</strong><span>{activeClassName}</span></div><small>{statusSection.total} รายการ</small></div><div className="assignment-type-sections compact">{statusSection.typeSections.map((section) => <section className="assignment-type-section" key={`${statusSection.status}-${section.type}`}><div className="assignment-type-heading"><span className="assignment-type-badge">{section.type}</span><small>{section.items.length} รายการ</small></div><div className="submission-list">{section.items.map((item) => <ReviewCard key={item.id} item={item} busy={busy} updateSubmission={updateSubmission} saveSubmission={saveSubmission} deleteSubmission={deleteSubmission} openSubmission={showSubmissionPreview} requestAiGrade={requestSubmissionAiGrade} />)}</div></section>)}</div></section>)}</div> : <StudentSubmissionReview submissions={pendingReviewSubmissions} busy={busy} updateSubmission={updateSubmission} saveSubmissions={saveSubmissions} deleteSubmission={deleteSubmission} openSubmission={showSubmissionPreview} requestAiGrade={requestSubmissionAiGrade} /> : <EmptyState title="ไม่มีงานรอตรวจ" body="งานที่ตรวจแล้วจะไม่แสดงในหน้านี้ เมื่อมีงานใหม่ส่งเข้ามารายการจะปรากฏอีกครั้ง" />}
        </section>
        {previewTarget && <SubmissionPreviewModal item={previewTarget} url={previewUrl} loading={previewBusy} error={previewError} onClose={closeSubmissionPreview} />}
      </div>
    );
  }
  return (
    <div className="page-stack">
      <PageHeader title="ส่งงาน" eyebrow={activeClassName} />
      {workFeatureSwitch}
      <section className="panel compact-form">
        {assignments.length ? (
          <>
            <label className="field">
              ชื่องาน
              <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}>
                {assignmentSections.map((section) => <optgroup label={section.type} key={section.type}>{section.items.map((assignment) => { const availability = assignmentSubmissionAvailability(assignment, scheduleNow); return <option key={assignment.id} value={assignment.id}>{assignment.title} · {availability.label}</option>; })}</optgroup>)}
              </select>
            </label>
            {selectedAvailability && <div className={`student-assignment-schedule ${selectedAvailability.state}`}><CalendarClock aria-hidden /><div><strong>{selectedAvailability.label}</strong><span>{selectedAvailability.detail}</span></div></div>}
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
            <button className="primary-button full-button" disabled={busy || !selectedAvailability?.canSubmit} onClick={() => void handleSubmitWork()}><CloudUpload aria-hidden />{busy ? "กำลังส่งงาน" : !selectedAvailability?.canSubmit ? selectedAvailability?.label || "ยังไม่เปิดรับ" : submissionKind === "group" ? `ส่งงานกลุ่ม ${memberCodes.length + 1} คน` : "ส่งงาน"}</button>
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

type SubmissionPreviewKind = "image" | "video" | "pdf" | "link" | "document";

function submissionPreviewKind(item: SubmissionRecord): SubmissionPreviewKind {
  if (item.linkUrl) return "link";
  const fileName = item.originalFileName || fileNameFromPath(item.filePath || "");
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "webp"].includes(extension)) return "image";
  if (["mp4", "mov", "m4v", "webm"].includes(extension)) return "video";
  if (extension === "pdf") return "pdf";
  return "document";
}

function SubmissionPreviewModal({ item, url, loading, error, onClose }: { item: SubmissionRecord; url: string; loading: boolean; error: string; onClose: () => void }) {
  const kind = submissionPreviewKind(item);
  const attachmentName = item.linkUrl || item.originalFileName || fileNameFromPath(item.filePath || "") || "งานที่นักเรียนส่ง";
  return (
    <div className="modal-backdrop submission-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="submission-preview-panel" role="dialog" aria-modal="true" aria-labelledby="submission-preview-title">
        <header className="submission-preview-header">
          <div>
            <span>ตัวอย่างงานที่ส่งมา</span>
            <h2 id="submission-preview-title">{item.assignmentTitle}</h2>
            <p>{item.studentName} · รหัสนักเรียน {item.studentId}</p>
          </div>
          <button className="icon-button submission-preview-close" type="button" onClick={onClose} title="ปิดตัวอย่างงาน" aria-label="ปิดตัวอย่างงาน"><X aria-hidden /></button>
        </header>
        <div className="submission-preview-meta"><span className="submission-kind-badge">{item.submissionKind === "group" ? `งานกลุ่ม ${item.groupMemberCodes.length} คน` : "งานเดี่ยว"}</span><span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span><span className="submission-preview-file-name">{attachmentName}</span></div>
        <div className={`submission-preview-stage preview-${kind}`}>
          {loading && <div className="submission-preview-message"><span className="submission-preview-spinner" aria-hidden /><strong>กำลังเตรียมตัวอย่างงาน</strong><span>ระบบกำลังสร้างลิงก์ที่ปลอดภัยสำหรับไฟล์นี้</span></div>}
          {!loading && error && <div className="submission-preview-message error"><FileText aria-hidden /><strong>แสดงตัวอย่างไม่ได้</strong><span>{error}</span></div>}
          {!loading && !error && url && kind === "image" && <img src={url} alt={`งาน ${item.assignmentTitle} ของ ${item.studentName}`} />}
          {!loading && !error && url && kind === "video" && <video src={url} controls preload="metadata" />}
          {!loading && !error && url && kind === "pdf" && <iframe src={url} title={`ตัวอย่าง ${item.assignmentTitle}`} />}
          {!loading && !error && url && kind === "link" && <iframe src={url} title={`ลิงก์งาน ${item.assignmentTitle}`} referrerPolicy="no-referrer" sandbox="allow-forms allow-scripts allow-same-origin" />}
          {!loading && !error && url && kind === "document" && <div className="submission-preview-message"><FileText aria-hidden /><strong>ไฟล์นี้ไม่รองรับการแสดงภายในเว็บ</strong><span>กด “เปิดต้นฉบับ” เพื่อดูไฟล์ด้วยแอปที่รองรับ</span></div>}
        </div>
        <footer className="submission-preview-actions">
          <span>{kind === "link" ? "เว็บไซต์บางแห่งอาจไม่อนุญาตให้แสดงใน popup" : "ตัวอย่างนี้ใช้สำหรับตรวจงานเท่านั้น"}</span>
          <div><button className="template-button" type="button" onClick={onClose}>ปิด</button><button className="primary-button" type="button" disabled={!url || loading} onClick={() => window.open(url, "_blank", "noopener,noreferrer")}><ExternalLink aria-hidden />เปิดต้นฉบับ</button></div>
        </footer>
      </section>
    </div>
  );
}

function StudentSubmissionReview({ submissions, busy, updateSubmission, saveSubmissions, deleteSubmission, openSubmission, requestAiGrade }: { submissions: SubmissionRecord[]; busy: boolean; updateSubmission: (id: string, patch: Partial<SubmissionRecord>) => void; saveSubmissions: (items: SubmissionRecord[]) => Promise<boolean>; deleteSubmission: (item: SubmissionRecord) => void; openSubmission: (item: SubmissionRecord) => void; requestAiGrade: (item: SubmissionRecord) => Promise<boolean> }) {
  const studentGroups = useMemo(() => groupSubmissionsByStudent(submissions).filter((group) => group.pendingCount > 0), [submissions]);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const selectedStudent = studentGroups.find((group) => group.studentId === selectedStudentId) || studentGroups[0];
  const selectedItems = selectedStudent?.items.filter((item) => selectedSubmissionIds.includes(item.id)) ?? [];
  const pendingItems = selectedStudent?.items.filter((item) => item.status !== "ตรวจแล้ว") ?? [];
  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((item) => selectedSubmissionIds.includes(item.id));

  useEffect(() => {
    if (!studentGroups.length) {
      setSelectedStudentId("");
      setSelectedSubmissionIds([]);
      return;
    }
    if (!studentGroups.some((group) => group.studentId === selectedStudentId)) {
      setSelectedStudentId(studentGroups[0].studentId);
      setSelectedSubmissionIds([]);
    }
  }, [selectedStudentId, studentGroups]);

  useEffect(() => {
    const availableIds = new Set(selectedStudent?.items.map((item) => item.id) ?? []);
    setSelectedSubmissionIds((current) => current.filter((id) => availableIds.has(id)));
  }, [selectedStudent]);

  function selectStudent(studentId: string) {
    setSelectedStudentId(studentId);
    setSelectedSubmissionIds([]);
  }

  function toggleSubmission(id: string) {
    setSelectedSubmissionIds((current) => current.includes(id) ? current.filter((itemId) => itemId !== id) : [...current, id]);
  }

  function togglePendingItems() {
    const pendingIds = pendingItems.map((item) => item.id);
    setSelectedSubmissionIds((current) => allPendingSelected
      ? current.filter((id) => !pendingIds.includes(id))
      : Array.from(new Set([...current, ...pendingIds])));
  }

  async function saveSelectedItems() {
    const saved = await saveSubmissions(selectedItems);
    if (saved) setSelectedSubmissionIds([]);
  }

  if (!selectedStudent) return <EmptyState title="ไม่มีงานรอตรวจ" body="รายชื่อนักเรียนจะกลับมาแสดงเมื่อมีงานใหม่ส่งเข้ามา" />;

  return (
    <div className="student-review-layout">
      <aside className="student-review-roster" aria-label="รายชื่อนักเรียนที่ส่งงาน">
        <div className="student-review-roster-heading"><strong>ผู้ส่งงาน</strong><span>{studentGroups.length} คน</span></div>
        <div className="student-review-roster-list">{studentGroups.map((group) => <button className={group.studentId === selectedStudent.studentId ? "active" : ""} type="button" key={group.studentId} onClick={() => selectStudent(group.studentId)}><div><strong>{group.studentName}</strong><span>รหัส {group.studentId}</span></div><div className="student-review-counts"><span className={group.pendingCount ? "pending" : "pass"}>รอตรวจ {group.pendingCount}</span><small>{group.items.length} งาน</small></div></button>)}</div>
      </aside>
      <section className="student-review-detail">
        <div className="student-review-detail-heading"><div><span>งานของนักเรียน</span><strong>{selectedStudent.studentName}</strong><small>รหัสนักเรียน {selectedStudent.studentId}</small></div><div><span className="status-pill pending">รอตรวจ {selectedStudent.pendingCount}</span><span className="status-pill pass">ตรวจแล้ว {selectedStudent.reviewedCount}</span></div></div>
        <div className="student-review-toolbar"><button className="template-button" type="button" disabled={busy || !pendingItems.length} onClick={togglePendingItems}><CheckCircle2 aria-hidden />{allPendingSelected ? "ยกเลิกงานรอตรวจ" : "เลือกงานรอตรวจทั้งหมด"}</button><span>เลือกแล้ว {selectedItems.length} งาน</span></div>
        <div className="student-review-work-list">{selectedStudent.items.map((item) => {
          const checked = selectedSubmissionIds.includes(item.id);
          const retentionNote = submissionFileRetentionNote(item);
          return <article className={`student-review-work ${checked ? "selected" : ""}`} key={item.id}><label className="student-review-work-check"><input type="checkbox" checked={checked} disabled={busy} onChange={() => toggleSubmission(item.id)} /><span className="sr-only">เลือก {item.assignmentTitle}</span></label><div className="student-review-work-info"><div className="submission-title-line"><strong>{item.assignmentTitle}</strong><span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span></div><span>{item.submissionKind === "group" ? `งานกลุ่ม ${item.groupMemberCodes.length} คน` : "งานเดี่ยว"} · {item.submittedAt}</span><SubmissionAiStatus item={item} /><SubmissionMemberList item={item} />{retentionNote && <span className={`submission-retention-note ${item.fileDeletedAtRaw ? "deleted" : ""}`}>{retentionNote}</span>}</div><div className="student-review-work-actions"><button className="icon-button student-review-open" type="button" onClick={() => openSubmission(item)} disabled={!item.filePath && !item.linkUrl} title={item.fileDeletedAtRaw ? "ไฟล์ถูกลบอัตโนมัติแล้ว" : "ดูตัวอย่างงาน"} aria-label={`ดูตัวอย่างงาน ${item.assignmentTitle}`}><Eye aria-hidden /></button><button className="icon-button student-review-ai" type="button" disabled={busy || item.aiReview?.status === "queued" || item.aiReview?.status === "processing"} onClick={() => void requestAiGrade(item)} title="ให้ AI ตรวจงาน" aria-label={`ให้ AI ตรวจ ${item.assignmentTitle}`}><Sparkles aria-hidden /></button><button className="icon-danger student-review-delete" type="button" disabled={busy} onClick={() => deleteSubmission(item)} title={`ลบงาน ${item.assignmentTitle}`} aria-label={`ลบงาน ${item.assignmentTitle} ของ ${item.studentName}`}><Trash2 aria-hidden /></button></div><label className="field student-review-score">คะแนนดิบ<input type="number" min="0" max={item.rawMax} value={numericInputValue(item.rawScore)} onChange={(event) => updateSubmission(item.id, { rawScore: clampScore(event.target.value, item.rawMax) })} placeholder="คะแนน" /><small>เต็ม {formatScore(item.rawMax)} · เก็บ {formatScore(scaledScore(item.rawScore, item.rawMax, item.finalMax))}/{formatScore(item.finalMax)}</small></label></article>;
        })}</div>
        <div className="student-review-savebar"><div><strong>{selectedItems.length ? `พร้อมบันทึก ${selectedItems.length} งาน` : "เลือกงานที่ต้องการให้คะแนน"}</strong><span>แต่ละงานใช้คะแนนเต็มตามที่กำหนดไว้</span></div><button className="primary-button" type="button" disabled={busy || !selectedItems.length} onClick={() => void saveSelectedItems()}><Save aria-hidden />{busy ? "กำลังบันทึก" : "บันทึกงานที่เลือก"}</button></div>
      </section>
    </div>
  );
}

function ReviewCard({ item, busy, updateSubmission, saveSubmission, deleteSubmission, openSubmission, requestAiGrade }: { item: SubmissionRecord; busy: boolean; updateSubmission: (id: string, patch: Partial<SubmissionRecord>) => void; saveSubmission: (item: SubmissionRecord) => void; deleteSubmission: (item: SubmissionRecord) => void; openSubmission: (item: SubmissionRecord) => void; requestAiGrade: (item: SubmissionRecord) => Promise<boolean> }) {
  const isLink = Boolean(item.linkUrl);
  const retentionNote = submissionFileRetentionNote(item);
  const attachmentName = item.filePath ? fileNameFromPath(item.filePath) : item.originalFileName || "ยังไม่มีสิ่งที่แนบ";
  return (
    <article className="submission-card review-card">
      <div>
        <div className="submission-title-line"><strong>{item.assignmentTitle}</strong><span className="submission-kind-badge">{item.submissionKind === "group" ? `งานกลุ่ม ${item.groupMemberCodes.length} คน` : "งานเดี่ยว"}</span></div>
        <div className="student-submission-identity"><span>ผู้ส่ง {item.studentName}</span><small>รหัสนักเรียน {item.studentId}</small></div>
        <SubmissionAiStatus item={item} />
        <SubmissionMemberList item={item} />
        <small>{item.submittedAt}</small>
        <div className="review-file-box">{isLink ? <ExternalLink aria-hidden /> : <FileText aria-hidden />}<div><span>{isLink ? "ลิงก์งาน" : item.fileDeletedAtRaw ? "ไฟล์ถูกลบแล้ว" : "ไฟล์งาน"}</span><strong>{isLink ? item.linkUrl : attachmentName}</strong>{retentionNote && <small className={`submission-retention-note ${item.fileDeletedAtRaw ? "deleted" : ""}`}>{retentionNote}</small>}</div><button className="template-button submission-preview-trigger" type="button" onClick={() => openSubmission(item)} disabled={!item.filePath && !item.linkUrl}><Eye aria-hidden />{item.fileDeletedAtRaw ? "ลบแล้ว" : "ดูตัวอย่าง"}</button></div>
      </div>
      <div className="review-grid">
        <label className="field">สถานะ<select value={item.status} onChange={(event) => updateSubmission(item.id, { status: event.target.value as SubmissionStatus })}>{submissionStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="field">คะแนนดิบ<input type="number" min="0" value={numericInputValue(item.rawScore)} onChange={(event) => updateSubmission(item.id, { rawScore: clampScore(event.target.value, item.rawMax) })} placeholder="0" /></label>
        <label className="field">เต็มดิบ<input type="number" min="1" value={item.rawMax} onChange={(event) => updateSubmission(item.id, { rawMax: positiveNumber(event.target.value, item.rawMax) })} /></label>
        <label className="field">คะแนนเก็บเต็ม<input type="number" min="1" value={item.finalMax} onChange={(event) => updateSubmission(item.id, { finalMax: positiveNumber(event.target.value, item.finalMax) })} /></label>
        <div className="score-result"><strong>{formatScore(scaledScore(item.rawScore, item.rawMax, item.finalMax))}</strong><span>/ {formatScore(item.finalMax)}</span></div>
        <button className="small-primary" disabled={busy} onClick={() => saveSubmission(item)}><Save aria-hidden />บันทึก</button>
        <button className="template-button review-ai-button" disabled={busy || item.aiReview?.status === "queued" || item.aiReview?.status === "processing"} onClick={() => void requestAiGrade(item)}><Sparkles aria-hidden />{item.aiReview?.status === "failed" ? "ลอง AI อีกครั้ง" : "ให้ AI ตรวจ"}</button>
        <button className="danger-button review-delete-button" disabled={busy} onClick={() => deleteSubmission(item)}><Trash2 aria-hidden />ลบรายการ</button>
      </div>
    </article>
  );
}

function SubmissionAiStatus({ item }: { item: SubmissionRecord }) {
  const review = item.aiReview;
  if (!review) return <div className="submission-ai-status idle"><Sparkles aria-hidden /><span>ยังไม่ได้ส่งให้ AI ตรวจ</span></div>;
  if (review.status === "queued" || review.status === "processing") {
    return <div className="submission-ai-status processing"><Sparkles aria-hidden /><span>AI กำลังตรวจงาน</span></div>;
  }
  if (review.status === "completed") {
    return <div className="submission-ai-status completed"><Sparkles aria-hidden /><span>AI ให้ {formatScore(review.suggestedRawScore)}/{formatScore(item.rawMax)} · มั่นใจ {Math.round(review.confidence * 100)}%</span>{review.feedback && <small>{review.feedback}</small>}</div>;
  }
  return <div className="submission-ai-status failed"><Sparkles aria-hidden /><span>AI ตรวจไม่ได้</span>{review.errorMessage && <small>{review.errorMessage}</small>}</div>;
}

function SubmissionMemberList({ item }: { item: SubmissionRecord }) {
  if (item.submissionKind !== "group") return null;
  return <div className="submission-member-list" aria-label="สมาชิกกลุ่ม">{item.groupMemberNames.map((name, index) => <span key={`${item.groupMemberCodes[index] || name}-${index}`}>{name}</span>)}</div>;
}

function StudentsView({ classrooms, selectedClassroom, selectedClassroomId, students, assignments, entries, submissions, downloadLogs, busy, flash, addClassroom, deleteClassroom, selectClassroom, addStudent, deleteStudent, deleteStudents, uploadRosterFile, createStudentAccount }: { classrooms: Classroom[]; selectedClassroom?: Classroom; selectedClassroomId: string; students: StudentRecord[]; assignments: ScoreAssignment[]; entries: ScoreEntry[]; submissions: SubmissionRecord[]; downloadLogs: MaterialDownloadLog[]; busy: boolean; flash: (message: string) => void; addClassroom: (draft: ClassroomDraft) => Promise<boolean>; deleteClassroom: (classroom: Classroom) => void; selectClassroom: (id: string) => void; addStudent: (draft: StudentDraft) => Promise<boolean>; deleteStudent: (student: StudentRecord) => void; deleteStudents: (students: StudentRecord[]) => Promise<boolean>; uploadRosterFile: (file: File | null) => Promise<boolean>; createStudentAccount: (student: StudentRecord, password: string, options?: { silent?: boolean }) => Promise<boolean> }) {
  const [file, setFile] = useState<File | null>(null);
  const [classDraft, setClassDraft] = useState<ClassroomDraft>({ academicYear: "2569", level: "ม.1", room: "", subject: "สังคมศึกษา" });
  const [draft, setDraft] = useState<StudentDraft>({ no: "", studentId: "", name: "", gender: "" });
  const [accountPassword, setAccountPassword] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [detailStudentId, setDetailStudentId] = useState("");
  const selectedStudents = students.filter((student) => selectedStudentIds.includes(student.id));
  const detailStudent = students.find((student) => student.id === detailStudentId);
  const selectedStudentsWithoutAccounts = selectedStudents.filter((student) => !student.authEmail && !student.accountCreatedAt);
  const allStudentsChecked = students.length > 0 && students.every((student) => selectedStudentIds.includes(student.id));
  useEffect(() => {
    setSelectedStudentIds((current) => current.filter((id) => students.some((student) => student.id === id)));
  }, [students]);
  useEffect(() => {
    if (detailStudentId && !students.some((student) => student.id === detailStudentId)) setDetailStudentId("");
  }, [detailStudentId, students]);
  useEffect(() => {
    if (!detailStudentId) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setDetailStudentId("");
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [busy, detailStudentId]);
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
          return <div className="student-preview-row student-preview-row-action" key={student.id}><label className="check-cell"><input type="checkbox" aria-label={`เลือก ${student.name}`} checked={selectedStudentIds.includes(student.id)} disabled={busy} onChange={() => toggleStudentSelection(student)} /></label><span>{student.no}</span><span>{student.studentId}</span><button className="student-detail-trigger" type="button" onClick={() => setDetailStudentId(student.id)} aria-label={`ดูข้อมูลทั้งหมดของ ${student.name}`}>{student.name}</button><span className={`status-pill ${hasAccount ? "pass" : "pending"}`}>{hasAccount ? "มีบัญชีแล้ว" : "ยังไม่สร้าง"}</span><button className="small-primary account-button" disabled={busy} onClick={() => createStudentAccount(student, accountPassword)} title="สร้างหรือรีเซ็ตรหัสบัญชีนักเรียน"><UserPlus aria-hidden />บัญชี</button><button className="icon-danger" disabled={busy} onClick={() => deleteStudent(student)} title="ลบรายชื่อ"><Trash2 aria-hidden /></button></div>;
        })}</div> : <EmptyState title="ยังไม่มีรายชื่อ" body="เพิ่มรายชื่อด้วยฟอร์มด้านบน หรืออัปโหลดไฟล์เก็บไว้ก่อน" />}
      </section>
      {detailStudent && <StudentDetailModal student={detailStudent} classroom={selectedClassroom} assignments={assignments} entries={entries} submissions={submissions} downloadLogs={downloadLogs} busy={busy} onClose={() => setDetailStudentId("")} onAccount={() => void createStudentAccount(detailStudent, accountPassword)} onDelete={() => deleteStudent(detailStudent)} />}
    </div>
  );
}

function StudentDetailModal({ student, classroom, assignments, entries, submissions, downloadLogs, busy, onClose, onAccount, onDelete }: { student: StudentRecord; classroom?: Classroom; assignments: ScoreAssignment[]; entries: ScoreEntry[]; submissions: SubmissionRecord[]; downloadLogs: MaterialDownloadLog[]; busy: boolean; onClose: () => void; onAccount: () => void; onDelete: () => void }) {
  const hasAccount = Boolean(student.authEmail || student.accountCreatedAt);
  const studentEntries = entries.filter((entry) => entry.studentRecordId === student.id || entry.studentId === student.studentId);
  const entryByAssignmentId = new Map(studentEntries.map((entry) => [entry.assignmentId, entry]));
  const recordedEntries = studentEntries.filter((entry) => entry.status !== "ungraded");
  const countableEntries = recordedEntries.filter(scoreEntryCountsTowardTotal);
  const totalScore = countableEntries.reduce((sum, entry) => sum + entry.finalScore, 0);
  const totalMax = countableEntries.reduce((sum, entry) => sum + entry.finalMax, 0);
  const studentSubmissions = submissions.filter((submission) => submission.studentId === student.studentId || submission.groupMemberCodes.includes(student.studentId));
  const studentDownloads = downloadLogs.filter((log) => log.studentId === student.studentId);
  const accountDate = student.accountCreatedAt ? new Date(student.accountCreatedAt) : null;
  const accountDateLabel = accountDate && !Number.isNaN(accountDate.getTime()) ? accountDate.toLocaleDateString("th-TH", { dateStyle: "medium" }) : "";
  return <div className="modal-backdrop student-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) onClose(); }}>
    <section className="student-detail-modal" role="dialog" aria-modal="true" aria-labelledby="student-detail-title">
      <header className="student-detail-header"><div><span>ข้อมูลนักเรียน</span><h2 id="student-detail-title">{student.name}</h2><p>รหัสนักเรียน {student.studentId}</p></div><button className="icon-button" type="button" disabled={busy} onClick={onClose} aria-label="ปิดข้อมูลนักเรียน"><X aria-hidden /></button></header>
      <div className="student-detail-body">
        <section className="student-detail-identity" aria-label="ข้อมูลประจำตัว">
          <div><span>เลขที่</span><strong>{student.no || "-"}</strong></div><div><span>ห้องเรียน</span><strong>{classroom?.displayName || student.className}</strong></div><div><span>เพศ / หมายเหตุ</span><strong>{student.gender || "-"}</strong></div><div><span>บัญชี</span><strong className={hasAccount ? "account-ready" : "account-pending"}>{hasAccount ? "มีบัญชีแล้ว" : "ยังไม่สร้าง"}</strong>{accountDateLabel && <small>สร้างเมื่อ {accountDateLabel}</small>}</div>
        </section>
        <section className="student-detail-section">
          <div className="student-detail-section-heading"><div><BarChart3 aria-hidden /><strong>คะแนนทั้งหมด</strong></div><span>{formatScore(totalScore)} / {formatScore(totalMax)} คะแนน</span></div>
          {assignments.length ? <div className="student-detail-list student-detail-score-list">{assignments.map((assignment) => { const entry = entryByAssignmentId.get(assignment.id); return <div key={assignment.id}><span><b>{assignment.title}</b><small>{assignment.assignmentType}</small></span><strong>{entry && entry.status !== "ungraded" ? studentScoreEntryLabel(entry) : "ยังไม่มีคะแนน"}</strong></div>; })}</div> : <EmptyState title="ยังไม่มีงานคะแนน" body="เมื่อครูเพิ่มงานคะแนน รายการจะแสดงที่นี่" />}
        </section>
        <section className="student-detail-section">
          <div className="student-detail-section-heading"><div><ClipboardCheck aria-hidden /><strong>ประวัติส่งงาน</strong></div><span>{studentSubmissions.length} รายการ</span></div>
          {studentSubmissions.length ? <div className="student-detail-list">{studentSubmissions.map((submission) => <div key={submission.id}><span><b>{submission.assignmentTitle}</b><small>{submission.studentId === student.studentId ? "ผู้ส่งงาน" : "สมาชิกกลุ่ม"} · {submission.submittedAt}</small></span><strong className={`status-text ${statusTone(submission.status)}`}>{submission.status}</strong></div>)}</div> : <EmptyState title="ยังไม่มีประวัติส่งงาน" body="งานที่นักเรียนส่งหรือเข้าร่วมกลุ่มจะแสดงที่นี่" />}
        </section>
        <section className="student-detail-section">
          <div className="student-detail-section-heading"><div><Download aria-hidden /><strong>ประวัติดาวน์โหลดสื่อ</strong></div><span>{studentDownloads.length} รายการ</span></div>
          {studentDownloads.length ? <div className="student-detail-list">{studentDownloads.map((log) => <div key={log.id}><span><b>{log.materialTitle}</b><small>{log.downloadedAt}</small></span></div>)}</div> : <EmptyState title="ยังไม่มีประวัติดาวน์โหลด" body="เมื่อดาวน์โหลดสื่อ รายการจะแสดงที่นี่" />}
        </section>
      </div>
      <footer className="student-detail-actions"><button className="danger-button" type="button" disabled={busy} onClick={onDelete}><Trash2 aria-hidden />ลบรายชื่อ</button><div><button className="template-button" type="button" disabled={busy} onClick={onClose}>ปิด</button><button className="primary-button" type="button" disabled={busy} onClick={onAccount}><UserPlus aria-hidden />{hasAccount ? "รีเซ็ตรหัสบัญชี" : "สร้างบัญชี"}</button></div></footer>
    </section>
  </div>;
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
  return <article className={`material-card material-name-card tone-border-${item.accent}`}><div className="material-title-display"><div className="material-title-meta"><span className={`type-pill ${item.type.toLowerCase()}`}>{item.type}</span><span>{item.level}</span></div><h2>{item.title}</h2><p>{item.unit}</p></div><div className="material-body"><div className="material-meta"><span>{item.date}</span><span>เข้าชม {item.viewCount} ครั้ง · ดาวน์โหลด {downloadCount} ครั้ง</span></div><div className="card-actions"><button className="small-primary" onClick={onOpen}><Eye aria-hidden />ดู</button><button className="template-button" onClick={onDownload}><Download aria-hidden />ดาวน์โหลด</button>{role === "teacher" && <button className="danger-button small-danger" onClick={onDelete}><Trash2 aria-hidden />ลบ</button>}</div></div></article>;
}

function SubmissionList({ items, onOpen, compact = false }: { items: SubmissionRecord[]; onOpen?: (item: SubmissionRecord) => void; compact?: boolean }) {
  return <div className="submission-list">{items.slice(0, compact ? 2 : items.length).map((item) => {
    const retentionNote = submissionFileRetentionNote(item);
    const attachmentLabel = item.linkUrl
      ? `ลิงก์: ${item.linkUrl}`
      : item.filePath
        ? `ไฟล์: ${fileNameFromPath(item.filePath)}`
        : item.originalFileName
          ? `ไฟล์เดิม: ${item.originalFileName}`
          : "ยังไม่มีสิ่งที่แนบ";
    return <article className="submission-card compact-submission-card" key={item.id}><div><div className="submission-title-line"><strong>{item.assignmentTitle}</strong>{item.submissionKind === "group" && <span className="submission-kind-badge">งานกลุ่ม {item.groupMemberCodes.length} คน</span>}</div><div className="student-submission-identity"><span>ผู้ส่ง {item.studentName}</span><small>รหัสนักเรียน {item.studentId}</small></div>{!compact && <SubmissionAiStatus item={item} />}{!compact && <SubmissionMemberList item={item} />}{!compact && <small className="submission-file-name">{attachmentLabel}</small>}{!compact && retentionNote && <small className={`submission-retention-note ${item.fileDeletedAtRaw ? "deleted" : ""}`}>{retentionNote}</small>}</div><div className="submission-state"><small>{item.submittedAt}</small><span className={`status-pill ${statusTone(item.status)}`}>{item.status}</span>{onOpen && <button className="small-primary" type="button" onClick={() => onOpen(item)} disabled={!item.filePath && !item.linkUrl}><Eye aria-hidden />{item.linkUrl ? "เปิดลิงก์" : item.fileDeletedAtRaw ? "ลบแล้ว" : "เปิดไฟล์"}</button>}</div></article>;
  })}</div>;
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
      assignmentType: assignment.assignmentType,
      rawMax: assignment.rawMax,
      finalMax: assignment.finalMax,
      acceptingSubmissions: assignment.acceptingSubmissions,
      submissionOpenAt: assignment.submissionOpenAt,
      submissionCloseAt: assignment.submissionCloseAt,
      assignments: [assignment],
      classroomIds: assignment.classroomId ? [assignment.classroomId] : [],
      hasMixedValues: false
    });
  });
  return [...grouped.values()].map((group) => ({
    ...group,
    hasMixedValues: group.assignments.some((assignment) => assignment.title !== group.title || assignment.assignmentType !== group.assignmentType || assignment.rawMax !== group.rawMax || assignment.finalMax !== group.finalMax || assignment.acceptingSubmissions !== group.acceptingSubmissions || assignment.submissionOpenAt !== group.submissionOpenAt || assignment.submissionCloseAt !== group.submissionCloseAt)
  }));
}

function normalizeAssignmentType(value: string) {
  const trimmed = value.trim();
  return trimmed || "ทั่วไป";
}

type AssignmentSubmissionAvailability = {
  state: "open" | "scheduled" | "closed";
  canSubmit: boolean;
  label: string;
  detail: string;
  shortDetail: string;
};

function assignmentSubmissionAvailability(assignment: ScoreAssignment, now = Date.now()): AssignmentSubmissionAvailability {
  if (!assignment.acceptingSubmissions) {
    return { state: "closed", canSubmit: false, label: "ปิดรับ", detail: "ครูปิดรับการส่งงานนี้แล้ว", shortDetail: "ครูปิดรับ" };
  }
  const opensAt = assignment.submissionOpenAt ? Date.parse(assignment.submissionOpenAt) : Number.NaN;
  const closesAt = assignment.submissionCloseAt ? Date.parse(assignment.submissionCloseAt) : Number.NaN;
  if (Number.isFinite(opensAt) && now < opensAt) {
    const formatted = formatAssignmentScheduleDate(assignment.submissionOpenAt!);
    return { state: "scheduled", canSubmit: false, label: "ยังไม่เปิด", detail: `เริ่มรับงาน ${formatted}`, shortDetail: `เริ่ม ${formatted}` };
  }
  if (Number.isFinite(closesAt) && now >= closesAt) {
    const formatted = formatAssignmentScheduleDate(assignment.submissionCloseAt!);
    return { state: "closed", canSubmit: false, label: "หมดเวลาส่ง", detail: `ปิดรับงานแล้วเมื่อ ${formatted}`, shortDetail: `ปิดเมื่อ ${formatted}` };
  }
  if (Number.isFinite(closesAt)) {
    const formatted = formatAssignmentScheduleDate(assignment.submissionCloseAt!);
    return { state: "open", canSubmit: true, label: "เปิดรับ", detail: `ส่งได้ถึง ${formatted}`, shortDetail: `ปิด ${formatted}` };
  }
  return { state: "open", canSubmit: true, label: "เปิดรับ", detail: "เปิดรับการส่งงานโดยไม่กำหนดเวลาปิด", shortDetail: "ไม่กำหนดเวลาปิด" };
}

function formatAssignmentScheduleDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ไม่พบวันเวลา";
  return date.toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isoToDateTimeInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string) {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function validateAssignmentScheduleDraft(draft: AssignmentDraft) {
  const opensAt = draft.submissionOpenAt ? new Date(draft.submissionOpenAt).getTime() : Number.NaN;
  const closesAt = draft.submissionCloseAt ? new Date(draft.submissionCloseAt).getTime() : Number.NaN;
  if (draft.submissionOpenAt && !Number.isFinite(opensAt)) return "วันเวลาเริ่มรับงานไม่ถูกต้อง";
  if (draft.submissionCloseAt && !Number.isFinite(closesAt)) return "วันเวลาปิดรับงานไม่ถูกต้อง";
  if (Number.isFinite(opensAt) && Number.isFinite(closesAt) && opensAt >= closesAt) return "วันเวลาปิดรับงานต้องอยู่หลังเวลาเริ่มรับ";
  return "";
}

function groupAssignmentsByType(items: ScoreAssignment[]) {
  const grouped = new Map<string, ScoreAssignment[]>();
  orderAssignments(items).forEach((assignment) => {
    const type = normalizeAssignmentType(assignment.assignmentType);
    grouped.set(type, [...(grouped.get(type) ?? []), assignment]);
  });
  return [...grouped.entries()].map(([type, assignments]) => ({ type, items: assignments }));
}

function groupAssignmentGroupsByType(groups: AssignmentGroup[]) {
  const grouped = new Map<string, AssignmentGroup[]>();
  groups.forEach((group) => {
    const type = group.hasMixedValues ? "หลายประเภท" : normalizeAssignmentType(group.assignmentType);
    grouped.set(type, [...(grouped.get(type) ?? []), group]);
  });
  return [...grouped.entries()].map(([type, items]) => ({ type, groups: items }));
}

function groupSubmissionsByStatusAndType(items: SubmissionRecord[], assignmentTypeById: Map<string, string>): SubmissionReviewSection[] {
  const statusOrder: SubmissionStatus[] = ["รอตรวจ", "ส่งแล้ว", "ส่งช้า", "ให้แก้ไข", "ตรวจแล้ว", "ยังไม่ส่ง"];
  const grouped = new Map<SubmissionStatus, SubmissionRecord[]>();
  items.forEach((item) => {
    grouped.set(item.status, [...(grouped.get(item.status) ?? []), item]);
  });
  return [...grouped.entries()]
    .sort(([a], [b]) => submissionStatusOrder(statusOrder, a) - submissionStatusOrder(statusOrder, b))
    .map(([status, statusItems]) => ({
      status,
      total: statusItems.length,
      typeSections: groupSubmissionsByAssignmentType(statusItems, assignmentTypeById)
    }));
}

function submissionStatusOrder(order: SubmissionStatus[], status: SubmissionStatus) {
  const index = order.indexOf(status);
  return index >= 0 ? index : order.length;
}

function groupSubmissionsByAssignmentType(items: SubmissionRecord[], assignmentTypeById: Map<string, string>): SubmissionTypeSection[] {
  const grouped = new Map<string, SubmissionRecord[]>();
  items.forEach((item) => {
    const type = normalizeAssignmentType(item.assignmentId ? assignmentTypeById.get(item.assignmentId) || "" : "");
    grouped.set(type, [...(grouped.get(type) ?? []), item]);
  });
  return [...grouped.entries()].map(([type, submissions]) => ({ type, items: submissions }));
}

function groupSubmissionsByStudent(items: SubmissionRecord[]): SubmissionStudentGroup[] {
  const grouped = new Map<string, { studentId: string; studentName: string; items: SubmissionRecord[] }>();
  items.forEach((item) => {
    const key = item.studentId || item.studentName;
    const current = grouped.get(key);
    if (current) current.items.push(item);
    else grouped.set(key, { studentId: item.studentId, studentName: item.studentName, items: [item] });
  });
  return [...grouped.values()]
    .map((group) => ({
      ...group,
      pendingCount: group.items.filter((item) => item.status !== "ตรวจแล้ว").length,
      reviewedCount: group.items.filter((item) => item.status === "ตรวจแล้ว").length
    }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "th", { numeric: true }));
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
    finalMax: assignment.finalMax,
    sourceType: "manual"
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
  return Math.round((rawScore / rawMax) * finalMax);
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

function submissionFileRetentionNote(item: SubmissionRecord) {
  if (item.linkUrl) return "";
  if (item.fileDeletedAtRaw || (!item.filePath && item.originalFileName)) {
    return item.fileDeletedAt ? `ไฟล์ถูกลบอัตโนมัติแล้วเมื่อ ${item.fileDeletedAt}` : "ไฟล์ถูกลบอัตโนมัติแล้ว";
  }
  if (!item.filePath || item.status !== "ตรวจแล้ว" || !item.reviewedAtRaw) return "";
  const deletionDate = new Date(item.reviewedAtRaw);
  if (Number.isNaN(deletionDate.getTime())) return "ไฟล์จะถูกลบอัตโนมัติหลังตรวจครบ 7 วัน";
  deletionDate.setDate(deletionDate.getDate() + 7);
  return `ไฟล์จะถูกลบอัตโนมัติวันที่ ${deletionDate.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}`;
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

function upsertChatMessage(items: ChatMessage[], message: ChatMessage) {
  const exists = items.some((item) => item.id === message.id);
  const next = exists ? items.map((item) => item.id === message.id ? message : item) : [...items, message];
  return next.sort((a, b) => Date.parse(a.createdAtRaw) - Date.parse(b.createdAtRaw));
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
