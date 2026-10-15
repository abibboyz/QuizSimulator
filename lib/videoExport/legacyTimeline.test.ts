import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GAME_KIND_LIST } from "../../types/quiz.ts";
import { buildTimeline } from "./timeline.ts";
import { legacyQuiz } from "./legacyFixture.ts";

/** The fields this release added to a run. Everything else has to match what main produced. */
function stripNew(timeline: ReturnType<typeof buildTimeline>) {
  const copy = JSON.parse(JSON.stringify(timeline));
  for (const run of copy.questions) {
    delete run.gameAt;
    delete run.stars;
    delete run.drag;
  }
  delete copy.results.stars;
  return copy;
}

const golden = JSON.parse(readFileSync(new URL("./legacyTimeline.golden.json", import.meta.url), "utf8")) as Record<string, unknown>;

for (const mode of ["pick-correct", "timeout"] as const) {
  test(`existing question types: ${mode} timeline is identical to the one main produced`, () => {
    const timeline = buildTimeline(legacyQuiz(), { answerMode: mode, sound: false });
    assert.deepEqual(stripNew(timeline), golden[mode]);
  });
}

test("existing question types: simulating game kinds changes nothing when there are none", () => {
  const plain = buildTimeline(legacyQuiz(), { answerMode: "pick-correct", sound: false });
  const simulated = buildTimeline(legacyQuiz(), { answerMode: "pick-correct", sound: false, simulate: GAME_KIND_LIST });
  assert.deepEqual(JSON.parse(JSON.stringify(simulated)), JSON.parse(JSON.stringify(plain)));
  assert.equal(plain.results.stars, undefined, "no Stars tile unless a star question exists");
});

test("existing question types: a game run's gameAt equals liveAt, so legacy frames never see a game clock", () => {
  for (const run of buildTimeline(legacyQuiz(), { answerMode: "pick-correct", sound: false }).questions) {
    assert.equal(run.gameAt, run.liveAt);
    assert.equal(run.stars, undefined);
    assert.equal(run.drag, undefined);
  }
});

import { buildTimeline as build } from "./timeline.ts";
import { starPoints } from "../stars.ts";
import type { Question } from "../../types/quiz.ts";

const starQuestion = (id: string, videoChoice: "star" | "go"): Question => ({
  id, kind: "star-collect", layout: "grid", prompt: id, game: { stars: 2, videoChoice },
  options: [{ id: `${id}a`, text: "A", correct: true }, { id: `${id}b`, text: "B", correct: false }],
});

test("export timeline: banked stars add points to the score, the row and the results; classic rows are untouched", () => {
  const base = legacyQuiz();
  const plain = build(base, { answerMode: "pick-correct", sound: false });
  for (const choice of ["star", "go"] as const) {
    const quiz = { ...base, questions: [...base.questions, starQuestion("s1", choice)] };
    const timeline = build(quiz, { answerMode: "pick-correct", sound: false });
    const classicRows = timeline.questions.slice(0, base.questions.length);
    assert.deepEqual(classicRows.map((r) => r.points), plain.questions.map((r) => r.points), "classic points unchanged");
    const star = timeline.questions[base.questions.length];
    const bank = starPoints(2, base.settings.pointsBase);
    // Star banks at the choice, Go banks the carried stars when the quiz ends: either way it is the last row.
    assert.equal(star.starPoints, bank, choice);
    assert.equal(timeline.results.score, plain.results.score + star.points + bank);
    assert.equal(star.scoreAfter, timeline.results.score);
    assert.equal(timeline.results.stars, 2);
  }
});

test("export timeline: letting the clock run out earns no stars and no star points", () => {
  const quiz = { ...legacyQuiz(), questions: [starQuestion("s1", "star")] };
  const timeline = build(quiz, { answerMode: "timeout", sound: false });
  assert.equal(timeline.results.score, 0);
  assert.equal(timeline.questions[0].starPoints, undefined);
});
