import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { jsPDF } from "jspdf";
import { validateAiGrade, isPrivateAddress, extractPdfText, extractOpenXmlText } from "../netlify/functions/grade-submission-ai-background.js";

test("accepts only explicit, bounded numeric AI grades", () => {
  const valid = { score: 8, confidence: 0.9, needs_teacher: false, feedback: "Good" };
  assert.equal(validateAiGrade(valid, 10).score, 8);
  for (const score of [null, "8", -1, 11, NaN]) {
    assert.throws(() => validateAiGrade({ ...valid, score }, 10), /AI_INVALID_SCORE/);
  }
  assert.throws(() => validateAiGrade({ ...valid, needs_teacher: true }, 10), /AI_LOW_CONFIDENCE/);
  assert.throws(() => validateAiGrade({ ...valid, confidence: 2 }, 10), /AI_INVALID_CONFIDENCE/);
  assert.throws(() => validateAiGrade({ ...valid, feedback: " " }, 10), /AI_EMPTY_FEEDBACK/);
});

test("rejects private and mapped network addresses", () => {
  for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "2001:db8::1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("reads PDF text and refuses blank pages instead of guessing", async () => {
  const pdf = new jsPDF();
  pdf.text("Homework answer", 20, 20);
  assert.match(await extractPdfText(new Uint8Array(pdf.output("arraybuffer"))), /Homework answer/);
  const blank = new jsPDF();
  await assert.rejects(extractPdfText(new Uint8Array(blank.output("arraybuffer"))), /PDF_HAS_NO_READABLE_TEXT/);
});

test("extracts office text in page order without reading unrelated files", () => {
  const bytes = zipSync({
    "ppt/slides/slide10.xml": strToU8("<t>Ten</t>"),
    "ppt/slides/slide2.xml": strToU8("<t>Two &amp; three</t>"),
    "ppt/media/image.png": strToU8("IGNORE"),
  });
  assert.equal(extractOpenXmlText(bytes, "pptx"), "Two & three\n\nTen");
  const oversized = zipSync({ "word/document.xml": strToU8("x".repeat(60001)) });
  assert.throws(() => extractOpenXmlText(oversized, "docx"), /DOCUMENT_TOO_LONG/);
});
