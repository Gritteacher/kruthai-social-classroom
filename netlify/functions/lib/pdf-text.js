// Shared by the chat assistant; never grades or writes scores.
const MAX_SOURCE_TEXT = 60_000;

export async function extractPdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
  try {
    const document = await loadingTask.promise;
    if (document.numPages > 40) throw new Error("DOCUMENT_TOO_LONG");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const line = content.items.map((item) => ("str" in item ? item.str : "")).join(" ").trim();
      if (!line) throw new Error("PDF_HAS_NO_READABLE_TEXT");
      pages.push(`[หน้า ${pageNumber}]\n${line}`);
      limitText(pages.join("\n\n"));
    }
    return limitText(pages.join("\n\n"));
  } finally {
    await loadingTask.destroy();
  }
}

function limitText(value) {
  const text = String(value || "").replace(/\u0000/g, "").trim();
  if (text.length > MAX_SOURCE_TEXT) throw new Error("DOCUMENT_TOO_LONG");
  return text;
}
