import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuiz } from "./factory.ts";
import { buildTimeline } from "./videoExport/timeline.ts";
import { DEFAULT_PREVIEW_FRAME, framingFor, loopTime, PREVIEW_FRAMES, previewSegment } from "./previewFrame.ts";

function quizOf(n: number) {
  const quiz = createQuiz("Preview");
  quiz.questions = Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    kind: "multiple-choice" as const,
    layout: "grid" as const,
    prompt: `Question ${i}`,
    options: [0, 1].map((j) => ({ id: `q${i}a${j}`, text: `A${j}`, correct: j === 0 })),
  }));
  return quiz;
}

test("the builder preview stays the default; web and mobile map to the export framings", () => {
  assert.equal(DEFAULT_PREVIEW_FRAME, "builder");
  assert.equal(PREVIEW_FRAMES[0].id, "builder");
  assert.equal(framingFor("builder"), null);
  assert.equal(framingFor("web"), "horizontal");
  assert.equal(framingFor("mobile"), "vertical");
});

test("each question's segment runs from its mount to the next mount, and the last one to the results", () => {
  const timeline = buildTimeline(quizOf(3), { answerMode: "timeout", sound: false });
  const [a, b, c] = timeline.questions;
  assert.deepEqual(previewSegment(timeline, { kind: "question", index: 0 }), { start: a.mountAt, end: b.mountAt });
  assert.deepEqual(previewSegment(timeline, { kind: "question", index: 1 }), { start: b.mountAt, end: c.mountAt });
  assert.deepEqual(previewSegment(timeline, { kind: "question", index: 2 }), { start: c.mountAt, end: timeline.results.start });
  // Each segment contains its own reveal.
  for (const [i, run] of timeline.questions.entries()) {
    const seg = previewSegment(timeline, { kind: "question", index: i });
    assert.ok(run.revealAt > seg.start && run.revealAt < seg.end, `question ${i + 1} reveal is inside`);
  }
  assert.deepEqual(previewSegment(timeline, { kind: "results" }), { start: timeline.results.start, end: timeline.results.end });
  // Out of range clamps rather than throwing.
  assert.deepEqual(previewSegment(timeline, { kind: "question", index: 9 }), previewSegment(timeline, { kind: "question", index: 2 }));
});

test("looped playback wraps inside the segment", () => {
  const seg = { start: 1000, end: 4000 };
  assert.equal(loopTime(seg, 0), 1000);
  assert.equal(loopTime(seg, 2500), 3500);
  assert.equal(loopTime(seg, 3000), 1000);
  assert.equal(loopTime(seg, 7250), 2250);
  assert.equal(loopTime(seg, -500), 3500);
  assert.equal(loopTime(seg, Number.NaN), 1000);
});
