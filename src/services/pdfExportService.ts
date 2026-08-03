// @ts-nocheck
// Browser export bridge for jsPDF/autotable. Keeping this unchecked avoids expensive
// third-party type resolution while the public API remains typed in pdfExportService.d.ts.
const FONT_NAME = "PromptPdf";
const FONT_FILE = "Prompt-Regular.ttf";
const PDF_PAGE_MARGIN = 8;

const ASSIGNMENT_TYPE_COLORS = {
  "ทั่วไป": { fill: [238, 240, 243], text: [63, 63, 70] },
  "ใบงาน": { fill: [225, 239, 255], text: [24, 77, 140] },
  "แบบฝึกหัด": { fill: [222, 246, 239], text: [20, 100, 78] },
  "กิจกรรม": { fill: [255, 239, 213], text: [146, 78, 0] },
  "สอบ": { fill: [255, 226, 226], text: [158, 44, 44] },
  "โครงงาน": { fill: [238, 229, 255], text: [98, 58, 148] }
};

let fontReady = null;

export async function exportClassroomScorePdf(payload) {
  validateScoreExportPayload(payload, "PDF");

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable")
  ]);
  const assignmentRefs = buildAssignmentRefs(payload.assignments);
  const paperFormat = pdfPaperFormat(payload.students.length, assignmentRefs.length);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: paperFormat });
  await ensurePromptFont(doc);
  doc.setFont(FONT_NAME, "normal");

  const generatedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const totalMax = payload.assignments.reduce((sum, assignment) => sum + assignment.finalMax, 0);
  const classroomName = payload.classroom.displayName;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const assignmentTypeRuns = buildAssignmentTypeRuns(assignmentRefs);
  const legendColumns = pageWidth > 350 ? 5 : 3;
  const legendRows = buildAssignmentLegendRows(assignmentRefs, legendColumns);
  const metrics = pdfLayoutMetrics(payload.students.length, assignmentRefs.length, pageHeight, legendRows.length);

  doc.setFontSize(15);
  doc.text("รายงานคะแนนนักเรียนรายห้อง", 8, 12);
  doc.setFontSize(8.5);
  doc.text(payload.schoolName, 8, 18);
  doc.text(`${classroomName} · ปีการศึกษา ${payload.classroom.academicYear}`, 8, 23);
  doc.text(`ส่งออกเมื่อ ${generatedAt} · นักเรียน ${payload.students.length} คน · งาน ${payload.assignments.length} งาน · คะแนนเต็มรวม ${formatPdfScore(totalMax)} คะแนน`, 8, 28);

  autoTable(doc, {
    head: [
      [
        { content: "ข้อมูลนักเรียน", colSpan: 3, styles: { fillColor: [247, 248, 250], textColor: [24, 24, 27] } },
        ...assignmentTypeRuns.map((run) => {
          const color = assignmentTypeColor(run.type);
          return { content: run.type, colSpan: run.count, styles: { fillColor: color.fill, textColor: color.text } };
        }),
        { content: "คะแนน", styles: { fillColor: [247, 248, 250], textColor: [24, 24, 27] } }
      ],
      [
        "เลขที่",
        "รหัส",
        "ชื่อ-นามสกุล",
        ...assignmentRefs.map((assignment) => String(assignment.no)),
        "รวม"
      ]
    ],
    body: payload.students.map((student) => buildStudentScoreRow(student, assignmentRefs, payload.entries)),
    startY: 32,
    theme: "grid",
    styles: {
      font: FONT_NAME,
      fontStyle: "normal",
      fontSize: metrics.tableFontSize,
      cellPadding: metrics.cellPadding,
      lineColor: [220, 226, 232],
      lineWidth: 0.12,
      minCellHeight: metrics.minCellHeight,
      valign: "middle",
      overflow: "linebreak"
    },
    headStyles: {
      fillColor: [247, 248, 250],
      textColor: [24, 24, 27],
      fontStyle: "normal",
      halign: "center"
    },
    bodyStyles: {
      textColor: [39, 39, 42]
    },
    alternateRowStyles: {
      fillColor: [252, 252, 253]
    },
    columnStyles: pdfScoreColumnStyles(assignmentRefs.length, pageWidth),
    didParseCell: (hook) => styleAssignmentCell(hook, assignmentRefs),
    margin: { left: PDF_PAGE_MARGIN, right: PDF_PAGE_MARGIN, top: 6, bottom: 6 },
    pageBreak: "avoid",
    rowPageBreak: "avoid"
  });

  const tableEndY = (doc.lastAutoTable?.finalY ?? 146) + 5;
  doc.setFontSize(8);
  doc.text("รหัสงาน", 8, tableEndY);
  autoTable(doc, {
    body: legendRows,
    startY: tableEndY + 2,
    theme: "plain",
    styles: {
      font: FONT_NAME,
      fontStyle: "normal",
      fontSize: metrics.legendFontSize,
      cellPadding: 0.8,
      minCellHeight: 3,
      textColor: [63, 63, 70],
      overflow: "ellipsize"
    },
    columnStyles: pdfLegendColumnStyles(legendColumns, pageWidth),
    didParseCell: (hook) => styleLegendCell(hook, legendColumns),
    margin: { left: PDF_PAGE_MARGIN, right: PDF_PAGE_MARGIN, top: 6, bottom: 6 },
    pageBreak: "avoid",
    rowPageBreak: "avoid"
  });

  const result = {
    pageCount: doc.getNumberOfPages(),
    paperFormat,
    studentCount: payload.students.length,
    assignmentCount: assignmentRefs.length
  };
  doc.save(`คะแนน-${safeExportFileName(classroomName)}.pdf`);
  return result;
}

export async function exportClassroomScoreExcel(payload) {
  validateScoreExportPayload(payload, "Excel");

  const classroomName = payload.classroom.displayName;
  const assignmentRefs = buildAssignmentRefs(payload.assignments);
  const generatedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const tableRows = payload.students.map((student) => buildStudentScoreRow(student, assignmentRefs, payload.entries));
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Prompt, Tahoma, sans-serif; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d9dde3; padding: 6px; font-size: 12px; vertical-align: middle; }
    th { background: #f4f5f7; font-weight: 600; text-align: center; }
    .meta td { border: 0; font-size: 14px; }
    .name { min-width: 220px; }
    .center { text-align: center; }
  </style>
</head>
<body>
  <table class="meta">
    <tr><td colspan="${assignmentRefs.length + 4}"><strong>รายงานคะแนนนักเรียนรายห้อง</strong></td></tr>
    <tr><td colspan="${assignmentRefs.length + 4}">${escapeHtml(payload.schoolName)}</td></tr>
    <tr><td colspan="${assignmentRefs.length + 4}">${escapeHtml(classroomName)} · ปีการศึกษา ${escapeHtml(payload.classroom.academicYear)}</td></tr>
    <tr><td colspan="${assignmentRefs.length + 4}">ส่งออกเมื่อ ${escapeHtml(generatedAt)}</td></tr>
  </table>
  <table>
    <thead><tr><th>เลขที่</th><th>รหัสนักเรียน</th><th class="name">ชื่อ-นามสกุล</th>${assignmentRefs.map((assignment) => `<th>${assignment.no}</th>`).join("")}<th>รวม</th></tr></thead>
    <tbody>${tableRows.map((row) => `<tr>${row.map((cell, index) => `<td class="${index === 2 ? "name" : "center"}">${escapeHtml(String(cell))}</td>`).join("")}</tr>`).join("")}</tbody>
  </table>
  <br />
  <table>
    <thead><tr><th>รหัสงาน</th><th>ชื่องาน</th><th>ประเภท</th><th>คะแนนเต็ม</th></tr></thead>
    <tbody>${assignmentRefs.map((assignment) => `<tr><td class="center">${assignment.no}</td><td>${escapeHtml(assignment.title)}</td><td>${escapeHtml(assignment.assignmentType || "ทั่วไป")}</td><td class="center">${formatPdfScore(assignment.finalMax)}</td></tr>`).join("")}</tbody>
  </table>
</body>
</html>`;
  downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" }), `คะแนน-${safeExportFileName(classroomName)}.xls`);
}

async function ensurePromptFont(doc) {
  if (!fontReady) {
    fontReady = fetch(`${import.meta.env.BASE_URL}fonts/${FONT_FILE}`)
      .then((response) => {
        if (!response.ok) throw new Error("โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ");
        return response.arrayBuffer();
      })
      .then((buffer) => {
        doc.addFileToVFS(FONT_FILE, arrayBufferToBase64(buffer));
        doc.addFont(FONT_FILE, FONT_NAME, "normal");
      });
  } else if (!doc.getFontList()[FONT_NAME]) {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/${FONT_FILE}`);
    if (!response.ok) throw new Error("โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ");
    doc.addFileToVFS(FONT_FILE, arrayBufferToBase64(await response.arrayBuffer()));
    doc.addFont(FONT_FILE, FONT_NAME, "normal");
    return;
  }
  await fontReady;
}

function buildStudentScoreRow(student, assignmentRefs, entries) {
  const visibleScores = assignmentRefs.map((assignment) => scoreCellLabel(findScoreEntry(entries, assignment.id, student.id)));
  const studentEntries = assignmentRefs.map((assignment) => findScoreEntry(entries, assignment.id, student.id));
  const total = studentEntries.reduce((sum, entry) => sum + (scoreEntryCountsTowardTotal(entry) ? entry?.finalScore ?? 0 : 0), 0);
  const totalMax = assignmentRefs.reduce((sum, assignment, index) => sum + (scoreEntryCountsTowardTotal(studentEntries[index]) ? assignment.finalMax : 0), 0);
  return [
    String(student.no || ""),
    student.studentId,
    student.name,
    ...visibleScores,
    `${formatPdfScore(total)} / ${formatPdfScore(totalMax)}`
  ];
}

function findScoreEntry(entries, assignmentId, studentRecordId) {
  return entries.find((entry) => entry.assignmentId === assignmentId && entry.studentRecordId === studentRecordId);
}

function scoreEntryCountsTowardTotal(entry) {
  return entry?.status === "scored" || entry?.status === "expired" || entry?.status === "no_score";
}

function scoreCellLabel(entry) {
  if (!entry || entry.status === "ungraded") return "-";
  if (entry.status === "leave") return "ลา";
  if (entry.status === "expired") return "0";
  if (entry.status === "no_score") return "0";
  return formatPdfScore(entry.finalScore);
}

function buildAssignmentRefs(assignments) {
  return assignments.map((assignment, index) => ({ ...assignment, no: index + 1 }));
}

function validateScoreExportPayload(payload, format) {
  if (!payload.classroom) throw new Error(`เลือกห้องเรียนก่อนส่งออก ${format}`);
  if (!payload.students.length) throw new Error("ยังไม่มีรายชื่อนักเรียนในห้องนี้");
  if (!payload.assignments.length) throw new Error("ยังไม่มีงานคะแนนในห้องนี้");
}

function pdfPaperFormat(studentCount, assignmentCount) {
  if (studentCount > 65 || assignmentCount > 40) return "a2";
  if (studentCount > 45 || assignmentCount > 24) return "a3";
  return "a4";
}

function pdfLayoutMetrics(studentCount, assignmentCount, pageHeight, legendRowCount) {
  const denseRows = studentCount > 38 || assignmentCount > 14;
  const veryDenseRows = studentCount > 46 || assignmentCount > 22;
  const legendHeight = Math.max(8, legendRowCount * (assignmentCount > 24 ? 3.1 : 3.6));
  const availableTableHeight = pageHeight - 38 - legendHeight - 10;
  const fittedRowHeight = availableTableHeight / Math.max(1, studentCount + 2);
  return {
    tableFontSize: veryDenseRows ? 5 : denseRows ? 5.5 : 6.2,
    legendFontSize: assignmentCount > 24 ? 4.8 : 5.4,
    cellPadding: veryDenseRows ? 0.25 : denseRows ? 0.4 : 0.6,
    minCellHeight: Math.max(2.5, Math.min(3.4, fittedRowHeight))
  };
}

function pdfScoreColumnStyles(assignmentCount, pageWidth) {
  const fixedWidth = 10 + 17 + 52 + 20;
  const fitAllowance = 20;
  const assignmentWidth = Math.max(3.4, Math.min(12, (pageWidth - PDF_PAGE_MARGIN * 2 - fixedWidth - fitAllowance) / Math.max(1, assignmentCount)));
  const styles = {
    0: { cellWidth: 10, halign: "center" },
    1: { cellWidth: 17, halign: "center" },
    2: { cellWidth: 52 },
    [assignmentCount + 3]: { cellWidth: 20, halign: "center", fillColor: [250, 250, 250] }
  };
  for (let index = 0; index < assignmentCount; index += 1) {
    styles[index + 3] = { cellWidth: assignmentWidth, halign: "center" };
  }
  return styles;
}

function buildAssignmentTypeRuns(assignments) {
  return assignments.reduce((runs, assignment) => {
    const type = normalizeAssignmentType(assignment.assignmentType);
    const previous = runs[runs.length - 1];
    if (previous?.type === type) previous.count += 1;
    else runs.push({ type, count: 1 });
    return runs;
  }, []);
}

function buildAssignmentLegendRows(assignments, columnCount) {
  const rows = [];
  const perColumn = Math.ceil(assignments.length / columnCount);
  for (let rowIndex = 0; rowIndex < perColumn; rowIndex += 1) {
    const row = [];
    for (let column = 0; column < columnCount; column += 1) {
      const assignment = assignments[rowIndex + column * perColumn];
      row.push(
        assignment ? `${assignment.no}.` : "",
        assignment ? `${assignment.title} (${normalizeAssignmentType(assignment.assignmentType)} · ${formatPdfScore(assignment.finalMax)})` : ""
      );
    }
    rows.push(row);
  }
  return rows;
}

function pdfLegendColumnStyles(columnCount, pageWidth) {
  const numberWidth = 7;
  const labelWidth = (pageWidth - PDF_PAGE_MARGIN * 2 - numberWidth * columnCount) / columnCount;
  const styles = {};
  for (let column = 0; column < columnCount; column += 1) {
    styles[column * 2] = { cellWidth: numberWidth, fontStyle: "normal", textColor: [24, 24, 27], halign: "right" };
    styles[column * 2 + 1] = { cellWidth: labelWidth };
  }
  return styles;
}

function styleAssignmentCell(hook, assignments) {
  if (hook.section !== "body") return;
  const assignmentIndex = hook.column.index - 3;
  const assignment = assignments[assignmentIndex];
  if (!assignment) return;
  const color = assignmentTypeColor(assignment.assignmentType);
  hook.cell.styles.fillColor = mixWithWhite(color.fill, hook.row.index % 2 === 0 ? 0.62 : 0.76);
}

function styleLegendCell(hook, columnCount) {
  if (hook.section !== "body" || hook.column.index % 2 === 0) return;
  const assignmentIndex = hook.row.index + Math.floor(hook.column.index / 2) * Math.ceil(hook.table.body.length ? hook.table.body.length : 1);
  if (assignmentIndex < 0 || Math.floor(hook.column.index / 2) >= columnCount) return;
  const value = String(hook.cell.raw || "");
  const typeMatch = value.match(/\(([^·()]+)\s*·/);
  if (!typeMatch) return;
  const color = assignmentTypeColor(typeMatch[1].trim());
  hook.cell.styles.fillColor = mixWithWhite(color.fill, 0.68);
  hook.cell.styles.textColor = color.text;
}

function normalizeAssignmentType(value) {
  const type = String(value || "").trim();
  return type || "ทั่วไป";
}

function assignmentTypeColor(type) {
  return ASSIGNMENT_TYPE_COLORS[normalizeAssignmentType(type)] || ASSIGNMENT_TYPE_COLORS["ทั่วไป"];
}

function mixWithWhite(color, ratio) {
  return color.map((channel) => Math.round(channel + (255 - channel) * ratio));
}

function formatPdfScore(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function safeExportFileName(name) {
  return name.replace(/[^\w.\-\u0E00-\u0E7F]+/g, "-");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char]);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}
