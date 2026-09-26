import { test } from "node:test";
import assert from "node:assert/strict";
import { countdownView, elapsedFor } from "./countdown.ts";

test("regression: a new question never shows the previous question's time", () => {
  // Question 1 froze at 3.3s of a 10s timer ("7" on the ring).
  const clock = { key: "0:1000", elapsedMs: 3300 };
  assert.equal(Math.ceil(countdownView(10, elapsedFor(clock, "0:1000")).remainingMs / 1000), 7);
  // Advancing changes the key before the new clock has ticked: full timer, not "7".
  const next = countdownView(10, elapsedFor(clock, "1:5000"));
  assert.equal(next.remainingMs, 10_000);
  assert.equal(next.fraction, 1);
  assert.equal(next.urgent, false);
  // A retry of the same question index is a new run too (new session stamp).
  assert.equal(elapsedFor(clock, "0:9000"), 0);
});

test("countdownView matches the old maths for timed and untimed questions", () => {
  assert.deepEqual(countdownView(null, 1234), { elapsedMs: 1234, remainingMs: 0, fraction: 1, urgent: false });
  assert.deepEqual(countdownView(20, 15_000), { elapsedMs: 15_000, remainingMs: 5000, fraction: 0.25, urgent: true });
  assert.equal(countdownView(20, 25_000).remainingMs, 0);
  assert.equal(countdownView(0, 0).fraction, 0);
});
