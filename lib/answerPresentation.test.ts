import assert from "node:assert/strict";
import { test } from "node:test";
import { answerTextStyle, isUnscoredImage } from "./answerPresentation.ts";
import { createQuestion, createQuiz } from "./factory.ts";
import { usePlaySession } from "./store/playSession.ts";
import { buildTimeline } from "./videoExport/timeline.ts";
import { schemaVersionFor, validateQuiz } from "../types/quiz.ts";

function imageQuiz() {
  const quiz = createQuiz("Choose your favourite");
  const question = createQuestion("image-choice");
  question.prompt = "Which do you like?";
  question.options = question.options.map((o, i) => ({ ...o, correct: false, media: { kind: "url" as const, url: `https://example.com/${i}.png` } }));
  quiz.questions = [question];
  quiz.settings.timerSeconds = 3;
  quiz.settings.cues = {};
  quiz.settings.timeoutRevealSeconds = 10;
  return quiz;
}

test("answer overrides inherit missing fields and can disable global bold and italic", () => {
  const theme = { optionTextColor: "#123456", answerStyle: { font: "georgia" as const, fontSize: 36, bold: true, italic: true } };
  assert.deepEqual(answerTextStyle(theme, { answerStyle: { bold: false, italic: false, color: "#abcdef" } }), {
    font: "georgia", fontSize: 36, bold: false, italic: false, color: "#abcdef",
  });
  assert.equal(answerTextStyle(theme, { answerStyle: { fontSize: undefined } }).fontSize, 36);
  assert.equal(answerTextStyle(theme).color, "#123456");
});

test("only image-choice accepts zero correct answers; choosing a correct image restores scoring", () => {
  const quiz = imageQuiz();
  assert.deepEqual(validateQuiz(quiz), []);
  assert.equal(isUnscoredImage(quiz.questions[0]), true);
  quiz.questions[0].kind = "reveal";
  assert.equal(isUnscoredImage(quiz.questions[0]), false);
  assert.ok(validateQuiz(quiz).some((i) => i.severity === "error"));
  quiz.questions[0].kind = "image-choice";
  quiz.questions[0].options[0].correct = true;
  assert.equal(isUnscoredImage(quiz.questions[0]), false);
  assert.deepEqual(validateQuiz(quiz), []);
  quiz.questions[0].options[1].correct = true;
  assert.ok(validateQuiz(quiz).some((i) => /exactly one/.test(i.message)));
});

test("unscored image timeout leaves score and streak intact and records a neutral result", () => {
  const quiz = imageQuiz();
  const scored = createQuestion();
  quiz.questions.unshift(scored);
  const session = usePlaySession.getState();
  session.start(quiz);
  session.begin();
  session.toggle(scored.options[0].id);
  session.submit(500);
  const before = usePlaySession.getState();
  assert.equal(before.streak, 1);
  before.next();
  usePlaySession.getState().toggle(quiz.questions[1].options[0].id);
  assert.deepEqual(usePlaySession.getState().selected, []);
  usePlaySession.getState().submit(3000, true);
  const after = usePlaySession.getState();
  assert.equal(after.score, before.score);
  assert.equal(after.streak, 1);
  assert.equal(after.answers[1].unscored, true);
  assert.equal(after.answers[1].points, 0);
  after.reset();
});

test("video shows unscored images for their timer with no feedback, reveal hold or scored denominator", () => {
  const quiz = imageQuiz();
  quiz.questions[0].celebration = { enabled: true };
  const timeline = buildTimeline(quiz, { answerMode: "pick-correct", sound: true });
  const run = timeline.questions[0];
  assert.equal(run.revealAt - run.liveAt, 3000);
  assert.ok(run.advanceAt - run.revealAt < 300);
  assert.equal(run.timeoutBar, false);
  assert.equal(timeline.results.total, 0);
  assert.equal(timeline.results.score, 0);
  assert.ok(!timeline.audio.some((a) => "recipe" in a && ["wrong", "correct", "fanfare"].includes(a.recipe)));
  assert.equal(timeline.confetti.length, 0);
});

test("mixed video results and streaks ignore unscored images", () => {
  const quiz = imageQuiz();
  quiz.questions.unshift(createQuestion());
  quiz.questions.push(createQuestion());
  const timeline = buildTimeline(quiz, { answerMode: "pick-correct", sound: false });
  assert.equal(timeline.questions[1].streakBefore, 1);
  assert.equal(timeline.questions[1].streakAfter, 1);
  assert.equal(timeline.results.total, 2);
  assert.equal(timeline.results.correctCount, 2);
  assert.equal(timeline.results.bestStreak, 2);
});

test("new typography and unscored images export as schema 6 while existing quizzes retain compatibility", () => {
  const quiz = imageQuiz();
  assert.equal(schemaVersionFor(quiz), 6);
  quiz.questions[0].options[0].correct = true;
  assert.equal(schemaVersionFor(quiz), 1);
  quiz.theme.answerStyle = { fontSize: 30 };
  assert.equal(schemaVersionFor(quiz), 6);
  delete quiz.theme.answerStyle;
  quiz.questions[0].promptStyle = { letterShape: "pinch" };
  assert.equal(schemaVersionFor(quiz), 6);
});
