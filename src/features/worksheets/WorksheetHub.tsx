import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Layer, Line, Stage, Text as KonvaText } from "react-konva";
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
  Pencil,
  Redo2,
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
  getWorksheetUrl,
  saveWorksheetPage,
  worksheetError,
} from "./service";
import type {
  Worksheet,
  WorksheetAnnotation,
  WorksheetDraft,
  WorksheetPageAnswer,
  WorksheetStroke,
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

export default function WorksheetHub({
  role,
  classrooms,
  students,
  currentStudent,
  flash,
}: WorksheetHubProps) {
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [answers, setAnswers] = useState<WorksheetPageAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<WorksheetDraft>(emptyDraft);
  const [activeWorksheet, setActiveWorksheet] = useState<Worksheet | null>(
    null,
  );
  const [previewAnswer, setPreviewAnswer] =
    useState<WorksheetPageAnswer | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [nextWorksheets, nextAnswers] = await Promise.all([
        fetchWorksheets(),
        fetchWorksheetAnswers(),
      ]);
      setWorksheets(nextWorksheets);
      setAnswers(nextAnswers);
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
          onPreview={(worksheet, answer) => {
            setActiveWorksheet(worksheet);
            setPreviewAnswer(answer);
          }}
        />
        {activeWorksheet && previewAnswer && (
          <WorksheetEditorModal
            worksheet={activeWorksheet}
            answers={[previewAnswer]}
            initialPage={previewAnswer.pageNumber}
            readOnly
            onClose={() => {
              setActiveWorksheet(null);
              setPreviewAnswer(null);
            }}
            onSaved={updateAnswer}
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
          answers={answers.filter(
            (answer) => answer.worksheetId === activeWorksheet.id,
          )}
          initialPage={firstIncompletePage(activeWorksheet, answers)}
          readOnly={false}
          onClose={() => setActiveWorksheet(null)}
          onSaved={updateAnswer}
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
  onPreview,
}: {
  worksheets: Worksheet[];
  answers: WorksheetPageAnswer[];
  classrooms: Classroom[];
  students: StudentRecord[];
  busy: boolean;
  onDelete: (worksheet: Worksheet) => void;
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

function WorksheetEditorModal({
  worksheet,
  answers,
  initialPage,
  readOnly,
  onClose,
  onSaved,
  flash,
}: {
  worksheet: Worksheet;
  answers: WorksheetPageAnswer[];
  initialPage: number;
  readOnly: boolean;
  onClose: () => void;
  onSaved: (answer: WorksheetPageAnswer) => void;
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
            <span>{readOnly ? "ตัวอย่างงานนักเรียน" : "สมุดงานออนไลน์"}</span>
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
          answers={answers}
          initialPage={initialPage}
          readOnly={readOnly}
          onSaved={onSaved}
          flash={flash}
        />
      </section>
    </div>
  );
}

function WorksheetEditor({
  worksheet,
  answers,
  initialPage,
  readOnly,
  onSaved,
  flash,
}: {
  worksheet: Worksheet;
  answers: WorksheetPageAnswer[];
  initialPage: number;
  readOnly: boolean;
  onSaved: (answer: WorksheetPageAnswer) => void;
  flash: (message: string) => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [annotations, setAnnotations] = useState<WorksheetAnnotation[]>([]);
  const [tool, setTool] = useState<WorksheetTool>("pen");
  const [color, setColor] = useState("#1d1d1f");
  const [textDraft, setTextDraft] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 760, height: 980 });
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageShellRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const activeStrokeIdRef = useRef("");
  const pastRef = useRef<WorksheetAnnotation[][]>([]);
  const futureRef = useRef<WorksheetAnnotation[][]>([]);
  const annotationsRef = useRef<WorksheetAnnotation[]>([]);
  const answer = answers.find((item) => item.pageNumber === pageNumber);
  const pageLocked =
    readOnly || answer?.status === "submitted" || answer?.status === "reviewed";
  const locked = pageLocked || saveState === "saving";

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);
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
        if (!cancelled) setPdf(loaded);
      })
      .catch((error) => flash(worksheetError(error, "เปิด PDF ไม่สำเร็จ")))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [worksheet.id]);

  useEffect(() => {
    const next =
      answers.find((item) => item.pageNumber === pageNumber)?.annotations ?? [];
    setAnnotations(next);
    annotationsRef.current = next;
    pastRef.current = [];
    futureRef.current = [];
    setSaveState("idle");
  }, [answers, pageNumber]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !pageShellRef.current) return;
    let cancelled = false;
    const pageShell = pageShellRef.current;
    const viewportElement = pageShell.parentElement;
    const render = async () => {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const viewportWidth = viewportElement?.clientWidth || window.innerWidth;
      const availableWidth = Math.min(900, Math.max(280, viewportWidth - 36));
      const scale = availableWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setCanvasSize({ width: viewport.width, height: viewport.height });
      const context = canvas.getContext("2d");
      if (!context) return;
      await page.render({
        canvasContext: context,
        canvas,
        viewport,
        transform:
          outputScale === 1
            ? undefined
            : [outputScale, 0, 0, outputScale, 0, 0],
      }).promise;
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
  }, [pdf, pageNumber]);

  useEffect(() => {
    if (readOnly || locked || saveState !== "dirty") return;
    const timer = window.setTimeout(() => void persistPage(false), 900);
    return () => window.clearTimeout(timer);
  }, [annotations, locked, readOnly, saveState]);

  function recordChange(next: WorksheetAnnotation[]) {
    pastRef.current.push(annotationsRef.current);
    if (pastRef.current.length > 40) pastRef.current.shift();
    futureRef.current = [];
    annotationsRef.current = next;
    setAnnotations(next);
    setSaveState("dirty");
  }

  function normalizedPoint(event: KonvaEventObject<PointerEvent>) {
    const position = event.target.getStage()?.getPointerPosition();
    if (!position) return null;
    return {
      x: position.x / canvasSize.width,
      y: position.y / canvasSize.height,
    };
  }

  function handlePointerDown(event: KonvaEventObject<PointerEvent>) {
    if (locked) return;
    const point = normalizedPoint(event);
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
    if (tool !== "pen") return;
    drawingRef.current = true;
    const id = crypto.randomUUID();
    activeStrokeIdRef.current = id;
    pastRef.current.push(annotationsRef.current);
    futureRef.current = [];
    const next = [
      ...annotationsRef.current,
      {
        id,
        kind: "stroke",
        points: [point.x, point.y],
        color,
        width: 3,
      } satisfies WorksheetStroke,
    ];
    annotationsRef.current = next;
    setAnnotations(next);
    setSaveState("dirty");
  }

  function handlePointerMove(event: KonvaEventObject<PointerEvent>) {
    if (!drawingRef.current || locked || tool !== "pen") return;
    const point = normalizedPoint(event);
    if (!point) return;
    const next = annotationsRef.current.map((annotation) =>
      annotation.id === activeStrokeIdRef.current &&
      annotation.kind === "stroke"
        ? { ...annotation, points: [...annotation.points, point.x, point.y] }
        : annotation,
    );
    annotationsRef.current = next;
    setAnnotations(next);
    setSaveState("dirty");
  }

  function stopDrawing() {
    drawingRef.current = false;
    activeStrokeIdRef.current = "";
  }

  function eraseAnnotation(id: string) {
    if (locked || tool !== "eraser") return;
    recordChange(
      annotationsRef.current.filter((annotation) => annotation.id !== id),
    );
  }

  function undo() {
    const previous = pastRef.current.pop();
    if (!previous || locked) return;
    futureRef.current.push(annotationsRef.current);
    annotationsRef.current = previous;
    setAnnotations(previous);
    setSaveState("dirty");
  }

  function redo() {
    const next = futureRef.current.pop();
    if (!next || locked) return;
    pastRef.current.push(annotationsRef.current);
    annotationsRef.current = next;
    setAnnotations(next);
    setSaveState("dirty");
  }

  async function persistPage(submit: boolean) {
    if (readOnly || locked) return answer;
    if (
      submit &&
      !window.confirm(
        `ส่งสมุดงานหน้า ${pageNumber} หรือไม่ เมื่อส่งแล้วจะไม่สามารถแก้ไขหน้านี้ได้`,
      )
    )
      return;
    setSaveState("saving");
    try {
      const saved = await saveWorksheetPage(
        worksheet.id,
        pageNumber,
        annotationsRef.current,
        submit,
      );
      onSaved(saved);
      setSaveState("saved");
      if (submit) flash(`ส่งหน้า ${pageNumber} แล้ว`);
      return saved;
    } catch (error) {
      setSaveState("error");
      flash(
        worksheetError(
          error,
          submit ? "ส่งหน้านี้ไม่สำเร็จ" : "บันทึกฉบับร่างไม่สำเร็จ",
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

  const statusLabel = readOnly
    ? `งานของ ${answer?.studentName || "นักเรียน"}`
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
              className={`worksheet-annotation-stage tool-${tool}`}
              width={canvasSize.width}
              height={canvasSize.height}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
            >
              <Layer>
                {annotations.map((annotation) =>
                  annotation.kind === "stroke" ? (
                    <Line
                      key={annotation.id}
                      points={annotation.points.map(
                        (value, index) =>
                          value *
                          (index % 2 === 0
                            ? canvasSize.width
                            : canvasSize.height),
                      )}
                      stroke={annotation.color}
                      strokeWidth={annotation.width}
                      lineCap="round"
                      lineJoin="round"
                      tension={0.2}
                      listening={tool === "eraser" && !locked}
                      onPointerDown={() => eraseAnnotation(annotation.id)}
                    />
                  ) : (
                    <KonvaText
                      key={annotation.id}
                      x={annotation.x * canvasSize.width}
                      y={annotation.y * canvasSize.height}
                      text={annotation.text}
                      fill={annotation.color}
                      fontSize={annotation.fontSize}
                      fontFamily="Prompt"
                      width={Math.max(
                        120,
                        canvasSize.width - annotation.x * canvasSize.width - 12,
                      )}
                      listening={tool === "eraser" && !locked}
                      onPointerDown={() => eraseAnnotation(annotation.id)}
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
            บันทึกฉบับร่าง
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={locked}
            onClick={() => void persistPage(true)}
          >
            <Send aria-hidden />
            ส่งหน้านี้
          </button>
        </footer>
      )}
    </div>
  );
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
