import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_MASCOT,
  litSteps,
  MASCOTS,
  mascotOf,
  METER_STEPS,
  PROGRESS_PULSES,
  PROGRESS_STYLES,
  MAX_PROGRESS_SEGMENTS,
  pulseMs,
  PULSE_CLASS,
  QUIZ_PROGRESS_STYLES,
  quizProgressFraction,
  showsPerQuestion,
} from "./progress.ts";

test("every style and pulse is offered exactly once", () => {
  const styles = PROGRESS_STYLES.map((s) => s.id);
  const pulses = PROGRESS_PULSES.map((p) => p.id);
  assert.deepEqual(styles, [...new Set(styles)], "no duplicate styles");
  assert.deepEqual(pulses, [...new Set(pulses)], "no duplicate pulses");
  assert.equal(styles[0], "ring", "the existing look stays the default");
  assert.equal(pulses[0], "none");
});

test("every pulse has a class, and none is genuinely still", () => {
  for (const { id } of PROGRESS_PULSES) {
    assert.equal(typeof PULSE_CLASS[id], "string", `${id} needs a class entry`);
  }
  assert.equal(PULSE_CLASS.none, "", "none must not animate");
});

test("the last light only goes out at zero", () => {
  // A meter reading empty while a second is still on the clock looks broken.
  assert.equal(litSteps(1), METER_STEPS);
  assert.equal(litSteps(0.5), 4);
  assert.equal(litSteps(0.01), 1, "a sliver still shows one light");
  assert.equal(litSteps(0), 0, "and only zero is dark");
});

test("step counts stay inside the meter", () => {
  assert.equal(litSteps(2), METER_STEPS, "clamped above");
  assert.equal(litSteps(-1), 0, "clamped below");
  assert.equal(litSteps(NaN), 0, "a bad value reads as empty, never negative");
  assert.equal(litSteps(0.5, 4), 2, "honours a custom step count");
});

test("the pulse races as time runs out", () => {
  assert.ok(pulseMs(0) < pulseMs(1), "less time left means a faster beat");
  assert.equal(pulseMs(1), 1320);
  assert.equal(pulseMs(0), 420);
  assert.equal(pulseMs(NaN), 420, "a bad value beats fast rather than stalling");
  assert.ok(pulseMs(2) >= 420 && pulseMs(2) <= 1320, "clamped");
});

test("the mascot falls back rather than rendering nothing", () => {
  assert.equal(mascotOf("🐝"), "🐝");
  assert.equal(mascotOf(""), DEFAULT_MASCOT, "blank must not render an empty meter");
  assert.equal(mascotOf("   "), DEFAULT_MASCOT, "whitespace counts as blank");
  assert.equal(mascotOf(undefined), DEFAULT_MASCOT, "and so does a quiz saved before this existed");
});

test("the mascot is a real style with suggestions behind it", () => {
  assert.ok(PROGRESS_STYLES.some((s) => s.id === "mascot"));
  assert.ok(MASCOTS.length > 0);
  assert.ok(MASCOTS.includes(DEFAULT_MASCOT), "the default should be offered in the picker");
});

/* ------------------------------------------------------- quiz-wide progress */

test("quiz progress is a plain fraction of the run, clamped", () => {
  assert.equal(quizProgressFraction(0, 10), 0);
  assert.equal(quizProgressFraction(5, 10), 0.5);
  assert.equal(quizProgressFraction(10, 10), 1);
  assert.equal(quizProgressFraction(11, 10), 1, "clamped above");
  assert.equal(quizProgressFraction(-1, 10), 0, "clamped below");
});

test("an empty or bad quiz reads as no progress rather than dividing by zero", () => {
  assert.equal(quizProgressFraction(0, 0), 0);
  assert.equal(quizProgressFraction(3, 0), 0);
  assert.equal(quizProgressFraction(NaN, 10), 0);
});

test("per-question meters degrade to a bar once they stop being readable", () => {
  assert.equal(showsPerQuestion("segments", 10), true);
  assert.equal(showsPerQuestion("dots", MAX_PROGRESS_SEGMENTS), true, "the cap itself still fits");
  assert.equal(showsPerQuestion("segments", MAX_PROGRESS_SEGMENTS + 1), false);
  assert.equal(showsPerQuestion("segments", 0), false, "an empty quiz has nothing to draw");
  assert.equal(showsPerQuestion("bar", 5), false, "only the discrete styles are per-question");
  assert.equal(showsPerQuestion("mascot", 5), false);
});

test("hiding the meter is a real choice, and every style is listed once", () => {
  const ids = QUIZ_PROGRESS_STYLES.map((s) => s.id);
  assert.deepEqual(ids, [...new Set(ids)]);
  assert.ok(ids.includes("none"), "an author must be able to turn it off");
});
