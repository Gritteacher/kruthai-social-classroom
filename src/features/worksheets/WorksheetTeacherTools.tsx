import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Link2,
  RotateCcw,
  Save,
  Users,
  X,
} from "lucide-react";
import type { Classroom, ScoreAssignment, StudentRecord } from "../../types";
import type {
  Worksheet,
  WorksheetGradeInput,
  WorksheetPageAnswer,
  WorksheetPageGrade,
  WorksheetScoreLink,
  WorksheetScoreLinkInput,
} from "./types";

type AssignmentGroupOption = {
  id: string;
  title: string;
  assignmentType: string;
  rawMax: number;
};

export function WorksheetScoreLinkModal({
  worksheet,
  assignments,
  links,
  grades,
  busy,
  onClose,
  onSave,
}: {
  worksheet: Worksheet;
  assignments: ScoreAssignment[];
  links: WorksheetScoreLink[];
  grades: WorksheetPageGrade[];
  busy: boolean;
  onClose: () => void;
  onSave: (
    worksheet: Worksheet,
    pageNumber: number,
    values: WorksheetScoreLinkInput[],
  ) => Promise<boolean>;
}) {
  const [pageNumber, setPageNumber] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const groups = useMemo(
    () => assignmentGroupsForWorksheet(worksheet, assignments),
    [assignments, worksheet],
  );
  const pageLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          link.worksheetId === worksheet.id && link.pageNumber === pageNumber,
      ),
    [links, pageNumber, worksheet.id],
  );

  useEffect(() => {
    setValues(
      Object.fromEntries(
        pageLinks.map((link) => [
          link.assignmentGroupId,
          formatWorksheetScore(link.pageMaxScore),
        ]),
      ),
    );
  }, [pageLinks]);

  const selectedGroups = groups.filter((group) => group.id in values);
  const invalidGroup = selectedGroups.find((group) => {
    const pageMax = Number(values[group.id]);
    const otherPages = links
      .filter(
        (link) =>
          link.worksheetId === worksheet.id &&
          link.assignmentGroupId === group.id &&
          link.pageNumber !== pageNumber,
      )
      .reduce((sum, link) => sum + link.pageMaxScore, 0);
    return !Number.isFinite(pageMax) || pageMax <= 0 || otherPages + pageMax > group.rawMax;
  });
  const pageTotal = selectedGroups.reduce(
    (sum, group) => sum + (Number(values[group.id]) || 0),
    0,
  );

  function linkHasGrades(groupId: string) {
    const link = pageLinks.find((item) => item.assignmentGroupId === groupId);
    return Boolean(link && grades.some((grade) => grade.scoreLinkId === link.id));
  }

  function toggleGroup(group: AssignmentGroupOption) {
    if (group.id in values) {
      if (linkHasGrades(group.id)) return;
      setValues((current) => {
        const next = { ...current };
        delete next[group.id];
        return next;
      });
      return;
    }
    const used = links
      .filter(
        (link) =>
          link.worksheetId === worksheet.id &&
          link.assignmentGroupId === group.id &&
          link.pageNumber !== pageNumber,
      )
      .reduce((sum, link) => sum + link.pageMaxScore, 0);
    setValues((current) => ({
      ...current,
      [group.id]: formatWorksheetScore(Math.max(1, group.rawMax - used)),
    }));
  }

  async function save() {
    if (invalidGroup) return;
    const ok = await onSave(
      worksheet,
      pageNumber,
      selectedGroups.map((group, index) => ({
        assignmentGroupId: group.id,
        pageMaxScore: Number(values[group.id]),
        sortOrder: index,
      })),
    );
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop worksheet-link-backdrop" role="presentation">
      <section
        className="worksheet-link-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worksheet-link-title"
      >
        <header>
          <div>
            <span>เชื่อมใบงานกับคะแนน</span>
            <h2 id="worksheet-link-title">{worksheet.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="ปิด">
            <X aria-hidden />
          </button>
        </header>

        <div className="worksheet-link-body">
          <label className="field worksheet-link-page-picker">
            หน้าที่ต้องการตั้งค่า
            <select
              value={pageNumber}
              onChange={(event) => setPageNumber(Number(event.target.value))}
            >
              {Array.from({ length: worksheet.pageCount }, (_, index) => index + 1).map(
                (page) => (
                  <option value={page} key={page}>
                    หน้า {page}
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="worksheet-link-summary">
            <span>
              <Link2 aria-hidden />
              เชื่อมแล้ว {selectedGroups.length} ช่อง
            </span>
            <strong>{formatWorksheetScore(pageTotal)} คะแนนในหน้านี้</strong>
          </div>

          {groups.length ? (
            <div className="worksheet-link-options">
              {groups.map((group) => {
                const selected = group.id in values;
                const locked = linkHasGrades(group.id);
                const usedOtherPages = links
                  .filter(
                    (link) =>
                      link.worksheetId === worksheet.id &&
                      link.assignmentGroupId === group.id &&
                      link.pageNumber !== pageNumber,
                  )
                  .reduce((sum, link) => sum + link.pageMaxScore, 0);
                const total = usedOtherPages + (Number(values[group.id]) || 0);
                const over = selected && total > group.rawMax;
                return (
                  <article className={`worksheet-link-option ${selected ? "selected" : ""}`} key={group.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={locked || busy}
                        onChange={() => toggleGroup(group)}
                      />
                      <span>
                        <strong>{group.title}</strong>
                        <small>
                          {group.assignmentType} · งานเต็ม {formatWorksheetScore(group.rawMax)}
                        </small>
                      </span>
                    </label>
                    {selected && (
                      <label className="worksheet-link-score-input">
                        คะแนนหน้านี้
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.01"
                          max={Math.max(0, group.rawMax - usedOtherPages)}
                          step="0.01"
                          value={values[group.id]}
                          disabled={busy}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [group.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    )}
                    {locked && <small className="worksheet-link-locked">มีคะแนนแล้ว จึงยกเลิกการเชื่อมไม่ได้</small>}
                    {over && (
                      <small className="worksheet-link-error">
                        รวมกับหน้าอื่นเป็น {formatWorksheetScore(total)} ซึ่งเกินคะแนนเต็ม
                      </small>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="worksheet-no-answers">
              ยังไม่มีงานคะแนนที่สร้างครบทุกห้องของใบงานนี้
            </div>
          )}
        </div>

        <footer>
          <button className="template-button" type="button" onClick={onClose} disabled={busy}>
            ยกเลิก
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy || Boolean(invalidGroup)}
            onClick={() => void save()}
          >
            <Save aria-hidden />
            {busy ? "กำลังบันทึก" : "บันทึกการเชื่อม"}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function WorksheetReviewPanel({
  classrooms,
  worksheets,
  students,
  assignments,
  answers,
  links,
  grades,
  busy,
  onPreview,
  onGrade,
  onReturn,
}: {
  classrooms: Classroom[];
  worksheets: Worksheet[];
  students: StudentRecord[];
  assignments: ScoreAssignment[];
  answers: WorksheetPageAnswer[];
  links: WorksheetScoreLink[];
  grades: WorksheetPageGrade[];
  busy: boolean;
  onPreview: (worksheet: Worksheet, answer: WorksheetPageAnswer) => void;
  onGrade: (answerIds: string[], values: WorksheetGradeInput[]) => Promise<boolean>;
  onReturn: (answerIds: string[]) => Promise<boolean>;
}) {
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id || "");
  const [worksheetId, setWorksheetId] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({});

  const roomWorksheets = useMemo(
    () => worksheets.filter((worksheet) => worksheet.classroomIds.includes(classroomId)),
    [classroomId, worksheets],
  );
  const activeWorksheet =
    roomWorksheets.find((worksheet) => worksheet.id === worksheetId) || roomWorksheets[0];
  const pendingAnswers = useMemo(
    () =>
      answers
        .filter(
          (answer) =>
            answer.classroomId === classroomId &&
            answer.worksheetId === activeWorksheet?.id &&
            answer.status === "submitted",
        )
        .sort((a, b) => a.pageNumber - b.pageNumber),
    [activeWorksheet?.id, answers, classroomId],
  );
  const studentGroups = useMemo(() => {
    const grouped = new Map<string, WorksheetPageAnswer[]>();
    pendingAnswers.forEach((answer) => {
      const current = grouped.get(answer.studentCode) || [];
      current.push(answer);
      grouped.set(answer.studentCode, current);
    });
    return [...grouped.entries()]
      .map(([code, items]) => ({
        code,
        name: items[0]?.studentName || code,
        no: students.find((student) => student.studentId === code)?.no ?? 999,
        items,
      }))
      .sort((a, b) => a.no - b.no || a.name.localeCompare(b.name, "th"));
  }, [pendingAnswers, students]);
  const activeStudent =
    studentGroups.find((group) => group.code === studentCode) || studentGroups[0];

  useEffect(() => {
    if (!classrooms.some((classroom) => classroom.id === classroomId)) {
      setClassroomId(classrooms[0]?.id || "");
    }
  }, [classroomId, classrooms]);

  useEffect(() => {
    if (!roomWorksheets.some((worksheet) => worksheet.id === worksheetId)) {
      setWorksheetId(roomWorksheets[0]?.id || "");
    }
  }, [roomWorksheets, worksheetId]);

  useEffect(() => {
    if (!studentGroups.some((group) => group.code === studentCode)) {
      setStudentCode(studentGroups[0]?.code || "");
    }
  }, [studentCode, studentGroups]);

  useEffect(() => {
    setSelectedIds([]);
    setScoreDrafts({});
  }, [activeStudent?.code, activeWorksheet?.id, classroomId]);

  function answerLinks(answer: WorksheetPageAnswer) {
    return links.filter(
      (link) =>
        link.worksheetId === answer.worksheetId &&
        link.pageNumber === answer.pageNumber,
    );
  }

  function scoreKey(answerId: string, linkId: string) {
    return `${answerId}:${linkId}`;
  }

  function scoreValue(answer: WorksheetPageAnswer, link: WorksheetScoreLink) {
    const key = scoreKey(answer.id, link.id);
    if (key in scoreDrafts) return scoreDrafts[key];
    const grade = grades.find(
      (item) => item.answerId === answer.id && item.scoreLinkId === link.id,
    );
    return grade ? formatWorksheetScore(grade.score) : "";
  }

  function assignmentForLink(link: WorksheetScoreLink) {
    return assignments.find(
      (assignment) =>
        assignment.assignmentGroupId === link.assignmentGroupId &&
        assignment.classroomId === classroomId,
    );
  }

  function toggleAnswer(answerId: string) {
    setSelectedIds((current) =>
      current.includes(answerId)
        ? current.filter((id) => id !== answerId)
        : [...current, answerId],
    );
  }

  function selectAll() {
    const ids = activeStudent?.items.map((answer) => answer.id) || [];
    setSelectedIds((current) => (current.length === ids.length ? [] : ids));
  }

  function fillFullScores() {
    const next = { ...scoreDrafts };
    activeStudent?.items
      .filter((answer) => selectedIds.includes(answer.id))
      .forEach((answer) => {
        answerLinks(answer).forEach((link) => {
          next[scoreKey(answer.id, link.id)] = formatWorksheetScore(link.pageMaxScore);
        });
      });
    setScoreDrafts(next);
  }

  async function saveSelected() {
    if (!selectedIds.length) return;
    const selectedAnswers = activeStudent?.items.filter((answer) => selectedIds.includes(answer.id)) || [];
    const gradeInputs: WorksheetGradeInput[] = [];
    for (const answer of selectedAnswers) {
      for (const link of answerLinks(answer)) {
        const rawValue = scoreValue(answer, link).trim();
        if (!rawValue) return;
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value < 0 || value > link.pageMaxScore) return;
        gradeInputs.push({ answerId: answer.id, scoreLinkId: link.id, score: value });
      }
    }
    const ok = await onGrade(selectedIds, gradeInputs);
    if (ok) setSelectedIds([]);
  }

  const selectedInvalid = (activeStudent?.items || [])
    .filter((answer) => selectedIds.includes(answer.id))
    .some((answer) =>
      answerLinks(answer).some((link) => {
        const rawValue = scoreValue(answer, link).trim();
        if (!rawValue) return true;
        const value = Number(rawValue);
        return !Number.isFinite(value) || value < 0 || value > link.pageMaxScore;
      }),
    );

  async function returnSelected() {
    if (!selectedIds.length) return;
    const ok = await onReturn(selectedIds);
    if (ok) setSelectedIds([]);
  }

  return (
    <section className="panel worksheet-review-panel">
      <div className="worksheet-section-heading">
        <div>
          <Users aria-hidden />
          <div>
            <h2>ตรวจใบงานรายบุคคล</h2>
            <span>แสดงเฉพาะนักเรียนที่มีหน้ารอตรวจ</span>
          </div>
        </div>
        <span>{pendingAnswers.length} หน้ารอตรวจ</span>
      </div>

      <div className="worksheet-review-filters">
        <label className="field">
          ห้องเรียน
          <select value={classroomId} onChange={(event) => setClassroomId(event.target.value)}>
            {classrooms.map((classroom) => (
              <option value={classroom.id} key={classroom.id}>
                {classroom.displayName}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          ใบงาน
          <select
            value={activeWorksheet?.id || ""}
            onChange={(event) => setWorksheetId(event.target.value)}
            disabled={!roomWorksheets.length}
          >
            {roomWorksheets.length ? (
              roomWorksheets.map((worksheet) => (
                <option value={worksheet.id} key={worksheet.id}>
                  {worksheet.title}
                </option>
              ))
            ) : (
              <option value="">ยังไม่มีใบงานในห้องนี้</option>
            )}
          </select>
        </label>
      </div>

      {studentGroups.length && activeStudent && activeWorksheet ? (
        <div className="worksheet-review-workspace">
          <aside className="worksheet-review-students" aria-label="นักเรียนที่มีงานรอตรวจ">
            {studentGroups.map((group) => (
              <button
                className={group.code === activeStudent.code ? "active" : ""}
                type="button"
                key={group.code}
                onClick={() => setStudentCode(group.code)}
              >
                <span>
                  <strong>{group.name}</strong>
                  <small>รหัส {group.code}</small>
                </span>
                <b>{group.items.length}</b>
              </button>
            ))}
          </aside>

          <div className="worksheet-review-detail">
            <header>
              <div>
                <span>นักเรียน</span>
                <h3>{activeStudent.name}</h3>
                <small>รหัส {activeStudent.code} · รอตรวจ {activeStudent.items.length} หน้า</small>
              </div>
              <button className="template-button" type="button" onClick={selectAll}>
                <CheckCircle2 aria-hidden />
                {selectedIds.length === activeStudent.items.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
              </button>
            </header>

            <div className="worksheet-review-pages">
              {activeStudent.items.map((answer) => {
                const pageLinks = answerLinks(answer);
                const selected = selectedIds.includes(answer.id);
                return (
                  <article className={`worksheet-review-page ${selected ? "selected" : ""}`} key={answer.id}>
                    <div className="worksheet-review-page-heading">
                      <label>
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={busy}
                          onChange={() => toggleAnswer(answer.id)}
                        />
                        <span>
                          <strong>หน้า {answer.pageNumber}</strong>
                          <small>ส่งแล้ว · รอตรวจ</small>
                        </span>
                      </label>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => onPreview(activeWorksheet, answer)}
                        aria-label={`ดูหน้า ${answer.pageNumber}`}
                        title="ดูตัวอย่างงาน"
                      >
                        <Eye aria-hidden />
                      </button>
                    </div>

                    {pageLinks.length ? (
                      <div className="worksheet-review-score-fields">
                        {pageLinks.map((link) => {
                          const assignment = assignmentForLink(link);
                          return (
                            <label key={link.id}>
                              <span>
                                <strong>{assignment?.title || "งานคะแนน"}</strong>
                                <small>เต็ม {formatWorksheetScore(link.pageMaxScore)}</small>
                              </span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                max={link.pageMaxScore}
                                step="0.01"
                                placeholder="คะแนน"
                                value={scoreValue(answer, link)}
                                disabled={busy}
                                onFocus={() => {
                                  if (!selected) toggleAnswer(answer.id);
                                }}
                                onChange={(event) =>
                                  setScoreDrafts((current) => ({
                                    ...current,
                                    [scoreKey(answer.id, link.id)]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="worksheet-review-unlinked">
                        หน้านี้ไม่เชื่อมคะแนน สามารถเลือกแล้วบันทึกเพื่อตรวจรับได้
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <footer className="worksheet-review-actions">
              <span>เลือกแล้ว {selectedIds.length} หน้า</span>
              <div>
                <button
                  className="template-button"
                  type="button"
                  disabled={!selectedIds.length || busy}
                  onClick={fillFullScores}
                >
                  <CheckCircle2 aria-hidden />
                  ให้คะแนนเต็ม
                </button>
                <button
                  className="template-button"
                  type="button"
                  disabled={!selectedIds.length || busy}
                  onClick={() => void returnSelected()}
                >
                  <RotateCcw aria-hidden />
                  ส่งกลับแก้ไข
                </button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!selectedIds.length || selectedInvalid || busy}
                  onClick={() => void saveSelected()}
                >
                  <Save aria-hidden />
                  {busy ? "กำลังบันทึก" : "บันทึกคะแนนและตรวจแล้ว"}
                </button>
              </div>
              {selectedInvalid && (
                <small className="worksheet-review-validation">
                  กรุณากรอกคะแนนทุกช่องให้ครบ และไม่เกินคะแนนเต็ม
                </small>
              )}
            </footer>
          </div>
        </div>
      ) : (
        <div className="worksheet-empty compact">
          <CheckCircle2 aria-hidden />
          <strong>ไม่มีใบงานรอตรวจ</strong>
          <span>เมื่อนักเรียนส่งหน้าใหม่ รายชื่อจะปรากฏที่นี่</span>
        </div>
      )}
    </section>
  );
}

function assignmentGroupsForWorksheet(
  worksheet: Worksheet,
  assignments: ScoreAssignment[],
): AssignmentGroupOption[] {
  const groups = new Map<string, ScoreAssignment[]>();
  assignments.forEach((assignment) => {
    if (!assignment.assignmentGroupId || !assignment.classroomId) return;
    if (!worksheet.classroomIds.includes(assignment.classroomId)) return;
    const current = groups.get(assignment.assignmentGroupId) || [];
    current.push(assignment);
    groups.set(assignment.assignmentGroupId, current);
  });
  return [...groups.entries()]
    .filter(([, items]) =>
      worksheet.classroomIds.every((classroomId) =>
        items.some((assignment) => assignment.classroomId === classroomId),
      ),
    )
    .map(([id, items]) => ({
      id,
      title: items[0].title,
      assignmentType: items[0].assignmentType,
      rawMax: Math.min(...items.map((assignment) => assignment.rawMax)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "th"));
}

function formatWorksheetScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
