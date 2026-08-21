import assert from "node:assert/strict";
import { test } from "node:test";
import { revealHoldSeconds, shouldAutoAdvanceAfterTimeout } from "./autoAdvance.ts";
import type { AnswerRecord } from "./store/playSession.ts";

const on = { revealAfterEach: true, autoAdvanceOnTimeout: true };

const answer = (over: Partial<AnswerRecord> = {}): AnswerRecord => ({
  questionId: "q1",
  selectedIds: [],
  correct: false,
  points: 0,
  msTaken: 20000,
  timedOut: true,
  ...over,
});

test("advances when a question times out with nothing picked", () => {
  assert.equal(shouldAutoAdvanceAfterTimeout(on, "revealed", answer()), true);
});

test("stays put when the player actually answered", () => {
  // They may want to read the explanation, so pacing stays theirs.
  assert.equal(shouldAutoAdvanceAfterTimeout(on, "revealed", answer({ timedOut: false, correct: true })), false);
});

test("does nothing before the answer is revealed", () => {
  assert.equal(shouldAutoAdvanceAfterTimeout(on, "asking", answer()), false);
  assert.equal(shouldAutoAdvanceAfterTimeout(on, "intro", answer()), false);
  assert.equal(shouldAutoAdvanceAfterTimeout(on, "results", answer()), false);
});

test("respects the setting being switched off", () => {
  assert.equal(
    shouldAutoAdvanceAfterTimeout({ ...on, autoAdvanceOnTimeout: false }, "revealed", answer()),
    false,
  );
});

test("defers to the existing path when reveal-after-each is off", () => {
  // Two timers racing to call next() would skip a whole question.
  assert.equal(shouldAutoAdvanceAfterTimeout({ ...on, revealAfterEach: false }, "revealed", answer()), false);
});

test("handles the very first question, before any answer exists", () => {
  assert.equal(shouldAutoAdvanceAfterTimeout(on, "revealed", undefined), false);
});

test("hold time defaults to 5 seconds and stays in range", () => {
  assert.equal(revealHoldSeconds({ timeoutRevealSeconds: 5 }), 5);
  assert.equal(revealHoldSeconds({ timeoutRevealSeconds: 0 }), 1, "zero would flash past");
  assert.equal(revealHoldSeconds({ timeoutRevealSeconds: -3 }), 1);
  assert.equal(revealHoldSeconds({ timeoutRevealSeconds: 999 }), 60, "capped so it can't stall");
  assert.equal(revealHoldSeconds({ timeoutRevealSeconds: NaN }), 5, "falls back to the default");
});
