import assert from "node:assert/strict";
import { test } from "node:test";
import { ANSWER_MARK, answerMarkAt, answerMarkEllipse, fadesOtherAnswers, resolveAnswerMark } from "./answerMark.ts";
import { createQuiz, DEFAULT_SETTINGS } from "./factory.ts";
import { fixedImageColumns, imageChoiceColumns, imageChoiceGridStyle, imageChoiceTile } from "./imageChoice.ts";
import { schemaVersionFor } from "../types/quiz.ts";
import { legacyQuiz } from "./videoExport/legacyFixture.ts";

test("answer mark: a quiz saved without the setting keeps the classic look, where the others fade", () => {
  assert.deepEqual(resolveAnswerMark(undefined), { style: "classic", color: ANSWER_MARK.color });
  assert.equal(resolveAnswerMark({}).style, "classic");
  assert.equal(fadesOtherAnswers(resolveAnswerMark({})), true);
  assert.equal(DEFAULT_SETTINGS.answerMark, undefined, "storage merges DEFAULT_SETTINGS into saved quizzes, so it must not switch them");
});

const pictureQ = { kind: "image-choice" as const };

test("answer mark: new quizzes start with the circle on picture questions, which fades nothing", () => {
  const quiz = createQuiz();
  assert.equal(resolveAnswerMark(quiz.settings, pictureQ).style, "circle");
  assert.equal(resolveAnswerMark(quiz.settings, { kind: "reveal" }).style, "circle");
  assert.equal(fadesOtherAnswers(resolveAnswerMark(quiz.settings, pictureQ)), false);
});

test("answer mark: only picture questions circle; text answers keep their ticks and fading", () => {
  const settings = { answerMark: { style: "circle" as const } };
  for (const kind of ["multiple-choice", "true-false", "multi-select", "memory-flip"] as const) {
    assert.equal(resolveAnswerMark(settings, { kind }).style, "classic", kind);
    assert.equal(resolveAnswerMark(settings, { kind, answerMark: { style: "circle" } }).style, "classic", `${kind} ignores a circle override`);
  }
  assert.equal(resolveAnswerMark(settings).style, "classic", "no question, no circle");
});

test("answer mark: a question overrides the quiz, and colours fall back in order", () => {
  const settings = { answerMark: { style: "circle" as const, color: "#00ff00" } };
  assert.deepEqual(resolveAnswerMark(settings, pictureQ), { style: "circle", color: "#00ff00" });
  assert.deepEqual(resolveAnswerMark(settings, { ...pictureQ, answerMark: { style: "classic" } }), { style: "classic", color: "#00ff00" });
  assert.equal(resolveAnswerMark(settings, { ...pictureQ, answerMark: { style: "circle", color: "#123456" } }).color, "#123456");
  assert.equal(resolveAnswerMark({ answerMark: { style: "bogus" as never } }, pictureQ).style, "classic", "an unknown style falls back safely");
});

test("answer mark: nothing shows before the reveal, then the answer pops and settles while the circle draws", () => {
  assert.deepEqual(answerMarkAt(-1), { scale: 1, circle: 0 });
  assert.deepEqual(answerMarkAt(Number.NaN), { scale: 1, circle: 0 });
  assert.equal(answerMarkAt(0).scale, 1);
  assert.equal(answerMarkAt(0).circle, 0);
  const peak = Math.max(...Array.from({ length: 60 }, (_, i) => answerMarkAt(i * 10).scale));
  assert.ok(Math.abs(peak - ANSWER_MARK.peak) < 0.01, `peaks at ${peak}`);
  const settled = answerMarkAt(ANSWER_MARK.popMs + ANSWER_MARK.drawMs + 1000);
  assert.ok(Math.abs(settled.scale - ANSWER_MARK.rest) < 1e-9);
  assert.equal(settled.circle, 1);
  for (let ms = 0; ms < ANSWER_MARK.drawMs; ms += 25) assert.ok(answerMarkAt(ms + 25).circle >= answerMarkAt(ms).circle, "the circle only grows");
  assert.deepEqual(answerMarkAt(5, true), { scale: ANSWER_MARK.rest, circle: 1 }, "reduced motion lands on the end pose");
});

test("answer mark: the circle sits just outside the tile with a stroke that scales but stays readable", () => {
  const big = answerMarkEllipse(200, 120);
  assert.ok(big.rx > 100 && big.ry > 60);
  assert.ok(Math.abs(big.stroke - 120 * ANSWER_MARK.strokeShare) < 1e-9);
  assert.equal(answerMarkEllipse(10, 10).stroke, ANSWER_MARK.minStroke);
  assert.equal(answerMarkEllipse(1000, 1000).stroke, ANSWER_MARK.maxStroke);
});

test("picture grid: a set column count wins, unset keeps the automatic grid", () => {
  assert.equal(imageChoiceColumns(75), 9, "automatic grid is unchanged");
  assert.equal(imageChoiceColumns(75, 15), 15);
  assert.equal(imageChoiceColumns(4, 15), 4, "never more columns than pictures");
  assert.equal(imageChoiceColumns(75, 0), 9, "0 means automatic");
  assert.equal(fixedImageColumns(99), 20);
  assert.equal(fixedImageColumns(Number.NaN), undefined);
  assert.equal(imageChoiceGridStyle(75, 4, 15).gridTemplateColumns, "repeat(15, minmax(0, 1fr))");
  assert.equal(imageChoiceGridStyle(75, 4).gridTemplateColumns, "repeat(9, minmax(0, 1fr))");
  assert.ok(Math.abs(imageChoiceTile(75, 1500, 0, 15).w - 100) < 1e-9);
});

test("schema: the answer mark and a column count leave the stamp alone, so the main app still opens these quizzes", () => {
  const legacy = legacyQuiz();
  const before = schemaVersionFor(legacy);
  assert.equal(schemaVersionFor({ ...legacy, settings: { ...legacy.settings, answerMark: { style: "circle" } } }), before);
  const [first, ...rest] = legacy.questions;
  assert.equal(schemaVersionFor({ ...legacy, questions: [{ ...first, imageColumns: 15, answerMark: { style: "classic" } }, ...rest] }), before);
});

test("several right answers: a picture question with 2+ ticks is pick-all, validates, and stamps 12", async () => {
  const { createQuestion } = await import("./factory.ts");
  const { picksAll } = await import("./answerPresentation.ts");
  const { isAnswerCorrect } = await import("./gameTypes.ts");
  const { validateQuiz } = await import("../types/quiz.ts");
  const pic = { kind: "stored" as const, id: "p", w: 10, h: 10 };
  const q = { ...createQuestion("image-choice"), options: ["a", "b", "c", "d"].map((id) => ({ id, text: "", media: pic, correct: id === "b" || id === "d" })) };
  assert.equal(picksAll(q), true);
  assert.equal(picksAll({ ...q, options: q.options.map((o) => ({ ...o, correct: o.id === "b" })) }), false, "one tick stays a single pick");
  assert.equal(isAnswerCorrect(q, ["d", "b"]), true);
  assert.equal(isAnswerCorrect(q, ["b"]), false, "must find them all");
  const quiz = { ...legacyQuiz(), questions: [q] };
  assert.deepEqual(validateQuiz(quiz).filter((i) => i.severity === "error"), []);
  assert.equal(schemaVersionFor(quiz), 12, "older builds would refuse it, so the file says so");
});

test("circles: one by one in on-screen order by default, all at once when asked", async () => {
  const { circleDelayMs } = await import("./answerMark.ts");
  const options = ["a", "b", "c", "d"].map((id) => ({ id, text: "", correct: id !== "c" }));
  assert.deepEqual(options.map((o) => circleDelayMs({ options }, o.id)), [0, ANSWER_MARK.stepMs, 0, ANSWER_MARK.stepMs * 2]);
  assert.deepEqual(options.map((o) => circleDelayMs({ options, circleOrder: "together" }, o.id)), [0, 0, 0, 0]);
});

test("export timeline: a pick-all picture question picks every right answer", async () => {
  const { createQuestion } = await import("./factory.ts");
  const { buildTimeline } = await import("./videoExport/timeline.ts");
  const pic = { kind: "stored" as const, id: "p", w: 10, h: 10 };
  const q = { ...createQuestion("image-choice"), id: "odd", options: ["a", "b", "c"].map((id) => ({ id, text: "", media: pic, correct: id !== "b" })) };
  const run = buildTimeline({ ...legacyQuiz(), questions: [q] }, { answerMode: "pick-correct", sound: false }).questions[0];
  assert.deepEqual(run.picks.map((p) => p.optionId), ["a", "c"]);
  assert.equal(run.correct, true);
});
