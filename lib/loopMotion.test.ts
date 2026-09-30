import assert from "node:assert/strict";
import { test } from "node:test";
import { answerLoop, DEFAULT_LOOP, LOOP_SPEEDS, LOOP_STYLES, loopPose, normalizeLoop, resolveLoops } from "./loopMotion.ts";
import { schemaVersionFor, type Question, type QuizSettings } from "../types/quiz.ts";
const question = { id: "q", options: [] } as unknown as Question;
const global = { loopMotion: { answers: { ...DEFAULT_LOOP, style: "bounce" as const } } };

test("loop motion defaults to Off and inherits global then question then answer", () => {
  assert.deepEqual(resolveLoops({}).answers, DEFAULT_LOOP);
  assert.equal(resolveLoops(global, question).answers.style, "bounce");
  const local = { ...question, loopMotion: { answers: { ...DEFAULT_LOOP, style: "rock" as const } } };
  const resolved = resolveLoops(global, local).answers;
  assert.equal(resolved.style, "rock");
  assert.equal(answerLoop(resolved, {}).style, "rock");
  assert.equal(answerLoop(resolved, { loopMotion: { ...DEFAULT_LOOP, style: "float" } }).style, "float");
  assert.equal(answerLoop(resolved, { loopMotion: DEFAULT_LOOP }).style, "none");
  assert.equal(resolveLoops(global, { ...local, loopMotion: { answers: DEFAULT_LOOP } }).answers.style, "none");
  assert.equal(resolveLoops(global, { ...local, loopMotion: { answers: undefined } }).answers.style, "bounce");
});

test("every loop is bounded, starts at rest, and returns to rest without a jump", () => {
  const rest = { x: 0, y: 0, rotate: 0, sx: 1, sy: 1 };
  for (const style of LOOP_STYLES) {
    const motion = { ...DEFAULT_LOOP, style: style.id, amount: 10 };
    for (const t of [0, 4000, 8000]) assert.deepEqual(loopPose(motion, t), rest);
    for (let t = 0; t < 4000; t += 25) {
      const p = loopPose(motion, t);
      assert.ok(Object.values(p).every(Number.isFinite));
      assert.ok(Math.abs(p.x) <= 10 && Math.abs(p.y) <= 10);
      assert.ok(Math.abs(p.rotate) <= 5 && p.sx >= 0.96 && p.sx <= 1.04 && p.sy >= 0.96 && p.sy <= 1.04);
    }
  }
});

test("animation speeds run from playful to turbo and imported values stay in range", () => {
  assert.deepEqual(LOOP_SPEEDS.map((speed) => speed.label), ["Playful", "Energetic", "Supercharged", "Turbo"]);
  assert.deepEqual(normalizeLoop({ durationMs: -1, amount: 100 }), { style: "none", durationMs: 600, amount: 10 });
  assert.equal(normalizeLoop({ durationMs: 8000 }).durationMs, 2000);
  assert.deepEqual(normalizeLoop({ durationMs: NaN, amount: Infinity }), DEFAULT_LOOP);
});

test("loop settings require the presentation schema in exports", () => {
  assert.equal(schemaVersionFor({ settings: global as QuizSettings, questions: [question] }), 3);
  assert.equal(schemaVersionFor({ settings: {} as QuizSettings, questions: [{ ...question, options: [{ id: "a", text: "A", correct: true, loopMotion: DEFAULT_LOOP }] }] }), 3);
});

test("animation choices are alphabetic and have unique ids", () => {
  const labels = LOOP_STYLES.map((style) => style.label);
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b)));
  assert.equal(new Set(LOOP_STYLES.map((s) => s.id)).size, LOOP_STYLES.length);
});

test("bounce and dance combine without cancelling either effect and keep repeating", () => {
  const base = { ...DEFAULT_LOOP, style: "bounce" as const };
  const combo = { ...base, secondary: "dance" as const };
  const t = 617;
  const bounce = loopPose(base, t);
  const dance = loopPose({ ...base, style: "dance" }, t);
  const together = loopPose(combo, t);
  assert.equal(together.x, bounce.x + dance.x);
  assert.equal(together.y, bounce.y + dance.y);
  assert.equal(together.rotate, bounce.rotate + dance.rotate);
  assert.deepEqual(loopPose(combo, t + base.durationMs * 100), together);
  assert.deepEqual(loopPose({ ...combo, style: "none" }, t), loopPose(DEFAULT_LOOP, t));
});

test("butterfly can loop in opposite directions or fly once and remain in position", () => {
  const motion = { ...DEFAULT_LOOP, style: "butterfly" as const, direction: "alternate" as const };
  const one = loopPose(motion, 500, 0), two = loopPose(motion, 500, 1);
  assert.ok(one.x > 0 && two.x < 0);
  assert.ok(Math.abs(one.x + two.x) < 1e-10);
  const hold = { ...motion, playback: "hold" as const };
  const end = loopPose(hold, hold.durationMs);
  assert.notDeepEqual(end, loopPose(hold, 0));
  assert.deepEqual(loopPose(hold, hold.durationMs * 100), end);
  assert.notDeepEqual(loopPose(motion, 500), loopPose(motion, 1100));
});

test("all question kinds inherit and round-trip combined motion independently of gameplay", () => {
  for (const kind of ["multiple-choice", "true-false", "multi-select", "image-choice", "reveal"] as const) {
    const q = { ...question, kind, options: [{ id: "correct", text: "A", correct: true }, { id: "wrong", text: "B", correct: false }] };
    const settings = { loopMotion: { answers: { ...DEFAULT_LOOP, style: "butterfly" as const, secondary: "dance" as const, direction: "alternate" as const, playback: "loop" as const } } };
    const saved = JSON.parse(JSON.stringify({ settings, q }));
    assert.deepEqual(resolveLoops(saved.settings, saved.q).answers, settings.loopMotion.answers);
    assert.deepEqual(saved.q.options, q.options);
    assert.equal(saved.q.kind, kind);
  }
});
