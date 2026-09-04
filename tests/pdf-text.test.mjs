import test from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { extractPdfText } from "../netlify/functions/lib/pdf-text.js";

test("reads PDF text and refuses blank pages instead of guessing", async () => {
  const pdf = new jsPDF();
  pdf.text("Homework answer", 20, 20);
  assert.match(await extractPdfText(new Uint8Array(pdf.output("arraybuffer"))), /Homework answer/);
  const blank = new jsPDF();
  await assert.rejects(extractPdfText(new Uint8Array(blank.output("arraybuffer"))), /PDF_HAS_NO_READABLE_TEXT/);
});
