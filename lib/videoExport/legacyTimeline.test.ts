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
