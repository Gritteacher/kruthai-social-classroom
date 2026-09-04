import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
test("grading workers and custom endpoint rewrites are absent", () => {
  const config = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  for (const worker of ["grade-submission-ai-background", "grade-worksheet-ai-background"]) {
    assert.equal(existsSync(new URL("../netlify/functions/" + worker + ".js", import.meta.url)), false);
    assert.ok(!config.includes(worker));
  }
});

test("submission and worksheet clients contain no AI grading requests or polling", () => {
  for (const path of ["src/App.tsx", "src/features/worksheets/WorksheetHub.tsx", "src/features/worksheets/WorksheetTeacherTools.tsx", "src/features/worksheets/service.ts"]) {
    const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /requestSubmissionAiGrade|requestAiGrade|queueWorksheetAiReview|fetchWorksheetAiReviews|submission_ai_reviews|grade-.*-ai-background|SubmissionAiStatus/);
  }
});
