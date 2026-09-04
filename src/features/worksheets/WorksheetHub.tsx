import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  FileText,
  Link2,
  Maximize2,
  Pencil,
  RotateCcw,
  RotateCw,
  Save,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Classroom, Role, ScoreAssignment, StudentRecord } from "../../types";
import {
  createWorksheet,
  deleteWorksheet,
  fetchWorksheetAnswers,
  fetchWorksheetPageGrades,
  fetchWorksheetScoreLinks,
  fetchWorksheets,
  fetchTeacherWorksheetPages,
  gradeWorksheetPages,
  getWorksheetUrl,
  replaceWorksheetPageScoreLinks,
  rotateAllWorksheetPages,
  returnWorksheetPages,
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
  WorksheetGradeInput,
  WorksheetPageAnswer,
  WorksheetPageGrade,
  WorksheetPageView,
  WorksheetScoreLink,
  WorksheetScoreLinkInput,
  WorksheetTeacherPage,
} from "./types";
import {
  ExcalidrawWorksheetCanvas,
} from "./ExcalidrawWorksheetCanvas";
import {
  WorksheetReviewPanel,
  WorksheetScoreLinkModal,
} from "./WorksheetTeacherTools";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type WorksheetHubProps = {
  role: Role;
  classrooms: Classroom[];
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  currentStudent?: StudentRecord;
  onScoresChanged: () => Promise<void>;
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
  assignments,
  currentStudent,
  onScoresChanged,
  flash,
}: WorksheetHubProps) {
  const [worksheets, setWorksheets] = useState<Worksheet[]>([]);
  const [answers, setAnswers] = useState<WorksheetPageAnswer[]>([]);
  const [teacherPages, setTeacherPages] = useState<WorksheetTeacherPage[]>([]);
  const [scoreLinks, setScoreLinks] = useState<WorksheetScoreLink[]>([]);
  const [pageGrades, setPageGrades] = useState<WorksheetPageGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<WorksheetDraft>(emptyDraft);
  const [activeWorksheet, setActiveWorksheet] = useState<Worksheet | null>(
    null,
  );
  const [previewAnswer, setPreviewAnswer] =
    useState<WorksheetPageAnswer | null>(null);
  const [teacherWriting, setTeacherWriting] = useState(false);
  const [linkWorksheet, setLinkWorksheet] = useState<Worksheet | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const [
        nextWorksheets,
        nextAnswers,
        nextTeacherPages,
        nextScoreLinks,
        nextPageGrades,
      ] = await Promise.all([
        fetchWorksheets(),
        fetchWorksheetAnswers(),
        role === "teacher" ? fetchTeacherWorksheetPages() : Promise.resolve([]),
        role === "teacher" ? fetchWorksheetScoreLinks() : Promise.resolve([]),
        role === "teacher" ? fetchWorksheetPageGrades() : Promise.resolve([]),
      ]);
      setWorksheets(nextWorksheets);
      setAnswers(nextAnswers);
      setTeacherPages(nextTeacherPages);
      setScoreLinks(nextScoreLinks);
      setPageGrades(nextPageGrades);
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

  async function saveScoreLinks(
    worksheet: Worksheet,
    pageNumber: number,
    values: WorksheetScoreLinkInput[],
  ) {
    setBusy(true);
    try {
      const saved = await replaceWorksheetPageScoreLinks(
        worksheet.id,
        pageNumber,
        values,
      );
      setScoreLinks((current) => [
        ...current.filter((link) => link.worksheetId !== worksheet.id),
        ...saved,
      ]);
      flash(
        values.length
          ? `เชื่อมหน้า ${pageNumber} กับ ${values.length} ช่องคะแนนแล้ว`
          : `ยกเลิกการเชื่อมคะแนนของหน้า ${pageNumber} แล้ว`,
      );
      return true;
    } catch (error) {
      flash(worksheetError(error, "บันทึกการเชื่อมคะแนนไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function gradeSelectedPages(
    answerIds: string[],
    values: WorksheetGradeInput[],
  ) {
    setBusy(true);
    try {
      const savedAnswers = await gradeWorksheetPages(answerIds, values);
      const savedById = new Map(savedAnswers.map((answer) => [answer.id, answer]));
      setAnswers((current) =>
        current.map((answer) => savedById.get(answer.id) || answer),
      );
      setPageGrades(await fetchWorksheetPageGrades());
      await onScoresChanged();
      flash(
        `ตรวจแล้ว ${savedAnswers.length} หน้า คะแนนอัปเดตในตารางคะแนนเรียบร้อย`,
      );
      return true;
    } catch (error) {
      flash(worksheetError(error, "บันทึกคะแนนใบงานไม่สำเร็จ"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function returnSelectedPages(answerIds: string[]) {
    setBusy(true);
    try {
      const savedAnswers = await returnWorksheetPages(answerIds);
      const savedById = new Map(savedAnswers.map((answer) => [answer.id, answer]));
      setAnswers((current) =>
        current.map((answer) => savedById.get(answer.id) || answer),
      );
      flash(`ส่งกลับให้นักเรียนแก้ไข ${savedAnswers.length} หน้าแล้ว`);
      return true;
    } catch (error) {
      flash(worksheetError(error, "ส่งใบงานกลับแก้ไขไม่สำเร็จ"));
      return false;
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
        <WorksheetReviewPanel
          classrooms={classrooms}
          worksheets={worksheets}
          students={students}
          assignments={assignments}
          answers={answers}
          links={scoreLinks}
          grades={pageGrades}
          busy={busy}
          onPreview={(worksheet, answer) => {
            setActiveWorksheet(worksheet);
            setPreviewAnswer(answer);
            setTeacherWriting(false);
          }}
          onGrade={gradeSelectedPages}
          onReturn={returnSelectedPages}
        />
        <TeacherWorksheetList
          worksheets={worksheets}
          answers={answers}
          classrooms={classrooms}
          students={students}
          scoreLinks={scoreLinks}
          busy={busy}
          onDelete={(worksheet) => void removeWorksheet(worksheet)}
          onWrite={(worksheet) => {
            setActiveWorksheet(worksheet);
            setPreviewAnswer(null);
            setTeacherWriting(true);
          }}
          onLink={setLinkWorksheet}
          onPreview={(worksheet, answer) => {
            setActiveWorksheet(worksheet);
            setPreviewAnswer(answer);
            setTeacherWriting(false);
          }}
        />
        {linkWorksheet && (
          <WorksheetScoreLinkModal
            worksheet={linkWorksheet}
            assignments={assignments}
            links={scoreLinks}
            grades={pageGrades}
            busy={busy}
            onClose={() => setLinkWorksheet(null)}
            onSave={saveScoreLinks}
          />
        )}
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
  scoreLinks,
  busy,
  onDelete,
  onWrite,
  onLink,
  onPreview,
}: {
  worksheets: Worksheet[];
  answers: WorksheetPageAnswer[];
  classrooms: Classroom[];
  students: StudentRecord[];
  scoreLinks: WorksheetScoreLink[];
  busy: boolean;
  onDelete: (worksheet: Worksheet) => void;
  onWrite: (worksheet: Worksheet) => void;
  onLink: (worksheet: Worksheet) => void;
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
            const linkedPages = new Set(
              scoreLinks
                .filter((link) => link.worksheetId === worksheet.id)
                .map((link) => link.pageNumber),
            ).size;
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
                  <span>
                    {worksheetAvailability(worksheet).detail} · เชื่อมคะแนนแล้ว {linkedPages}/{worksheet.pageCount} หน้า
                  </span>
                  <div>
                    <button
                      className="template-button worksheet-link-button"
                      type="button"
                      disabled={busy}
                      onClick={() => onLink(worksheet)}
                    >
                      <Link2 aria-hidden />
                      เชื่อมคะแนน
                    </button>
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
  const [pageImage, setPageImage] = useState<{
    dataUrl: string;
    width: number;
    height: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "dirty" | "saving" | "saved" | "error"
  >("idle");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationsRef = useRef<WorksheetAnnotation[]>([]);
  const rotationRef = useRef(0);
  const cropRef = useRef<WorksheetCrop>(FULL_PAGE_CROP);
  const orientationCheckedRef = useRef(new Set<number>());
  const saveInFlightRef = useRef(false);
  const readOnly = mode === "preview";
  const pageRecord = pages.find((item) => item.pageNumber === pageNumber);
  const answer = isStudentAnswer(pageRecord) ? pageRecord : undefined;
  const pageLocked =
    readOnly ||
    (mode === "student" &&
      (answer?.status === "submitted" || answer?.status === "reviewed"));
  const locked = pageLocked || saveInFlight;

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
    setSaveState("idle");
  }, [pageNumber, worksheet.id, worksheet.pageSettings]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    setPageImage(null);
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
      const sceneWidth = 1200;
      const scale = sceneWidth / (baseViewport.width * activeCrop.width);
      const viewport = page.getViewport({ scale, rotation: pdfRotation });
      const outputScale = 1.5;
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
          return;
        }
      }
      if (!cancelled) {
        setPageImage({
          dataUrl: canvas.toDataURL("image/png"),
          width: displayWidth,
          height: displayHeight,
        });
      }
    };
    void render().catch((error) =>
      flash(worksheetError(error, "แสดงหน้าสมุดงานไม่สำเร็จ")),
    );
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, rotation, crop, worksheet.pageSettings]);

  useEffect(() => {
    if (readOnly || pageLocked || saveInFlight || saveState !== "dirty") return;
    const timer = window.setTimeout(() => void persistPage(false), 900);
    return () => window.clearTimeout(timer);
  }, [annotations, pageLocked, readOnly, saveInFlight, saveState]);

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

  async function persistPage(submit: boolean) {
    if (readOnly || pageLocked || saveInFlightRef.current) return pageRecord;
    if (
      submit &&
      !window.confirm(
        `ส่งสมุดงานหน้า ${pageNumber} หรือไม่ เมื่อส่งแล้วจะไม่สามารถแก้ไขหน้านี้ได้`,
      )
    )
      return;
    const savingAnnotations = annotationsRef.current;
    saveInFlightRef.current = true;
    setSaveInFlight(true);
    if (submit) setSubmitting(true);
    setSaveState("saving");
    try {
      const saved =
        mode === "teacher"
          ? await saveTeacherWorksheetPage(
              worksheet.id,
              pageNumber,
              savingAnnotations,
              rotationRef.current,
            )
          : await saveWorksheetPage(
              worksheet.id,
              pageNumber,
              savingAnnotations,
              rotationRef.current,
              submit,
            );
      if (mode === "teacher") onTeacherSaved(saved as WorksheetTeacherPage);
      else onStudentSaved(saved as WorksheetPageAnswer);
      setSaveState(
        annotationsRef.current === savingAnnotations ? "saved" : "dirty",
      );
      if (submit) {
        flash(`ส่งหน้า ${pageNumber} แล้ว`);

      }
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
    } finally {
      saveInFlightRef.current = false;
      setSaveInFlight(false);
      if (submit) setSubmitting(false);
    }
  }

  async function goToPage(nextPage: number) {
    if (saveInFlightRef.current) return;
    if (
      nextPage < 1 ||
      nextPage > worksheet.pageCount ||
      nextPage === pageNumber
    )
      return;
    if (
      (saveState === "dirty" || saveState === "error") &&
      !locked &&
      !readOnly
    ) {
      const saved = await persistPage(false);
      if (!saved) return;
    }
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
            disabled={pageNumber <= 1 || saveInFlight}
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
            disabled={pageNumber >= worksheet.pageCount || saveInFlight}
            onClick={() => void goToPage(pageNumber + 1)}
            aria-label="หน้าถัดไป"
          >
            <ChevronRight aria-hidden />
          </button>
        </div>
        {!readOnly && mode === "teacher" && (
          <div
            className="worksheet-tools worksheet-page-tools"
            role="toolbar"
            aria-label="จัดแนวหน้าสมุดงาน"
          >
            <button
              type="button"
              disabled={locked || viewBusy || annotations.length > 0}
              onClick={() => void rotatePage(-90)}
              title="หมุนซ้าย"
              aria-label="หมุนหน้าซ้าย"
            >
              <RotateCcw aria-hidden />
            </button>
            <button
              type="button"
              disabled={locked || viewBusy || annotations.length > 0}
              onClick={() => void rotatePage(90)}
              title="หมุนขวา"
              aria-label="หมุนหน้าขวา"
            >
              <RotateCw aria-hidden />
            </button>
            <button
              type="button"
              disabled={locked || viewBusy || annotations.length > 0}
              onClick={() => void fitPageContent()}
              title="จัดหน้าให้พอดีกับเนื้อหา"
            >
              <Maximize2 aria-hidden />
              <span>พอดีเนื้อหา</span>
            </button>
            <button
              className="worksheet-rotate-all"
              type="button"
              disabled={locked || viewBusy || annotations.length > 0}
              onClick={() => void rotateEveryPage()}
              title="กลับหัวทุกหน้า 180 องศา"
            >
              <RotateCw aria-hidden />
              <span>กลับหัวทุกหน้า</span>
            </button>
          </div>
        )}
        <div className="worksheet-editor-toolbar-meta">
          <span
            className={`worksheet-save-state ${saveState}`}
            title={statusLabel}
          >
            {pageLocked && !readOnly ? (
              <CheckCircle2 aria-hidden />
            ) : (
              <Save aria-hidden />
            )}
            <span>{statusLabel}</span>
          </span>
          {answer?.submittedAt && (
            <small>ส่งเมื่อ {formatWorksheetDate(answer.submittedAt)}</small>
          )}
        </div>
        {!readOnly && (
          <div className="worksheet-editor-toolbar-actions">
            <button
              className="template-button"
              type="button"
              disabled={locked}
              onClick={() => void persistPage(false)}
              aria-label={
                mode === "teacher" ? "บันทึกฉบับครู" : "บันทึกฉบับร่าง"
              }
              title={
                mode === "teacher" ? "บันทึกฉบับครู" : "บันทึกฉบับร่าง"
              }
            >
              <Save aria-hidden />
              <span>
                {mode === "teacher" ? "บันทึกฉบับครู" : "บันทึกฉบับร่าง"}
              </span>
            </button>
            {mode === "student" && (
              <button
                className="primary-button"
                type="button"
                disabled={locked}
                onClick={() => void persistPage(true)}
                aria-label="ส่งหน้านี้"
                title="ส่งหน้านี้"
              >
                <Send aria-hidden />
                <span>ส่งหน้านี้</span>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="worksheet-excalidraw-viewport">
        <canvas className="worksheet-render-canvas" ref={canvasRef} />
        {!loading && pageImage ? (
          <ExcalidrawWorksheetCanvas
            key={`${worksheet.id}-${pageNumber}-${rotation}-${crop.x}-${crop.y}-${crop.width}-${crop.height}`}
            image={pageImage}
            annotations={annotations}
            crop={crop}
            readOnly={pageLocked || submitting}
            sceneKey={`${worksheet.id}-${pageNumber}`}
            onChange={(next) => {
              annotationsRef.current = next;
              setAnnotations(next);
              setSaveState("dirty");
            }}
          />
        ) : (
          <div className="worksheet-page-loading">กำลังเตรียมหน้าสำหรับเขียน...</div>
        )}
      </div>
    </div>
  );
}

function isStudentAnswer(
  page: WorksheetEditorPage | undefined,
): page is WorksheetPageAnswer {
  return Boolean(page && "status" in page);
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
