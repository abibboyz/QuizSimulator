import assert from "node:assert/strict";
import { test } from "node:test";
import { isScored, isSingleAnswer, isUnscoredImage, showsFeedback } from "./answerPresentation.ts";
import { convertKind, createQuiz } from "./factory.ts";
import { buildTimeline } from "./videoExport/timeline.ts";
import { imageChoiceGridStyle, imageChoiceTile } from "./imageChoice.ts";
import { schemaVersionFor, validateQuiz, type Question, type QuestionKind, type Quiz } from "../types/quiz.ts";

const picture = (id: string) => ({ kind: "stored" as const, id, w: 800, h: 600 });

const one = (kind: QuestionKind, over: Partial<Question> = {}): Question => ({
  id: `s-${kind}`,
  kind,
  layout: "grid",
  prompt: "Say hello",
  options: [{ id: "only", text: "Hello", correct: true, ...(kind === "image-choice" || kind === "reveal" ? { media: picture("p") } : {}) }],
  ...(kind === "reveal" ? { reveal: { animation: "tiles" as const } } : {}),
  ...over,
});

const multi = (id: string): Question => ({
  id,
  kind: "multiple-choice",
  layout: "grid",
  prompt: `Question ${id}`,
  options: [
    { id: `${id}-a`, text: "Right", correct: true },
    { id: `${id}-b`, text: "Wrong", correct: false },
  ],
});

const quizOf = (questions: Question[], over: Partial<Quiz["settings"]> = {}): Quiz => {
  const quiz = createQuiz("Single");
  quiz.questions = questions;
  quiz.settings = { ...quiz.settings, ...over };
  return quiz;
};

test("isSingleAnswer: exactly one answer on MC, multi-select, image and reveal; never true/false", () => {
  for (const kind of ["multiple-choice", "multi-select", "image-choice", "reveal"] as const) {
    assert.equal(isSingleAnswer(one(kind)), true, kind);
    assert.equal(isScored(one(kind)), false, kind);
    assert.equal(showsFeedback({ revealAfterEach: false }, one(kind)), true, kind);
  }
  assert.equal(isSingleAnswer(one("true-false")), false);
  assert.equal(isSingleAnswer(multi("m")), false);
  assert.equal(isScored(multi("m")), true);
  assert.equal(showsFeedback({ revealAfterEach: false }, multi("m")), false);
  assert.equal(showsFeedback({ revealAfterEach: true }, multi("m")), true);
});

test("single image answer wins over the unscored-image path", () => {
  const unmarked = one("image-choice", { options: [{ id: "only", text: "", correct: false, media: picture("p") }] });
  assert.equal(isUnscoredImage(unmarked), false);
  assert.equal(isSingleAnswer(unmarked), true);
  const slide: Question = { ...unmarked, options: [...unmarked.options, { id: "two", text: "", correct: false, media: picture("q") }] };
  assert.equal(isUnscoredImage(slide), true);
});

test("validateQuiz: minimum 1 answer, true/false stays at 2, image/reveal single needs a picture", () => {
  for (const kind of ["multiple-choice", "multi-select", "image-choice", "reveal"] as const) {
    assert.deepEqual(validateQuiz(quizOf([one(kind)])), [], kind);
    const none = validateQuiz(quizOf([one(kind, { options: [] })]));
    assert.ok(none.some((i) => /needs at least 1 answer\./.test(i.message)), `${kind}: ${JSON.stringify(none)}`);
  }
  const tf = validateQuiz(quizOf([one("true-false")]));
  assert.ok(tf.some((i) => /needs at least 2 answers\./.test(i.message)), JSON.stringify(tf));

  for (const kind of ["image-choice", "reveal"] as const) {
    const bare = one(kind, { options: [{ id: "only", text: "Hello", correct: true }] });
    const issues = validateQuiz(quizOf([bare]));
    assert.ok(issues.some((i) => /needs a picture for its answer\./.test(i.message)), `${kind}: ${JSON.stringify(issues)}`);
  }
});

test("schema version bumps to 8 only when a question is single-answer", () => {
  assert.equal(schemaVersionFor(quizOf([multi("a")])), 1);
  assert.equal(schemaVersionFor(quizOf([multi("a"), one("multiple-choice")])), 8);
  assert.equal(schemaVersionFor(quizOf([one("true-false")])) < 8, true);
});

test("convertKind keeps a lone answer correct for every allowed kind", () => {
  const start = one("multiple-choice", { options: [{ id: "only", text: "Hello", correct: false }] });
  for (const kind of ["multi-select", "image-choice", "reveal"] as const) {
    const converted = convertKind(start, kind);
    assert.equal(converted.options.length, 1, kind);
    assert.equal(converted.options[0].correct, true, kind);
  }
  assert.equal(convertKind(start, "true-false").options.length, 2);
});

for (const answerMode of ["pick-correct", "timeout"] as const) {
  for (const revealAfterEach of [true, false]) {
    test(`export timeline (${answerMode}, reveal-after-each ${revealAfterEach ? "on" : "off"}): single answer celebrates and isn't scored`, () => {
      const quiz = quizOf([multi("a"), one("multiple-choice"), one("image-choice"), multi("b")], { revealAfterEach });
      const timeline = buildTimeline(quiz, { answerMode, sound: true });
      const [first, single, singleImage, last] = timeline.questions;
      for (const run of [single, singleImage]) {
        assert.equal(run.correct, true);
        assert.equal(run.points, 0);
        assert.equal(run.streakAfter, run.streakBefore);
        assert.equal(run.scoreAfter, run.scoreBefore);
        // The correct chime, never the wrong buzz.
        assert.ok(timeline.audio.some((e) => "recipe" in e && e.recipe === "correct" && e.at === run.revealAt));
        assert.ok(!timeline.audio.some((e) => "recipe" in e && e.recipe === "wrong" && e.at === run.revealAt));
        // Feedback hold even with reveal-after-each off: the run waits after the reveal.
        assert.ok(run.advanceAt > run.revealAt);
      }
      if (answerMode === "timeout") assert.equal(single.timedOut, true);
      // Excluded from Correct x/y.
      assert.equal(timeline.results.total, 2);
      const multiCorrect = [first, last].filter((r) => r.correct).length;
      assert.equal(timeline.results.correctCount, multiCorrect);
      // The streak passes straight through the single answers.
      assert.equal(last.streakBefore, first.streakAfter);
    });
  }
}

test("multi-answer timeline is unchanged by single-answer support", () => {
  const quiz = quizOf([multi("a"), multi("b")], { revealAfterEach: false });
  const timeline = buildTimeline(quiz, { answerMode: "timeout", sound: true });
  for (const run of timeline.questions) {
    assert.equal(run.correct, false);
    assert.ok(timeline.audio.some((e) => "recipe" in e && e.recipe === "wrong" && e.at === run.revealAt));
  }
  assert.equal(timeline.results.total, 2);
});

test("a lone picture keeps the size of one of a pair, centred (DOM grid and export agree)", () => {
  assert.deepEqual(imageChoiceTile(1, 812, 12), { w: 400, offset: 206 });
  assert.deepEqual(imageChoiceTile(2, 812, 12), { w: 400, offset: 0 });
  assert.equal(imageChoiceGridStyle(1, 12).gridTemplateColumns, "minmax(0, calc((100% - 12px) / 2))");
  assert.equal(imageChoiceGridStyle(1, 12).justifyContent, "center");
  assert.deepEqual(imageChoiceGridStyle(4, 12), { display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" });
});
