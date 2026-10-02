import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuiz } from "../factory.ts";
import { buildTimeline } from "./timeline.ts";

test("video export keeps saved question and answer structure even when live shuffle is on", () => {
  const quiz = createQuiz("Saved order");
  quiz.questions = Array.from({ length: 3 }, (_, i) => ({
    id: `q${i}`,
    kind: "multiple-choice" as const,
    layout: "grid" as const,
    prompt: `Question ${i}`,
    options: Array.from({ length: 3 }, (_, j) => ({ id: `q${i}-a${j}`, text: `Answer ${j}`, correct: j === 0 })),
  }));
  quiz.settings.shuffleQuestions = true;
  quiz.settings.shuffleOptions = true;

  const runs = buildTimeline(quiz, { answerMode: "pick-correct", sound: false }).questions;
  assert.deepEqual(runs.map((run) => run.question.id), quiz.questions.map((question) => question.id));
  for (const [index, run] of runs.entries()) {
    assert.deepEqual(run.question.options.map((option) => option.id), quiz.questions[index].options.map((option) => option.id));
  }
});
