import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Layer, Line, Shape, Stage, Text as KonvaText } from "react-konva";
import { getStroke } from "perfect-freehand";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eraser,
  Eye,
  FileText,
  Hand,
  Maximize2,
  Pencil,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Send,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import type { Classroom, Role, StudentRecord } from "../../types";
import {
  createWorksheet,
  deleteWorksheet,
  fetchWorksheetAnswers,
  fetchWorksheets,
  fetchTeacherWorksheetPages,
  getWorksheetUrl,
  rotateAllWorksheetPages,
  saveWorksheetPage,
  saveTeacherWorksheetPage,
  updateWorksheetPageView,
  worksheetError,
} from "./service";
import type {
  Worksheet,
  WorksheetAnnotation,
  WorksheetCrop,
  WorksheetDraft,
  WorksheetPageAnswer,
  WorksheetPageView,
  WorksheetStroke,
  WorksheetTeacherPage,
  WorksheetTool,
} from "./types";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type WorksheetHubProps = {
  role: Role;
  classrooms: Classroom[];
  students: StudentRecord[];
  currentStudent?: StudentRecord;
  flash: (message: string) => void;
};

const emptyDraft = (): WorksheetDraft => ({
  title: "",
  description: "",
  file: null,
  classroomIds: [],
  acceptingSubmissions: true,
  opensAt: "",
  closesAt: "",
});

const FULL_PAGE_CROP: WorksheetCrop = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export default function WorksheetHub({
  role,
  classrooms,
  students,
  currentStudent,
  flash,
}: WorksheetHubProps) {
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [answers, setAnswers] = useState<WorksheetPageAnswer[]>([]);
  const [teacherPages, setTeacherPages] = useState<WorksheetTeacherPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<WorksheetDraft>(emptyDraft);
  const [activeWorksheet, setActiveWorksheet] = useState<Worksheet | null>(
    null,
  );
  const [previewAnswer, setPreviewAnswer] =
    useState<WorksheetPageAnswer | null>(null);
  const [teacherWriting, setTeacherWriting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const [nextWorksheets, nextAnswers, nextTeacherPages] = await Promise.all([
        fetchWorksheets(),
        fetchWorksheetAnswers(),
        role === "teacher" ? fetchTeacherWorksheetPages() : Promise.resolve([]),
      ]);
      setWorksheets(nextWorksheets);
      setAnswers(nextAnswers);
      setTeacherPages(nextTeacherPages);
    } catch (error) {
      flash(worksheetError(error, "โหลดสมุดงานไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [role, currentStudent?.studentId]);

  useEffect(() => {
    if (!activeWorksheet && !previewAnswer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeWorksheet, previewAnswer]);

  function updateAnswer(saved: WorksheetPageAnswer) {
    setAnswers((current) =>
      current.some((answer) => answer.id === saved.id)
        ? current.map((answer) => (answer.id === saved.id ? saved : answer))
        : [saved, ...current],
    );
  }

  function updateTeacherPage(saved: WorksheetTeacherPage) {
    setTeacherPages((current) =>
      current.some((page) => page.id === saved.id)
        ? current.map((page) => (page.id === saved.id ? saved : page))
        : [saved, ...current],
    );
  }

  function updateWorksheet(saved: Worksheet) {
    setWorksheets((current) =>
      current.map((worksheet) => (worksheet.id === saved.id ? saved : worksheet)),
    );
    setActiveWorksheet((current) =>
      current?.id === saved.id ? saved : current,
    );
  }

  async function submitCreateWorksheet() {
    setBusy(true);
    try {
      const created = await createWorksheet(draft);
      setWorksheets((current) => [created, ...current]);
      setDraft(emptyDraft());
      flash(
        `สร้างสมุดงาน “${created.title}” จำนวน ${created.pageCount} หน้าแล้ว`,
      );
    } catch (error) {
      flash(worksheetError(error, "สร้างสมุดงานไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function removeWorksheet(worksheet: Worksheet) {
    const answerCount = answers.filter(
      (answer) => answer.worksheetId === worksheet.id,
    ).length;
    if (
      !window.confirm(
        `ลบสมุดงาน “${worksheet.title}” พร้อมไฟล์ PDF${answerCount ? ` และคำตอบ ${answerCount} หน้า` : ""} หรือไม่`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteWorksheet(worksheet);
      setWorksheets((current) =>
        current.filter((item) => item.id !== worksheet.id),
      );
      setAnswers((current) =>
        current.filter((answer) => answer.worksheetId !== worksheet.id),
      );
      flash(`ลบสมุดงาน “${worksheet.title}” แล้ว`);
    } catch (error) {
      flash(worksheetError(error, "ลบสมุดงานไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="worksheet-loading">
        <span>กำลังโหลดสมุดงาน...</span>
      </div>
    );

  if (role === "teacher") {
    return (
      <div className="worksheet-hub teacher-worksheet-hub">
        <section className="panel worksheet-create-panel">
          <div className="worksheet-section-heading">
            <div>
              <BookOpen aria-hidden />
              <div>
                <h2>สร้างสมุดงานออนไลน์</h2>
                <span>อัปโหลด PDF แล้วมอบหมายให้นักเรียนทำทีละหน้า</span>
              </div>
            </div>
          </div>
          <div className="form-grid">
            <label className="field">
              ชื่อสมุดงาน
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="เช่น แบบฝึกหัดหน่วยที่ 1"
              />
            </label>
            <label className="field">
              คำอธิบาย
              <input
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="รายละเอียดสำหรับนักเรียน"
              />
            </label>
          </div>
          <label
            className={`worksheet-file-picker ${draft.file ? "has-file" : ""}`}
          >
            <Upload aria-hidden />
            <span>
              <strong>{draft.file?.name || "เลือกไฟล์ PDF"}</strong>
              <small>
                {draft.file
                  ? `${(draft.file.size / 1024 / 1024).toFixed(1)} MB`
                  : "ขนาดไม่เกิน 30MB"}
              </small>
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  file: event.target.files?.[0] || null,
                }))
              }
            />
          </label>
          <fieldset className="worksheet-classrooms">
            <legend>ห้องเรียนที่ได้รับสมุดงาน</legend>
            <div>
              {classrooms.map((classroom) => (
                <label key={classroom.id}>
                  <input
                    type="checkbox"
                    checked={draft.classroomIds.includes(classroom.id)}
                    onChange={() =>
                      setDraft((current) => ({
                        ...current,
                        classroomIds: current.classroomIds.includes(
                          classroom.id,
                        )
                          ? current.classroomIds.filter(
                              (id) => id !== classroom.id,
                            )
                          : [...current.classroomIds, classroom.id],
                      }))
                    }
                  />
                  <span>{classroom.displayName}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="worksheet-schedule">
            <legend>
              <Clock3 aria-hidden />
              กำหนดการทำแบบฝึกหัด
            </legend>
            <label className="worksheet-open-toggle">
              <input
                type="checkbox"
                checked={draft.acceptingSubmissions}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    acceptingSubmissions: event.target.checked,
                  }))
                }
              />
              <span>
                <strong>เปิดรับคำตอบ</strong>
                <small>นักเรียนบันทึกฉบับร่างและส่งหน้าได้</small>
              </span>
            </label>
            <div className="form-grid">
              <label className="field">
                เริ่มทำได้
                <input
                  type="datetime-local"
                  disabled={!draft.acceptingSubmissions}
                  value={draft.opensAt}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      opensAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                ปิดรับ
                <input
                  type="datetime-local"
                  disabled={!draft.acceptingSubmissions}
                  value={draft.closesAt}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      closesAt: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </fieldset>
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => void submitCreateWorksheet()}
          >
            <BookOpen aria-hidden />
            {busy ? "กำลังสร้างสมุดงาน" : "สร้างสมุดงาน"}
          </button>
        </section>
        <TeacherWorksheetList
          worksheets={worksheets}
          answers={answers}
          classrooms={classrooms}
          students={students}
          busy={busy}
          onDelete={(worksheet) => void removeWorksheet(worksheet)}
          onWrite={(worksheet) => {
            setActiveWorksheet(worksheet);
            setPreviewAnswer(null);
            setTeacherWriting(true);
          }}
          onPreview={(worksheet, answer) => {
            setActiveWorksheet(worksheet);
            setPreviewAnswer(answer);
            setTeacherWriting(false);
          }}
        />
        {activeWorksheet && (previewAnswer || teacherWriting) && (
          <WorksheetEditorModal
            worksheet={activeWorksheet}
            pages={
              teacherWriting
                ? teacherPages.filter(
                    (page) => page.worksheetId === activeWorksheet.id,
                  )
                : previewAnswer
                  ? [previewAnswer]
                  : []
            }
            initialPage={previewAnswer?.pageNumber || 1}
            mode={teacherWriting ? "teacher" : "preview"}
            onClose={() => {
              setActiveWorksheet(null);
              setPreviewAnswer(null);
              setTeacherWriting(false);
            }}
            onStudentSaved={updateAnswer}
            onTeacherSaved={updateTeacherPage}
            onWorksheetUpdated={updateWorksheet}
            flash={flash}
          />
        )}
      </div>
    );
  }

  return (
    <div className="worksheet-hub student-worksheet-hub">
      <section className="panel worksheet-library">
        <div className="worksheet-section-heading">
          <div>
            <BookOpen aria-hidden />
            <div>
              <h2>สมุดงานของฉัน</h2>
              <span>{currentStudent?.className || "ห้องเรียนของฉัน"}</span>
            </div>
          </div>
          <span>{worksheets.length} ชุด</span>
        </div>
        {worksheets.length ? (
          <div className="worksheet-card-grid">
            {worksheets.map((worksheet) => {
              const worksheetAnswers = answers.filter(
                (answer) => answer.worksheetId === worksheet.id,
              );
              const submitted = worksheetAnswers.filter(
                (answer) =>
                  answer.status === "submitted" || answer.status === "reviewed",
              ).length;
              const availability = worksheetAvailability(worksheet);
              return (
                <article className="worksheet-card" key={worksheet.id}>
                  <div className="worksheet-card-top">
                    <span
                      className={`worksheet-availability ${availability.state}`}
                    >
                      {availability.label}
                    </span>
                    <small>{worksheet.pageCount} หน้า</small>
                  </div>
                  <div>
                    <h3>{worksheet.title}</h3>
                    <p>{worksheet.description || "แบบฝึกหัดออนไลน์"}</p>
                  </div>
                  <div className="worksheet-progress">
                    <span>
                      <i
                        style={{
                          width: `${Math.min(100, (submitted / worksheet.pageCount) * 100)}%`,
                        }}
                      />
                    </span>
                    <small>
                      ส่งแล้ว {submitted}/{worksheet.pageCount} หน้า
                    </small>
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => setActiveWorksheet(worksheet)}
                  >
                    <Pencil aria-hidden />
                    {worksheetAnswers.length ? "ทำต่อ" : "เริ่มทำ"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="worksheet-empty">
            <FileText aria-hidden />
            <strong>ยังไม่มีสมุดงาน</strong>
            <span>เมื่อคุณครูมอบหมายสมุดงาน รายการจะแสดงที่นี่</span>
          </div>
        )}
      </section>
      {activeWorksheet && (
        <WorksheetEditorModal
          worksheet={activeWorksheet}
          pages={answers.filter(
            (answer) => answer.worksheetId === activeWorksheet.id,
          )}
          initialPage={firstIncompletePage(activeWorksheet, answers)}
          mode="student"
          onClose={() => setActiveWorksheet(null)}
          onStudentSaved={updateAnswer}
          onTeacherSaved={updateTeacherPage}
          onWorksheetUpdated={updateWorksheet}
          flash={flash}
        />
      )}
    </div>
  );
}

function TeacherWorksheetList({
  worksheets,
  answers,
  classrooms,
  students,
  busy,
  onDelete,
  onWrite,
  onPreview,
}: {
  worksheets: Worksheet[];
  answers: WorksheetPageAnswer[];
  classrooms: Classroom[];
  students: StudentRecord[];
  busy: boolean;
  onDelete: (worksheet: Worksheet) => void;
  onWrite: (worksheet: Worksheet) => void;
  onPreview: (worksheet: Worksheet, answer: WorksheetPageAnswer) => void;
}) {
  return (
    <section className="panel worksheet-admin-list">
      <div className="worksheet-section-heading">
        <div>
          <FileText aria-hidden />
          <div>
            <h2>สมุดงานที่สร้างแล้ว</h2>
            <span>ติดตามการส่งแยกตามหน้า</span>
          </div>
        </div>
        <span>{worksheets.length} ชุด</span>
      </div>
      {worksheets.length ? (
        <div className="worksheet-admin-items">
          {worksheets.map((worksheet) => {
            const worksheetAnswers = answers.filter(
              (answer) => answer.worksheetId === worksheet.id,
            );
            const submittedAnswers = worksheetAnswers.filter(
              (answer) =>
                answer.status === "submitted" || answer.status === "reviewed",
            );
            const assignedStudents = students.filter(
              (student) =>
                student.classroomId &&
                worksheet.classroomIds.includes(student.classroomId),
            );
            const expectedPages = assignedStudents.length * worksheet.pageCount;
            const roomNames = worksheet.classroomIds
              .map(
                (id) => classrooms.find((room) => room.id === id)?.displayName,
              )
              .filter(Boolean)
              .join(" · ");
            return (
              <article className="worksheet-admin-item" key={worksheet.id}>
                <div className="worksheet-admin-summary">
                  <div>
                    <span className="worksheet-page-count">
                      <BookOpen aria-hidden />
                      {worksheet.pageCount} หน้า
                    </span>
                    <h3>{worksheet.title}</h3>
                    <p>{roomNames || "ยังไม่ได้เลือกห้อง"}</p>
                  </div>
                  <div className="worksheet-admin-progress">
                    <strong>
                      {submittedAnswers.length}
                      <span>/{expectedPages || "-"}</span>
                    </strong>
                    <small>หน้าที่ส่งแล้ว</small>
                  </div>
                </div>
                {submittedAnswers.length ? (
                  <div className="worksheet-answer-chips">
                    {submittedAnswers.slice(0, 8).map((answer) => (
                      <button
                        type="button"
                        key={answer.id}
                        onClick={() => onPreview(worksheet, answer)}
                      >
                        <Eye aria-hidden />
                        <span>
                          {answer.studentName}
                          <small>หน้า {answer.pageNumber}</small>
                        </span>
                      </button>
                    ))}
                    {submittedAnswers.length > 8 && (
                      <span>อีก {submittedAnswers.length - 8} หน้า</span>
                    )}
                  </div>
                ) : (
                  <div className="worksheet-no-answers">ยังไม่มีหน้าที่ส่ง</div>
                )}
                <div className="worksheet-admin-actions">
                  <span>{worksheetAvailability(worksheet).detail}</span>
                  <div>
                    <button
                      className="template-button worksheet-write-button"
                      type="button"
                      disabled={busy}
                      onClick={() => onWrite(worksheet)}
                    >
                      <Pencil aria-hidden />
                      เขียนฉบับครู
                    </button>
                    <button
                      className="icon-danger"
                      type="button"
                      disabled={busy}
                      onClick={() => onDelete(worksheet)}
                      aria-label={`ลบสมุดงาน ${worksheet.title}`}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="worksheet-empty">
          <BookOpen aria-hidden />
          <strong>ยังไม่มีสมุดงาน</strong>
          <span>สร้างสมุดงานชุดแรกจากแบบฟอร์มด้านบน</span>
        </div>
      )}
    </section>
  );
}

type WorksheetEditorMode = "student" | "teacher" | "preview";
type WorksheetEditorPage = WorksheetPageAnswer | WorksheetTeacherPage;

function WorksheetEditorModal({
  worksheet,
  pages,
  initialPage,
  mode,
  onClose,
  onStudentSaved,
  onTeacherSaved,
  onWorksheetUpdated,
  flash,
}: {
  worksheet: Worksheet;
  pages: WorksheetEditorPage[];
  initialPage: number;
  mode: WorksheetEditorMode;
  onClose: () => void;
  onStudentSaved: (answer: WorksheetPageAnswer) => void;
  onTeacherSaved: (page: WorksheetTeacherPage) => void;
  onWorksheetUpdated: (worksheet: Worksheet) => void;
  flash: (message: string) => void;
}) {
  return (
    <div
      className="modal-backdrop worksheet-editor-backdrop"
      role="presentation"
    >
      <section
        className="worksheet-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worksheet-editor-title"
      >
        <header>
          <div>
            <span>
              {mode === "preview"
                ? "ตัวอย่างงานนักเรียน"
                : mode === "teacher"
                  ? "สมุดงานฉบับส่วนตัวของครู"
                  : "สมุดงานออนไลน์"}
            </span>
            <h2 id="worksheet-editor-title">{worksheet.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="ปิดสมุดงาน"
          >
            <X aria-hidden />
          </button>
        </header>
        <WorksheetEditor
          worksheet={worksheet}
          pages={pages}
          initialPage={initialPage}
          mode={mode}
          onStudentSaved={onStudentSaved}
          onTeacherSaved={onTeacherSaved}
          onWorksheetUpdated={onWorksheetUpdated}
          flash={flash}
        />
      </section>
    </div>
  );
}

function WorksheetEditor({
  worksheet,
  pages,
  initialPage,
  mode,
  onStudentSaved,
  onTeacherSaved,
  onWorksheetUpdated,
  flash,
}: {
  worksheet: Worksheet;
  pages: WorksheetEditorPage[];
  initialPage: number;
  mode: WorksheetEditorMode;
  onStudentSaved: (answer: WorksheetPageAnswer) => void;
  onTeacherSaved: (page: WorksheetTeacherPage) => void;
  onWorksheetUpdated: (worksheet: Worksheet) => void;
  flash: (message: string) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [annotations, setAnnotations] = useState<WorksheetAnnotation[]>([]);
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<WorksheetCrop>(FULL_PAGE_CROP);
  const [viewBusy, setViewBusy] = useState(false);
  const [tool, setTool] = useState<WorksheetTool>("pen");
  const [color, setColor] = useState("#1d1d1f");
  const [textDraft, setTextDraft] = useState("");
  const [penOnly, setPenOnly] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 760, height: 980 });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageShellRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const erasingRef = useRef(false);
  const eraseChangedRef = useRef(false);
  const activeStrokeIdRef = useRef("");
  const drawFrameRef = useRef<number | null>(null);
  const pastRef = useRef<EditorSnapshot[]>([]);
  const futureRef = useRef<EditorSnapshot[]>([]);
  const annotationsRef = useRef<WorksheetAnnotation[]>([]);
  const rotationRef = useRef(0);
  const cropRef = useRef<WorksheetCrop>(FULL_PAGE_CROP);
  const orientationCheckedRef = useRef(new Set<number>());
  const readOnly = mode === "preview";
  const pageRecord = pages.find((item) => item.pageNumber === pageNumber);
  const answer = isStudentAnswer(pageRecord) ? pageRecord : undefined;
  const pageLocked =
    readOnly ||
    (mode === "student" &&
      (answer?.status === "submitted" || answer?.status === "reviewed"));
  const locked = pageLocked || saveState === "saving";

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);
  useEffect(() => {
    rotationRef.current = rotation;
  }, [rotation]);
  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);
  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    setLoading(true);
    void getWorksheetUrl(worksheet)
      .then((url) => {
        loadingTask = getDocument({ url });
        return loadingTask.promise;
      })
      .then((loaded) => {
        if (!cancelled) {
          orientationCheckedRef.current.clear();
          setPdf(loaded);
        }
      })
      .catch((error) => flash(worksheetError(error, "เปิด PDF ไม่สำเร็จ")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (drawFrameRef.current !== null)
        window.cancelAnimationFrame(drawFrameRef.current);
      void loadingTask?.destroy();
    };
  }, [worksheet.id]);

  useEffect(() => {
    const record = pages.find((item) => item.pageNumber === pageNumber);
    const next = record?.annotations ?? [];
    const pageView = worksheet.pageSettings[String(pageNumber)];
    const nextRotation = pageView?.rotation ?? record?.rotation ?? 0;
    const nextCrop = normalizeCrop(pageView?.crop ?? FULL_PAGE_CROP);
    setAnnotations(next);
    annotationsRef.current = next;
    setRotation(nextRotation);
    rotationRef.current = nextRotation;
    setCrop(nextCrop);
    cropRef.current = nextCrop;
    pastRef.current = [];
    futureRef.current = [];
    setSaveState("idle");
  }, [pages, pageNumber, worksheet.pageSettings]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !pageShellRef.current) return;
    let cancelled = false;
    const pageShell = pageShellRef.current;
    const viewportElement = pageShell.parentElement;
    const render = async () => {
      const page = await pdf.getPage(pageNumber);
      if (!orientationCheckedRef.current.has(pageNumber)) {
        orientationCheckedRef.current.add(pageNumber);
        const detectedRotation = await detectTextRotation(page);
        const hasConfiguredRotation = Boolean(
          worksheet.pageSettings[String(pageNumber)],
        );
        if (
          !hasConfiguredRotation &&
          detectedRotation !== null &&
          detectedRotation !== rotationRef.current
        ) {
          rotationRef.current = detectedRotation;
          setRotation(detectedRotation);
          return;
        }
      }
      const pdfRotation = (page.rotate + rotation) % 360;
      const activeCrop = normalizeCrop(crop);
      const baseViewport = page.getViewport({ scale: 1, rotation: pdfRotation });
      const viewportWidth = viewportElement?.clientWidth || window.innerWidth;
      const availableWidth = Math.min(900, Math.max(280, viewportWidth - 36));
      const scale = availableWidth / (baseViewport.width * activeCrop.width);
      const viewport = page.getViewport({ scale, rotation: pdfRotation });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const cropX = viewport.width * activeCrop.x;
      const cropY = viewport.height * activeCrop.y;
      const displayWidth = viewport.width * activeCrop.width;
      const displayHeight = viewport.height * activeCrop.height;
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.max(1, Math.floor(displayWidth * outputScale));
      canvas.height = Math.max(1, Math.floor(displayHeight * outputScale));
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      setCanvasSize({ width: displayWidth, height: displayHeight });
      const context = canvas.getContext("2d");
      if (!context) return;
      context.save();
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
      await page.render({
        canvasContext: context,
        canvas,
        viewport,
        transform: [
          outputScale,
          0,
          0,
          outputScale,
          -cropX * outputScale,
          -cropY * outputScale,
        ],
      }).promise;
      if (
        !cancelled &&
        isFullPageCrop(activeCrop) &&
        !annotationsRef.current.length
      ) {
        const detectedCrop = detectCanvasContentCrop(canvas);
        if (detectedCrop && !isFullPageCrop(detectedCrop)) {
          cropRef.current = detectedCrop;
          setCrop(detectedCrop);
        }
      }
    };
    void render().catch((error) =>
      flash(worksheetError(error, "แสดงหน้าสมุดงานไม่สำเร็จ")),
    );
    const observer = new ResizeObserver(() => void render());
    observer.observe(viewportElement || pageShell);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pdf, pageNumber, rotation, crop, worksheet.pageSettings]);

  useEffect(() => {
    if (readOnly || locked || saveState !== "dirty") return;
    const timer = window.setTimeout(() => void persistPage(false), 900);
    return () => window.clearTimeout(timer);
  }, [annotations, locked, readOnly, saveState]);

  function currentSnapshot(): EditorSnapshot {
    return {
      annotations: annotationsRef.current,
    };
  }

  function pushHistory() {
    pastRef.current.push(currentSnapshot());
    if (pastRef.current.length > 40) pastRef.current.shift();
    futureRef.current = [];
  }

  function applySnapshot(snapshot: EditorSnapshot) {
    annotationsRef.current = snapshot.annotations;
    setAnnotations(snapshot.annotations);
    setSaveState("dirty");
  }

  function recordChange(next: WorksheetAnnotation[]) {
    pushHistory();
    annotationsRef.current = next;
    setAnnotations(next);
    setSaveState("dirty");
  }

  function pointerSamples(event: KonvaEventObject<PointerEvent>) {
    const stage = event.target.getStage();
    if (!stage) return [];
    const rect = stage.container().getBoundingClientRect();
    const nativeSamples = event.evt.getCoalescedEvents?.() ?? [event.evt];
    const activeCrop = cropRef.current;
    return nativeSamples
      .map((sample) => {
        const visibleX = (sample.clientX - rect.left) / canvasSize.width;
        const visibleY = (sample.clientY - rect.top) / canvasSize.height;
        return {
          x: activeCrop.x + visibleX * activeCrop.width,
          y: activeCrop.y + visibleY * activeCrop.height,
          pressure:
            sample.pressure > 0 && sample.pressure <= 1
              ? sample.pressure
              : 0.5,
        };
      })
      .filter(
        (point) =>
          point.x >= activeCrop.x &&
          point.x <= activeCrop.x + activeCrop.width &&
          point.y >= activeCrop.y &&
          point.y <= activeCrop.y + activeCrop.height,
      );
  }

  function scheduleAnnotationRender() {
    if (drawFrameRef.current !== null) return;
    drawFrameRef.current = window.requestAnimationFrame(() => {
      drawFrameRef.current = null;
      setAnnotations([...annotationsRef.current]);
    });
  }

  function pointerIsBlocked(event: KonvaEventObject<PointerEvent>) {
    const pointerType = event.evt.pointerType;
    if (pointerType === "pen" && !penOnly) setPenOnly(true);
    return penOnly && pointerType === "touch";
  }

  function handlePointerDown(event: KonvaEventObject<PointerEvent>) {
    if (locked) return;
    if (pointerIsBlocked(event)) return;
    event.evt.preventDefault();
    const pointerTarget = event.evt.currentTarget;
    if (pointerTarget instanceof Element && "setPointerCapture" in pointerTarget)
      pointerTarget.setPointerCapture(event.evt.pointerId);
    const downSamples = pointerSamples(event);
    const point = downSamples[downSamples.length - 1];
    if (!point) return;
    if (tool === "text") {
      if (!textDraft.trim() || event.target !== event.target.getStage()) return;
      recordChange([
        ...annotationsRef.current,
        {
          id: crypto.randomUUID(),
          kind: "text",
          x: point.x,
          y: point.y,
          text: textDraft.trim(),
          color,
          fontSize: 18,
        },
      ]);
      setTextDraft("");
      return;
    }
    if (tool === "eraser") {
      drawingRef.current = true;
      erasingRef.current = true;
      eraseChangedRef.current = false;
      pushHistory();
      eraseAtPoint(point.x, point.y);
      return;
    }
    if (tool !== "pen") return;
    drawingRef.current = true;
    const id = crypto.randomUUID();
    activeStrokeIdRef.current = id;
    pushHistory();
    const next = [
      ...annotationsRef.current,
      {
        id,
        kind: "stroke",
        points: [point.x, point.y],
        pressures: [point.pressure],
        color,
        width: 4,
      } satisfies WorksheetStroke,
    ];
    annotationsRef.current = next;
    setAnnotations(next);
    setSaveState("dirty");
  }

  function handlePointerMove(event: KonvaEventObject<PointerEvent>) {
    if (!drawingRef.current || locked || pointerIsBlocked(event)) return;
    event.evt.preventDefault();
    const samples = pointerSamples(event);
    if (!samples.length) return;
    if (erasingRef.current && tool === "eraser") {
      samples.forEach((point) => eraseAtPoint(point.x, point.y));
      return;
    }
    if (tool !== "pen") return;
    const next = annotationsRef.current.map((annotation) =>
      annotation.id === activeStrokeIdRef.current &&
      annotation.kind === "stroke"
        ? appendStrokeSamples(annotation, samples, canvasSize, cropRef.current)
        : annotation,
    );
    annotationsRef.current = next;
    scheduleAnnotationRender();
    setSaveState("dirty");
  }

  function stopDrawing() {
    if (erasingRef.current && !eraseChangedRef.current) pastRef.current.pop();
    drawingRef.current = false;
    erasingRef.current = false;
    eraseChangedRef.current = false;
    activeStrokeIdRef.current = "";
    if (drawFrameRef.current !== null) {
      window.cancelAnimationFrame(drawFrameRef.current);
      drawFrameRef.current = null;
    }
    setAnnotations([...annotationsRef.current]);
  }

  function eraseAtPoint(x: number, y: number) {
    const next = annotationsRef.current.filter(
      (annotation) =>
        !annotationTouchesPoint(
          annotation,
          x,
          y,
          canvasSize,
          cropRef.current,
          18,
        ),
    );
    if (next.length === annotationsRef.current.length) return;
    eraseChangedRef.current = true;
    annotationsRef.current = next;
    scheduleAnnotationRender();
    setSaveState("dirty");
  }

  function undo() {
    const previous = pastRef.current.pop();
    if (!previous || locked) return;
    futureRef.current.push(currentSnapshot());
    applySnapshot(previous);
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next || locked) return;
    pastRef.current.push(currentSnapshot());
    applySnapshot(next);
  }

  async function savePageView(setting: WorksheetPageView, success: string) {
    if (mode !== "teacher" || viewBusy) return;
    setViewBusy(true);
    try {
      const saved = await updateWorksheetPageView(
        worksheet,
        pageNumber,
        setting,
      );
      rotationRef.current = setting.rotation;
      cropRef.current = setting.crop;
      setRotation(setting.rotation);
      setCrop(setting.crop);
      onWorksheetUpdated(saved);
      flash(success);
    } catch (error) {
      flash(worksheetError(error, "จัดแนวหน้าสมุดงานไม่สำเร็จ"));
    } finally {
      setViewBusy(false);
    }
  }

  async function rotatePage(delta: 90 | -90) {
    if (locked || mode !== "teacher") return;
    const nextRotation = (rotationRef.current + delta + 360) % 360;
    await savePageView(
      { rotation: nextRotation, crop: FULL_PAGE_CROP },
      `หมุนหน้า ${pageNumber} แล้ว`,
    );
  }

  async function rotateEveryPage() {
    if (locked || mode !== "teacher" || viewBusy) return;
    if (
      !window.confirm(
        `กลับหัวสมุดงาน “${worksheet.title}” ทั้ง ${worksheet.pageCount} หน้า 180° หรือไม่`,
      )
    )
      return;
    setViewBusy(true);
    try {
      const saved = await rotateAllWorksheetPages(worksheet, 180);
      onWorksheetUpdated(saved);
      const nextView = saved.pageSettings[String(pageNumber)];
      if (nextView) {
        rotationRef.current = nextView.rotation;
        cropRef.current = nextView.crop;
        setRotation(nextView.rotation);
        setCrop(nextView.crop);
      }
      orientationCheckedRef.current.clear();
      flash(`กลับหัวสมุดงานทั้ง ${worksheet.pageCount} หน้าแล้ว`);
    } catch (error) {
      flash(worksheetError(error, "กลับหัวสมุดงานไม่สำเร็จ"));
    } finally {
      setViewBusy(false);
    }
  }

  async function fitPageContent() {
    if (mode !== "teacher" || viewBusy || !canvasRef.current) return;
    const detected = isFullPageCrop(cropRef.current)
      ? detectCanvasContentCrop(canvasRef.current)
      : cropRef.current;
    if (!detected || isFullPageCrop(detected)) {
      flash("หน้านี้พอดีกับเนื้อหาอยู่แล้ว");
      return;
    }
    await savePageView(
      { rotation: rotationRef.current, crop: detected },
      `จัดหน้า ${pageNumber} ให้พอดีกับเนื้อหาแล้ว`,
    );
  }

  function clearPage() {
    if (locked || !annotationsRef.current.length) return;
    if (!window.confirm(`ลบรอยเขียนทั้งหมดในหน้า ${pageNumber} หรือไม่`)) return;
    recordChange([]);
  }

  async function persistPage(submit: boolean) {
    if (readOnly || locked) return pageRecord;
    if (
      submit &&
      !window.confirm(
        `ส่งสมุดงานหน้า ${pageNumber} หรือไม่ เมื่อส่งแล้วจะไม่สามารถแก้ไขหน้านี้ได้`,
      )
    )
      return;
    setSaveState("saving");
    try {
      const saved =
        mode === "teacher"
          ? await saveTeacherWorksheetPage(
              worksheet.id,
              pageNumber,
              annotationsRef.current,
              rotationRef.current,
            )
          : await saveWorksheetPage(
              worksheet.id,
              pageNumber,
              annotationsRef.current,
              rotationRef.current,
              submit,
            );
      if (mode === "teacher") onTeacherSaved(saved as WorksheetTeacherPage);
      else onStudentSaved(saved as WorksheetPageAnswer);
      setSaveState("saved");
      if (submit) flash(`ส่งหน้า ${pageNumber} แล้ว`);
      return saved;
    } catch (error) {
      setSaveState("error");
      flash(
        worksheetError(
          error,
          submit
            ? "ส่งหน้านี้ไม่สำเร็จ"
            : mode === "teacher"
              ? "บันทึกสมุดงานฉบับครูไม่สำเร็จ"
              : "บันทึกฉบับร่างไม่สำเร็จ",
        ),
      );
      return undefined;
    }
  }

  async function goToPage(nextPage: number) {
    if (
      nextPage < 1 ||
      nextPage > worksheet.pageCount ||
      nextPage === pageNumber
    )
      return;
    if (saveState === "dirty" && !locked && !readOnly) await persistPage(false);
    setPageNumber(nextPage);
  }

  const statusLabel =
    mode === "preview"
      ? `งานของ ${answer?.studentName || "นักเรียน"}`
      : mode === "teacher"
        ? teacherPageStatusLabel(pageRecord, saveState)
        : answerStatusLabel(answer?.status, saveState);
  return (
    <div className="worksheet-editor">
      <div className="worksheet-editor-toolbar">
        <div className="worksheet-page-nav">
          <button
            type="button"
            disabled={pageNumber <= 1}
            onClick={() => void goToPage(pageNumber - 1)}
            aria-label="หน้าก่อนหน้า"
          >
            <ChevronLeft aria-hidden />
          </button>
          <strong>
            หน้า {pageNumber} / {worksheet.pageCount}
          </strong>
          <button
            type="button"
            disabled={pageNumber >= worksheet.pageCount}
            onClick={() => void goToPage(pageNumber + 1)}
            aria-label="หน้าถัดไป"
          >
            <ChevronRight aria-hidden />
          </button>
        </div>
        {!readOnly && (
          <>
            <div
              className="worksheet-tools"
              role="toolbar"
              aria-label="เครื่องมือทำสมุดงาน"
            >
              <button
                className={tool === "pen" ? "active" : ""}
                type="button"
                disabled={locked}
                onClick={() => setTool("pen")}
                title="ปากกา"
              >
                <Pencil aria-hidden />
                <span>เขียน</span>
              </button>
              <button
                className={tool === "text" ? "active" : ""}
                type="button"
                disabled={locked}
                onClick={() => setTool("text")}
                title="ข้อความ"
              >
                <Type aria-hidden />
                <span>พิมพ์</span>
              </button>
              <button
                className={tool === "eraser" ? "active" : ""}
                type="button"
                disabled={locked}
                onClick={() => setTool("eraser")}
                title="ยางลบ"
              >
                <Eraser aria-hidden />
                <span>ลบ</span>
              </button>
              <button
                type="button"
                disabled={locked || !pastRef.current.length}
                onClick={undo}
                title="ย้อนกลับ"
              >
                <Undo2 aria-hidden />
              </button>
              <button
                type="button"
                disabled={locked || !futureRef.current.length}
                onClick={redo}
                title="ทำซ้ำ"
              >
                <Redo2 aria-hidden />
              </button>
              {mode === "teacher" && (
                <>
                  <button
                    type="button"
                    disabled={locked || viewBusy}
                    onClick={() => void rotatePage(-90)}
                    title="หมุนซ้าย"
                    aria-label="หมุนหน้าซ้าย"
                  >
                    <RotateCcw aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={locked || viewBusy}
                    onClick={() => void rotatePage(90)}
                    title="หมุนขวา"
                    aria-label="หมุนหน้าขวา"
                  >
                    <RotateCw aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={locked || viewBusy}
                    onClick={() => void fitPageContent()}
                    title="จัดหน้าให้พอดีกับเนื้อหา"
                  >
                    <Maximize2 aria-hidden />
                    <span>พอดีเนื้อหา</span>
                  </button>
                  <button
                    className="worksheet-rotate-all"
                    type="button"
                    disabled={locked || viewBusy}
                    onClick={() => void rotateEveryPage()}
                    title="กลับหัวทุกหน้า 180 องศา"
                  >
                    <RotateCw aria-hidden />
                    <span>กลับหัวทุกหน้า</span>
                  </button>
                </>
              )}
              <button
                className={penOnly ? "active" : ""}
                type="button"
                disabled={locked}
                onClick={() => setPenOnly((current) => !current)}
                title="กันฝ่ามือ: รับเฉพาะปากกาและเมาส์"
                aria-pressed={penOnly}
              >
                <Hand aria-hidden />
                <span>กันฝ่ามือ</span>
              </button>
              <button
                type="button"
                disabled={locked || !annotations.length}
                onClick={clearPage}
                title="ล้างทั้งหน้า"
                aria-label="ลบรอยเขียนทั้งหมดในหน้านี้"
              >
                <Trash2 aria-hidden />
              </button>
            </div>
            <div className="worksheet-color-tools">
              {["#1d1d1f", "#0071e3", "#ff453a", "#248a3d"].map((item) => (
                <button
                  className={color === item ? "active" : ""}
                  type="button"
                  key={item}
                  style={{ background: item }}
                  onClick={() => setColor(item)}
                  aria-label={`เลือกสี ${item}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {tool === "text" && !locked && !readOnly && (
        <label className="worksheet-text-entry">
          <Type aria-hidden />
          <input
            value={textDraft}
            onChange={(event) => setTextDraft(event.target.value)}
            placeholder="พิมพ์ข้อความ แล้วแตะตำแหน่งบนหน้า"
          />
        </label>
      )}
      <div className="worksheet-editor-status">
        <span className={`worksheet-save-state ${saveState}`}>
          {pageLocked && !readOnly ? (
            <CheckCircle2 aria-hidden />
          ) : (
            <Save aria-hidden />
          )}
          {statusLabel}
        </span>
        {answer?.submittedAt && (
          <small>ส่งเมื่อ {formatWorksheetDate(answer.submittedAt)}</small>
        )}
      </div>
      <div className="worksheet-page-viewport">
        <div
          className="worksheet-page-shell"
          ref={pageShellRef}
          style={{ minHeight: canvasSize.height }}
        >
          <canvas ref={canvasRef} />
          {!loading && (
            <Stage
              className={`worksheet-annotation-stage tool-${tool} ${penOnly ? "pen-only" : ""}`}
              width={canvasSize.width}
              height={canvasSize.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
            >
              <Layer listening={false}>
                {annotations.map((annotation) =>
                  annotation.kind === "stroke" ? (
                    annotation.id === activeStrokeIdRef.current &&
                    drawingRef.current ? (
                      <LiveStroke
                        key={annotation.id}
                        annotation={annotation}
                        canvasSize={canvasSize}
                        crop={crop}
                      />
                    ) : (
                      <SmoothStroke
                        key={annotation.id}
                        annotation={annotation}
                        canvasSize={canvasSize}
                        crop={crop}
                      />
                    )
                  ) : (
                    <KonvaText
                      key={annotation.id}
                      x={fullToVisibleX(annotation.x, crop, canvasSize.width)}
                      y={fullToVisibleY(annotation.y, crop, canvasSize.height)}
                      text={annotation.text}
                      fill={annotation.color}
                      fontSize={annotation.fontSize}
                      fontFamily="Prompt"
                      width={Math.max(
                        120,
                        canvasSize.width -
                          fullToVisibleX(annotation.x, crop, canvasSize.width) -
                          12,
                      )}
                      listening={false}
                    />
                  ),
                )}
              </Layer>
            </Stage>
          )}
          {loading && (
            <div className="worksheet-page-loading">กำลังเปิด PDF...</div>
          )}
        </div>
      </div>
      {!readOnly && (
        <footer className="worksheet-editor-actions">
          <button
            className="template-button"
            type="button"
            disabled={locked}
            onClick={() => void persistPage(false)}
          >
            <Save aria-hidden />
            {mode === "teacher" ? "บันทึกฉบับครู" : "บันทึกฉบับร่าง"}
          </button>
          {mode === "student" && (
            <button
              className="primary-button"
              type="button"
              disabled={locked}
              onClick={() => void persistPage(true)}
            >
              <Send aria-hidden />
              ส่งหน้านี้
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

type EditorSnapshot = {
  annotations: WorksheetAnnotation[];
};

function isStudentAnswer(
  page: WorksheetEditorPage | undefined,
): page is WorksheetPageAnswer {
  return Boolean(page && "status" in page);
}

function SmoothStroke({
  annotation,
  canvasSize,
  crop,
}: {
  annotation: WorksheetStroke;
  canvasSize: { width: number; height: number };
  crop: WorksheetCrop;
}) {
  const outline = useMemo(() => {
    const pressure = annotation.pressures ?? [];
    const points: [number, number, number][] = [];
    for (let index = 0; index < annotation.points.length; index += 2) {
      points.push([
        fullToVisibleX(annotation.points[index], crop, canvasSize.width),
        fullToVisibleY(annotation.points[index + 1], crop, canvasSize.height),
        pressure[index / 2] ?? 0.5,
      ]);
    }
    return getStroke(points, {
      size: annotation.width * 2,
      thinning: 0.55,
      smoothing: 0.65,
      streamline: 0.55,
      simulatePressure: !annotation.pressures?.length,
      start: { taper: 0, cap: true },
      end: { taper: 0, cap: true },
    });
  }, [annotation, canvasSize.height, canvasSize.width, crop]);

  return (
    <Shape
      fill={annotation.color}
      listening={false}
      sceneFunc={(context, shape) => {
        if (!outline.length) return;
        context.beginPath();
        context.moveTo(outline[0][0], outline[0][1]);
        for (let index = 1; index < outline.length; index += 1) {
          context.lineTo(outline[index][0], outline[index][1]);
        }
        context.closePath();
        context.fillStrokeShape(shape);
      }}
    />
  );
}

function LiveStroke({
  annotation,
  canvasSize,
  crop,
}: {
  annotation: WorksheetStroke;
  canvasSize: { width: number; height: number };
  crop: WorksheetCrop;
}) {
  const points: number[] = [];
  for (let index = 0; index < annotation.points.length; index += 2) {
    points.push(
      fullToVisibleX(annotation.points[index], crop, canvasSize.width),
      fullToVisibleY(annotation.points[index + 1], crop, canvasSize.height),
    );
  }
  return (
    <Line
      points={points}
      stroke={annotation.color}
      strokeWidth={annotation.width}
      lineCap="round"
      lineJoin="round"
      tension={0.35}
      listening={false}
    />
  );
}

function annotationTouchesPoint(
  annotation: WorksheetAnnotation,
  normalizedX: number,
  normalizedY: number,
  canvasSize: { width: number; height: number },
  crop: WorksheetCrop,
  radius: number,
) {
  const x = fullToVisibleX(normalizedX, crop, canvasSize.width);
  const y = fullToVisibleY(normalizedY, crop, canvasSize.height);
  if (annotation.kind === "text") {
    const left = fullToVisibleX(annotation.x, crop, canvasSize.width) - radius;
    const top = fullToVisibleY(annotation.y, crop, canvasSize.height) - radius;
    const width = Math.min(
      canvasSize.width - left,
      Math.max(80, annotation.text.length * annotation.fontSize * 0.55),
    );
    const height = annotation.fontSize * 1.5 + radius * 2;
    return x >= left && x <= left + width && y >= top && y <= top + height;
  }
  for (let index = 0; index < annotation.points.length - 2; index += 2) {
    const ax = fullToVisibleX(annotation.points[index], crop, canvasSize.width);
    const ay = fullToVisibleY(annotation.points[index + 1], crop, canvasSize.height);
    const bx = fullToVisibleX(annotation.points[index + 2], crop, canvasSize.width);
    const by = fullToVisibleY(annotation.points[index + 3], crop, canvasSize.height);
    if (distanceToSegment(x, y, ax, ay, bx, by) <= radius) return true;
  }
  if (annotation.points.length === 2) {
    return (
      Math.hypot(
        x - fullToVisibleX(annotation.points[0], crop, canvasSize.width),
        y - fullToVisibleY(annotation.points[1], crop, canvasSize.height),
      ) <= radius
    );
  }
  return false;
}

type PointerSample = { x: number; y: number; pressure: number };

function appendStrokeSamples(
  annotation: WorksheetStroke,
  samples: PointerSample[],
  canvasSize: { width: number; height: number },
  crop: WorksheetCrop,
) {
  const points = [...annotation.points];
  const pressures = [...(annotation.pressures ?? [])];
  let lastX = points.length >= 2 ? points[points.length - 2] : samples[0].x;
  let lastY = points.length >= 2 ? points[points.length - 1] : samples[0].y;
  for (const sample of samples) {
    const distance = Math.hypot(
      ((sample.x - lastX) / crop.width) * canvasSize.width,
      ((sample.y - lastY) / crop.height) * canvasSize.height,
    );
    if (distance < 0.7) continue;
    points.push(sample.x, sample.y);
    pressures.push(sample.pressure);
    lastX = sample.x;
    lastY = sample.y;
  }
  return { ...annotation, points, pressures };
}

function normalizeCrop(crop: WorksheetCrop): WorksheetCrop {
  const x = Math.max(0, Math.min(0.99, Number(crop.x) || 0));
  const y = Math.max(0, Math.min(0.99, Number(crop.y) || 0));
  const width = Math.max(0.01, Math.min(1 - x, Number(crop.width) || 1));
  const height = Math.max(0.01, Math.min(1 - y, Number(crop.height) || 1));
  return { x, y, width, height };
}

function isFullPageCrop(crop: WorksheetCrop) {
  return (
    crop.x < 0.005 &&
    crop.y < 0.005 &&
    crop.width > 0.995 &&
    crop.height > 0.995
  );
}

function fullToVisibleX(value: number, crop: WorksheetCrop, width: number) {
  return ((value - crop.x) / crop.width) * width;
}

function fullToVisibleY(value: number, crop: WorksheetCrop, height: number) {
  return ((value - crop.y) / crop.height) * height;
}

async function detectTextRotation(page: PDFPageProxy) {
  try {
    const textContent = await page.getTextContent();
    const weights = [0, 0, 0, 0];
    for (const item of textContent.items) {
      if (!("transform" in item) || !("str" in item) || !item.str.trim()) continue;
      const angle = Math.atan2(item.transform[1], item.transform[0]);
      const quarterTurns = Math.round(angle / (Math.PI / 2));
      const index = ((quarterTurns % 4) + 4) % 4;
      weights[index] += Math.max(1, item.str.trim().length);
    }
    const total = weights.reduce((sum, value) => sum + value, 0);
    if (total < 8) return null;
    const dominant = weights.indexOf(Math.max(...weights));
    if (weights[dominant] / total < 0.62) return null;
    const contentRotation = dominant * 90;
    return (360 - ((contentRotation + page.rotate) % 360)) % 360;
  } catch {
    return null;
  }
}

function detectCanvasContentCrop(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 40 || canvas.height < 40) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const step = Math.max(2, Math.floor(Math.max(canvas.width, canvas.height) / 1200));
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const index = (y * canvas.width + x) * 4;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      const darkest = Math.min(red, green, blue);
      const lightest = Math.max(red, green, blue);
      if (alpha < 20 || (darkest > 247 && lightest - darkest < 7)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const paddingX = canvas.width * 0.025;
  const paddingY = canvas.height * 0.025;
  const x = Math.max(0, minX - paddingX) / canvas.width;
  const y = Math.max(0, minY - paddingY) / canvas.height;
  const right = Math.min(canvas.width, maxX + paddingX) / canvas.width;
  const bottom = Math.min(canvas.height, maxY + paddingY) / canvas.height;
  const crop = normalizeCrop({ x, y, width: right - x, height: bottom - y });
  const removedArea = 1 - crop.width * crop.height;
  return removedArea >= 0.12 ? crop : FULL_PAGE_CROP;
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const amount = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(px - (ax + amount * dx), py - (ay + amount * dy));
}

function teacherPageStatusLabel(
  page: WorksheetEditorPage | undefined,
  saveState: string,
) {
  if (saveState === "saving") return "กำลังบันทึกฉบับครู...";
  if (saveState === "saved") return "บันทึกฉบับครูแล้ว";
  if (saveState === "error") return "บันทึกไม่สำเร็จ";
  return page ? "ฉบับครูบันทึกแล้ว" : "หน้าว่างในฉบับครู";
}

function worksheetAvailability(worksheet: Worksheet) {
  const now = Date.now();
  if (!worksheet.acceptingSubmissions)
    return { state: "closed", label: "ปิดรับ", detail: "ปิดรับคำตอบ" };
  if (worksheet.opensAt && now < new Date(worksheet.opensAt).getTime())
    return {
      state: "scheduled",
      label: "ยังไม่เปิด",
      detail: `เปิด ${formatWorksheetDate(worksheet.opensAt)}`,
    };
  if (worksheet.closesAt && now >= new Date(worksheet.closesAt).getTime())
    return {
      state: "closed",
      label: "หมดเวลา",
      detail: `ปิดเมื่อ ${formatWorksheetDate(worksheet.closesAt)}`,
    };
  return {
    state: "open",
    label: "ทำได้",
    detail: worksheet.closesAt
      ? `ปิด ${formatWorksheetDate(worksheet.closesAt)}`
      : "ไม่กำหนดวันปิด",
  };
}

function firstIncompletePage(
  worksheet: Worksheet,
  answers: WorksheetPageAnswer[],
) {
  const worksheetAnswers = answers.filter(
    (answer) => answer.worksheetId === worksheet.id,
  );
  for (let pageNumber = 1; pageNumber <= worksheet.pageCount; pageNumber += 1) {
    const status = worksheetAnswers.find(
      (answer) => answer.pageNumber === pageNumber,
    )?.status;
    if (status !== "submitted" && status !== "reviewed") return pageNumber;
  }
  return 1;
}

function answerStatusLabel(
  status: WorksheetPageAnswer["status"] | undefined,
  saveState: string,
) {
  if (saveState === "saving") return "กำลังบันทึก...";
  if (saveState === "saved") return "บันทึกแล้ว";
  if (saveState === "error") return "บันทึกไม่สำเร็จ";
  if (status === "submitted") return "ส่งหน้านี้แล้ว";
  if (status === "reviewed") return "ตรวจแล้ว";
  if (status === "returned") return "ครูส่งกลับให้แก้ไข";
  if (status === "draft") return "ฉบับร่าง";
  return "ยังไม่บันทึก";
}

function formatWorksheetDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
